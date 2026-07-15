"""
WhatsApp API Routes
Flask Blueprint for WhatsApp Cloud API integration.
Handles sending messages, webhook verification, and incoming event processing.
All WhatsApp credentials are read from environment variables only.
"""
import sys
import uuid
import traceback
from flask import Blueprint, request, jsonify
import firebase_config  # ensures Firebase app is initialized
from firebase_admin import firestore as admin_firestore
from whatsapp_service import (
    send_text_message,
    send_image_message,
    send_document_message,
    validate_phone,
    get_status_notification_message,
    download_media,
    upload_to_firebase_storage,
    get_media_extension,
    WHATSAPP_VERIFY_TOKEN,
    ALLOWED_MIME_TYPES,
)

whatsapp_bp = Blueprint('whatsapp', __name__)

# Connect to the named 'vendbeesdb' database (same database the frontend uses)
vendbeesdb = admin_firestore.client(database_id='vendbeesdb')


# --------------------------------------------------
# FIRESTORE HELPERS
# --------------------------------------------------

def _build_chat_doc(message_id, ticket_id, sender_type, sender_phone, message, 
                    message_type='text', status='sending', whatsapp_message_id=None,
                    meta_conversation_id=None, meta_media_id=None, media_url=None,
                    storage_path=None, mime_type=None, file_name=None, file_size=None,
                    duration=None, caption=None, reply_to_message_id=None,
                    delivery_status=None, read_status=None):
    """Build a complete chat document mapping exactly to the 23-field schema."""
    return {
        'messageId': message_id,
        'ticketId': ticket_id,
        'senderType': sender_type,
        'senderPhone': sender_phone,
        'message': message,
        'messageType': message_type,
        'timestamp': admin_firestore.SERVER_TIMESTAMP,
        'status': status,
        'whatsappMessageId': whatsapp_message_id,
        'metaConversationId': meta_conversation_id,
        'metaMediaId': meta_media_id,
        'mediaUrl': media_url,
        'storagePath': storage_path,
        'mimeType': mime_type,
        'fileName': file_name,
        'fileSize': file_size,
        'duration': duration,
        'caption': caption,
        'replyToMessageId': reply_to_message_id,
        'deliveryStatus': delivery_status or status,
        'readStatus': read_status or ('read' if status == 'read' else 'unread'),
        'createdAt': admin_firestore.SERVER_TIMESTAMP,
        'updatedAt': admin_firestore.SERVER_TIMESTAMP,
    }


def _store_outgoing_message(ticket_id, phone, message, doc_id, status='sent'):
    """Store an outgoing (admin) message in tickets/{ticketId}/chats/{docId}."""
    doc_data = _build_chat_doc(
        message_id=doc_id,
        ticket_id=ticket_id,
        sender_type='admin',
        sender_phone=None,
        message=message,
        message_type='text',
        status=status,
        whatsapp_message_id=None
    )
    vendbeesdb.collection('tickets').document(ticket_id) \
        .collection('chats').document(doc_id).set(doc_data)
    return doc_id


def _store_incoming_message(ticket_id, phone, message, whatsapp_message_id,
                           sender_name='Student', message_type='text',
                           media_url=None, mime_type=None, file_name=None,
                           file_size=None, duration=None, caption=None,
                           latitude=None, longitude=None, reply_to_message_id=None,
                           meta_conversation_id=None, meta_media_id=None,
                           storage_path=None):
    """Store an incoming (student) message in tickets/{ticketId}/chats/{docId}."""
    doc_id = whatsapp_message_id or str(uuid.uuid4())
    doc_data = _build_chat_doc(
        message_id=doc_id,
        ticket_id=ticket_id,
        sender_type='student',
        sender_phone=phone,
        message=message,
        message_type=message_type,
        status='received',
        whatsapp_message_id=whatsapp_message_id,
        meta_conversation_id=meta_conversation_id,
        meta_media_id=meta_media_id,
        media_url=media_url,
        storage_path=storage_path,
        mime_type=mime_type,
        file_name=file_name,
        file_size=file_size,
        duration=duration,
        caption=caption,
        reply_to_message_id=reply_to_message_id
    )
    
    # Store coordinates separately if present
    if latitude is not None:
        doc_data['latitude'] = latitude
    if longitude is not None:
        doc_data['longitude'] = longitude
        
    vendbeesdb.collection('tickets').document(ticket_id) \
        .collection('chats').document(doc_id).set(doc_data)
    return doc_id


def _store_message_mapping(whatsapp_message_id, ticket_id, chat_doc_id):
    """Store whatsappMessageId → (ticketId, chatDocId) mapping for webhook status lookups."""
    vendbeesdb.collection('whatsapp_message_map').document(whatsapp_message_id).set({
        'ticketId': ticket_id,
        'chatDocId': chat_doc_id,
    })


def _find_ticket_by_phone(phone_raw):
    """
    Find the most recent active ticket for a given phone number.
    Checks the whatsappConversations mapping first for O(1) lookup,
    then falls back to querying the tickets collection.
    Returns (ticket_doc_id, ticket_data) or (None, None).
    """
    digits = ''.join(c for c in str(phone_raw) if c.isdigit())

    # Build all plausible formats of this number
    formats_to_try = set()
    formats_to_try.add(digits)                 # As-is:  918610579379 or 8610579379
    if len(digits) > 10:
        formats_to_try.add(digits[-10:])        # Strip country code: 8610579379
    if len(digits) == 10:
        formats_to_try.add('91' + digits)       # Add India code: 918610579379
    if digits.startswith('91') and len(digits) == 12:
        formats_to_try.add(digits[2:])          # Strip 91: 8610579379
    if digits.startswith('0') and len(digits) == 11:
        formats_to_try.add(digits[1:])          # Strip leading 0

    print(f"[WHATSAPP] Searching ticket for phone variants: {formats_to_try}", file=sys.stderr, flush=True)

    # --- Fast path: check NEW whatsappConversations collection (indexed by studentPhone) ---
    for fmt in formats_to_try:
        try:
            convs = list(
                vendbeesdb.collection('whatsappConversations')
                .where('studentPhone', '==', fmt)
                .limit(1)
                .get()
            )
            if convs:
                conv_data = convs[0].to_dict()
                mapped_ticket_id = conv_data.get('ticketId')
                if mapped_ticket_id:
                    ticket_snap = vendbeesdb.collection('tickets').document(mapped_ticket_id).get()
                    if ticket_snap.exists:
                        print(f"[WHATSAPP] Fast-path (new): found ticket {mapped_ticket_id} via whatsappConversations", file=sys.stderr, flush=True)
                        return ticket_snap.id, ticket_snap.to_dict()
        except Exception as e:
            print(f"[WHATSAPP] whatsappConversations lookup error for {fmt}: {e}", file=sys.stderr, flush=True)

    # --- Fast path: check OLD whatsapp_conversations collection (phone as doc ID) ---
    for fmt in formats_to_try:
        try:
            conv_doc = vendbeesdb.collection('whatsapp_conversations').document(fmt).get()
            if conv_doc.exists:
                conv_data = conv_doc.to_dict()
                mapped_ticket_id = conv_data.get('ticketId')
                if mapped_ticket_id:
                    ticket_snap = vendbeesdb.collection('tickets').document(mapped_ticket_id).get()
                    if ticket_snap.exists:
                        print(f"[WHATSAPP] Fast-path (legacy): found ticket {mapped_ticket_id} via whatsapp_conversations", file=sys.stderr, flush=True)
                        return ticket_snap.id, ticket_snap.to_dict()
        except Exception as e:
            print(f"[WHATSAPP] Legacy conversation mapping lookup error for {fmt}: {e}", file=sys.stderr, flush=True)

    # --- Slow path: query tickets collection by mobileNumber ---
    for fmt in formats_to_try:
        try:
            tickets = list(
                vendbeesdb.collection('tickets')
                .where('mobileNumber', '==', fmt)
                .get()
            )
            if tickets:
                # Prefer active (not locked) tickets, then most recent
                active = [t for t in tickets if not t.to_dict().get('statusLocked')]
                target = active[0] if active else tickets[0]
                print(f"[WHATSAPP] Slow-path: found ticket {target.id} via mobileNumber={fmt}", file=sys.stderr, flush=True)
                return target.id, target.to_dict()
        except Exception as e:
            print(f"[WHATSAPP] Error querying tickets for mobileNumber={fmt}: {e}", file=sys.stderr, flush=True)

    # --- Also try phoneNumber field (alternative schema) ---
    for fmt in formats_to_try:
        try:
            tickets = list(
                vendbeesdb.collection('tickets')
                .where('phoneNumber', '==', fmt)
                .get()
            )
            if tickets:
                active = [t for t in tickets if not t.to_dict().get('statusLocked')]
                target = active[0] if active else tickets[0]
                print(f"[WHATSAPP] Slow-path: found ticket {target.id} via phoneNumber={fmt}", file=sys.stderr, flush=True)
                return target.id, target.to_dict()
        except Exception as e:
            print(f"[WHATSAPP] Error querying tickets for phoneNumber={fmt}: {e}", file=sys.stderr, flush=True)

    print(f"[WHATSAPP] No ticket found for any phone format: {formats_to_try}", file=sys.stderr, flush=True)
    return None, None


def _update_message_status(whatsapp_message_id, new_status):
    """Update delivery status of an outgoing message using the message mapping collection."""
    try:
        mapping_doc = vendbeesdb.collection('whatsapp_message_map') \
            .document(whatsapp_message_id).get()
        
        if not mapping_doc.exists:
            print(f"[WHATSAPP] No mapping found for message {whatsapp_message_id}", file=sys.stderr, flush=True)
            return
        
        mapping = mapping_doc.to_dict()
        ticket_id = mapping.get('ticketId')
        chat_doc_id = mapping.get('chatDocId')
        
        if not ticket_id or not chat_doc_id:
            return
        
        chat_ref = vendbeesdb.collection('tickets').document(ticket_id) \
            .collection('chats').document(chat_doc_id)
        chat_doc = chat_ref.get()
        
        if not chat_doc.exists:
            return
        
        current_status = chat_doc.to_dict().get('status', '')
        status_order = {'sending': 0, 'sent': 1, 'delivered': 2, 'read': 3, 'failed': -1}
        current_rank = status_order.get(current_status, -2)
        new_rank = status_order.get(new_status, -2)
        
        # Only update if progressing forward, or if marking as failed
        if new_status == 'failed' or new_rank > current_rank:
            updates = {
                'status': new_status,
                'deliveryStatus': new_status,
                'updatedAt': admin_firestore.SERVER_TIMESTAMP
            }
            if new_status == 'read':
                updates['readStatus'] = 'read'
            chat_ref.update(updates)
            print(f"[WHATSAPP] Message {whatsapp_message_id}: {current_status} -> {new_status}",
                  file=sys.stderr, flush=True)
    except Exception as e:
        print(f"[WHATSAPP] Error updating message status: {e}", file=sys.stderr, flush=True)


# --------------------------------------------------
# API ENDPOINTS
# --------------------------------------------------

@whatsapp_bp.route('/api/whatsapp/send', methods=['POST'])
def send_message():
    """
    Send a WhatsApp text message to a student.
    Request:  { ticketId, phone, message }
    Response: { success, messageId } or { success: false, error }
    """
    data = request.get_json()
    if not data:
        return jsonify({'success': False, 'error': 'Request body is required.'}), 400
    
    ticket_id = data.get('ticketId')
    phone = data.get('phone')
    message = data.get('message')
    
    if not ticket_id:
        return jsonify({'success': False, 'error': 'ticketId is required.'}), 400
    if not phone:
        return jsonify({'success': False, 'error': 'phone is required.'}), 400
    if not message:
        return jsonify({'success': False, 'error': 'message is required.'}), 400
    
    # Validate phone number
    is_valid, normalized_phone, phone_error = validate_phone(phone)
    if not is_valid:
        return jsonify({'success': False, 'error': phone_error}), 400
    
    # Store message with 'sending' status (frontend Firestore listener sees it immediately)
    temp_id = str(uuid.uuid4())
    _store_outgoing_message(ticket_id, normalized_phone, message, temp_id, status='sending')
    
    # Send via WhatsApp Cloud API
    result = send_text_message(normalized_phone, message)
    
    if result['success']:
        whatsapp_msg_id = result.get('messageId')
        # Update with real WhatsApp message ID and 'sent' status
        vendbeesdb.collection('tickets').document(ticket_id) \
            .collection('chats').document(temp_id).update({
                'status': 'sent',
                'whatsappMessageId': whatsapp_msg_id,
            })
        # Store mapping for webhook status updates
        if whatsapp_msg_id:
            _store_message_mapping(whatsapp_msg_id, ticket_id, temp_id)
        print(f"[WHATSAPP] Sent to {normalized_phone} for ticket {ticket_id}: {whatsapp_msg_id}",
              file=sys.stderr, flush=True)
        return jsonify({'success': True, 'messageId': whatsapp_msg_id}), 200
    else:
        # Mark message as failed
        vendbeesdb.collection('tickets').document(ticket_id) \
            .collection('chats').document(temp_id).update({'status': 'failed'})
        error_msg = result.get('error', 'Failed to send message.')
        print(f"[WHATSAPP] Send failed for {normalized_phone}: {error_msg}",
              file=sys.stderr, flush=True)
        return jsonify({'success': False, 'error': error_msg}), 502


@whatsapp_bp.route('/api/whatsapp/notify', methods=['POST'])
def send_status_notification():
    """
    Send automatic WhatsApp notification when complaint status changes.
    Request:  { ticketId, status, phone, studentName, ticketDisplayId,
                issueType, machineId, complaintText }
    Response: { success, messageId } or { success: false, error }
    """
    data = request.get_json()
    if not data:
        return jsonify({'success': False, 'error': 'Request body is required.'}), 400

    ticket_id = data.get('ticketId')
    status = data.get('status')
    phone = data.get('phone')
    student_name = data.get('studentName', 'Student')
    ticket_display_id = data.get('ticketDisplayId') or ticket_id

    # Additional context from frontend for issue-type-specific messages
    issue_type_hint = data.get('issueType', '')
    machine_id_hint = data.get('machineId', '')
    complaint_text_hint = data.get('complaintText', '')

    if not ticket_id or not status or not phone:
        return jsonify({'success': False, 'error': 'ticketId, status, and phone are required.'}), 400

    # Fetch full ticket details from Firestore to build context-aware template
    try:
        ticket_doc = vendbeesdb.collection('tickets').document(ticket_id).get()
        if ticket_doc.exists:
            complaint_data = ticket_doc.to_dict()
            # Always use the stored display ticket_id for customer-facing messages
            complaint_data['ticket_id'] = (
                complaint_data.get('ticketId') or
                complaint_data.get('ticket_id') or
                ticket_display_id
            )
            complaint_data['ticketId'] = complaint_data['ticket_id']
        else:
            complaint_data = {
                'ticket_id': ticket_display_id,
                'ticketId': ticket_display_id,
                'fullName': student_name,
                'mobileNumber': phone,
                'status': status,
            }
    except Exception as e:
        print(f"[WHATSAPP] Error fetching ticket doc for notification: {e}", file=sys.stderr, flush=True)
        complaint_data = {
            'ticket_id': ticket_display_id,
            'ticketId': ticket_display_id,
            'fullName': student_name,
            'mobileNumber': phone,
            'status': status,
        }

    # Overlay hints from frontend if Firestore fields are missing
    if issue_type_hint and not complaint_data.get('issueType') and not complaint_data.get('issue_type'):
        complaint_data['issueType'] = issue_type_hint
    if machine_id_hint and not complaint_data.get('machineId') and not complaint_data.get('machine_id'):
        complaint_data['machineId'] = machine_id_hint
    if complaint_text_hint and not complaint_data.get('complaintText') and not complaint_data.get('issue_detail'):
        complaint_data['complaintText'] = complaint_text_hint

    from notification_builder import NotificationBuilder
    message = NotificationBuilder.build_notification(complaint_data, status)
    if not message:
        return jsonify({'success': False, 'error': f'No notification message generated for status: {status}'}), 400

    
    # Validate phone
    is_valid, normalized_phone, phone_error = validate_phone(phone)
    if not is_valid:
        return jsonify({'success': False, 'error': phone_error}), 400
    
    # Store with 'sending' status
    temp_id = str(uuid.uuid4())
    _store_outgoing_message(ticket_id, normalized_phone, message, temp_id, status='sending')
    
    # Send via WhatsApp
    result = send_text_message(normalized_phone, message)
    
    if result['success']:
        whatsapp_msg_id = result.get('messageId')
        vendbeesdb.collection('tickets').document(ticket_id) \
            .collection('chats').document(temp_id).update({
                'status': 'sent',
                'whatsappMessageId': whatsapp_msg_id,
            })
        if whatsapp_msg_id:
            _store_message_mapping(whatsapp_msg_id, ticket_id, temp_id)
        print(f"[WHATSAPP] Notification ({status}) sent for {ticket_display_id}",
              file=sys.stderr, flush=True)
        return jsonify({'success': True, 'messageId': whatsapp_msg_id}), 200
    else:
        vendbeesdb.collection('tickets').document(ticket_id) \
            .collection('chats').document(temp_id).update({'status': 'failed'})
        error_msg = result.get('error', 'Failed to send notification.')
        print(f"[WHATSAPP] Notification failed for {ticket_display_id}: {error_msg}",
              file=sys.stderr, flush=True)
        return jsonify({'success': False, 'error': error_msg}), 502


# --------------------------------------------------
# WEBHOOK ENDPOINTS
# --------------------------------------------------

@whatsapp_bp.route('/webhook/whatsapp', methods=['GET'])
def verify_webhook():
    """
    Webhook verification endpoint for Meta.
    Meta sends GET with hub.mode, hub.verify_token, hub.challenge.
    """
    mode = request.args.get('hub.mode')
    token = request.args.get('hub.verify_token')
    challenge = request.args.get('hub.challenge')
    
    from whatsapp_service import reload_whatsapp_config
    _, _, _, _, verify_token, _ = reload_whatsapp_config()
    
    if mode == 'subscribe' and token == verify_token:
        print(f"[WHATSAPP] Webhook verified successfully.", file=sys.stderr, flush=True)
        return challenge, 200
    else:
        print(f"[WHATSAPP] Webhook verification failed. Token mismatch.", file=sys.stderr, flush=True)
        return 'Forbidden', 403


@whatsapp_bp.route('/webhook/whatsapp', methods=['POST'])
def handle_webhook():
    """
    Handle incoming webhook events from Meta WhatsApp.
    Processes incoming messages and delivery status updates.
    Always returns 200 to acknowledge receipt (Meta requirement).
    """
    payload = request.get_json()
    if not payload:
        return 'OK', 200
    
    try:
        for entry in payload.get('entry', []):
            for change in entry.get('changes', []):
                value = change.get('value', {})
                
                # Process incoming messages from students
                for msg in value.get('messages', []):
                    _process_incoming_message(msg, value)
                
                # Process delivery status updates (sent/delivered/read/failed)
                for status_event in value.get('statuses', []):
                    _process_status_update(status_event)
    except Exception as e:
        print(f"[WHATSAPP] Webhook processing error: {e}", file=sys.stderr, flush=True)
        traceback.print_exc(file=sys.stderr)
    
    # Always return 200 to prevent Meta from retrying
    return 'OK', 200


def _process_incoming_message(msg, value):
    """Process a single incoming WhatsApp message from a student."""
    sender_phone = msg.get('from', '')
    whatsapp_msg_id = msg.get('id', '')
    msg_type = msg.get('type', 'text')

    # Find which ticket this message belongs to (needed for media storage path)
    ticket_id, ticket_data = _find_ticket_by_phone(sender_phone)

    # Default media metadata
    media_url = None
    mime_type = None
    file_name = None
    file_size = None
    duration = None
    caption = None
    latitude = None
    longitude = None
    meta_media_id = None
    storage_path = None
    message_type = msg_type  # will be stored in Firestore as-is
    
    reply_to_message_id = msg.get('context', {}).get('id')
    meta_conversation_id = value.get('metadata', {}).get('display_phone_number')

    # ------- TEXT -------
    if msg_type == 'text':
        message_text = msg.get('text', {}).get('body', '')

    # ------- IMAGE -------
    elif msg_type == 'image':
        image_data = msg.get('image', {})
        media_id = image_data.get('id')
        caption = image_data.get('caption', '')
        mime_type = image_data.get('mime_type', 'image/jpeg')
        message_text = caption or '[Image received]'
        if media_id and ticket_id:
            dl = download_media(media_id)
            if dl['success']:
                ext = get_media_extension(dl['mime_type'])
                mime_type = dl['mime_type']
                file_name = f"image{ext}"
                file_size = dl['file_size']
                upload = upload_to_firebase_storage(dl['content_bytes'], mime_type, file_name, ticket_id, 'whatsapp/student/images')
                if upload['success']:
                    media_url = upload['download_url']
                    storage_path = upload.get('storage_path')
                    meta_media_id = media_id
                else:
                    print(f"[WHATSAPP] Image upload failed: {upload['error']}", file=sys.stderr, flush=True)
            else:
                print(f"[WHATSAPP] Image download failed: {dl['error']}", file=sys.stderr, flush=True)

    # ------- AUDIO -------
    elif msg_type == 'audio':
        audio_data = msg.get('audio', {})
        media_id = audio_data.get('id')
        mime_type = audio_data.get('mime_type', 'audio/ogg')
        message_text = '[Voice note received]'
        if media_id and ticket_id:
            dl = download_media(media_id)
            if dl['success']:
                ext = get_media_extension(dl['mime_type'])
                mime_type = dl['mime_type']
                file_name = f"audio{ext}"
                file_size = dl['file_size']
                upload = upload_to_firebase_storage(dl['content_bytes'], mime_type, file_name, ticket_id, 'whatsapp/student/audio')
                if upload['success']:
                    media_url = upload['download_url']
                    storage_path = upload.get('storage_path')
                    meta_media_id = media_id
                else:
                    print(f"[WHATSAPP] Audio upload failed: {upload['error']}", file=sys.stderr, flush=True)
            else:
                print(f"[WHATSAPP] Audio download failed: {dl['error']}", file=sys.stderr, flush=True)

    # ------- VIDEO -------
    elif msg_type == 'video':
        video_data = msg.get('video', {})
        media_id = video_data.get('id')
        caption = video_data.get('caption', '')
        mime_type = video_data.get('mime_type', 'video/mp4')
        message_text = caption or '[Video received]'
        if media_id and ticket_id:
            dl = download_media(media_id)
            if dl['success']:
                ext = get_media_extension(dl['mime_type'])
                mime_type = dl['mime_type']
                file_name = f"video{ext}"
                file_size = dl['file_size']
                upload = upload_to_firebase_storage(dl['content_bytes'], mime_type, file_name, ticket_id, 'whatsapp/student/video')
                if upload['success']:
                    media_url = upload['download_url']
                    storage_path = upload.get('storage_path')
                    meta_media_id = media_id
                else:
                    print(f"[WHATSAPP] Video upload failed: {upload['error']}", file=sys.stderr, flush=True)
            else:
                print(f"[WHATSAPP] Video download failed: {dl['error']}", file=sys.stderr, flush=True)

    # ------- DOCUMENT -------
    elif msg_type == 'document':
        doc_data = msg.get('document', {})
        media_id = doc_data.get('id')
        caption = doc_data.get('caption', '')
        mime_type = doc_data.get('mime_type', 'application/pdf')
        file_name = doc_data.get('filename', 'document')
        message_text = caption or f'[Document: {file_name}]'
        if media_id and ticket_id:
            dl = download_media(media_id)
            if dl['success']:
                mime_type = dl['mime_type']
                file_size = dl['file_size']
                upload = upload_to_firebase_storage(dl['content_bytes'], mime_type, file_name, ticket_id, 'whatsapp/student/documents')
                if upload['success']:
                    media_url = upload['download_url']
                    storage_path = upload.get('storage_path')
                    meta_media_id = media_id
                else:
                    print(f"[WHATSAPP] Document upload failed: {upload['error']}", file=sys.stderr, flush=True)
            else:
                print(f"[WHATSAPP] Document download failed: {dl['error']}", file=sys.stderr, flush=True)

    # ------- LOCATION -------
    elif msg_type == 'location':
        loc = msg.get('location', {})
        latitude = loc.get('latitude')
        longitude = loc.get('longitude')
        loc_name = loc.get('name', '')
        loc_address = loc.get('address', '')
        parts = [p for p in [loc_name, loc_address] if p]
        message_text = f"[Location: {latitude}, {longitude}]"
        if parts:
            message_text += f" {', '.join(parts)}"

    # ------- CONTACTS -------
    elif msg_type == 'contacts':
        contacts_list = msg.get('contacts', [])
        if contacts_list:
            contact = contacts_list[0]
            contact_name = contact.get('name', {}).get('formatted_name', 'Unknown')
            phones = contact.get('phones', [])
            contact_phone = phones[0].get('phone', '') if phones else ''
            message_text = f"[Contact: {contact_name} {contact_phone}]"
        else:
            message_text = '[Contact received]'

    # ------- REACTION -------
    elif msg_type == 'reaction':
        message_text = f"[Reaction: {msg.get('reaction', {}).get('emoji', '')}]"

    # ------- INTERACTIVE -------
    elif msg_type == 'interactive':
        interactive = msg.get('interactive', {})
        if interactive.get('type') == 'button_reply':
            message_text = interactive.get('button_reply', {}).get('title', '[Button reply]')
        elif interactive.get('type') == 'list_reply':
            message_text = interactive.get('list_reply', {}).get('title', '[List reply]')
        else:
            message_text = '[Interactive message]'

    # ------- UNKNOWN -------
    else:
        message_text = f'[{msg_type} message]'

    # Store the message if a ticket was found
    if ticket_id:
        chat_doc_id = _store_incoming_message(
            ticket_id, sender_phone, message_text, whatsapp_msg_id,
            message_type=message_type, media_url=media_url,
            mime_type=mime_type, file_name=file_name,
            file_size=file_size, duration=duration, caption=caption,
            latitude=latitude, longitude=longitude,
            reply_to_message_id=reply_to_message_id,
            meta_conversation_id=meta_conversation_id,
            meta_media_id=meta_media_id,
            storage_path=storage_path
        )
        # Store message ID mapping so webhook status events can update this message
        if whatsapp_msg_id and chat_doc_id:
            _store_message_mapping(whatsapp_msg_id, ticket_id, chat_doc_id)
        # Update conversation mapping using both full and short phone formats for fast future lookups
        _update_conversation_mapping(sender_phone, ticket_id,
                                     whatsapp_msg_id or str(uuid.uuid4()), 'student')
        print(f"[WHATSAPP] Incoming {msg_type} from {sender_phone} stored for ticket {ticket_id} (chatDocId={chat_doc_id})",
              file=sys.stderr, flush=True)
    else:
        print(f"[WHATSAPP] No ticket found for phone {sender_phone}. Message NOT stored.",
              file=sys.stderr, flush=True)


def _process_status_update(status_event):
    """Process a delivery status update (sent/delivered/read/failed) from Meta."""
    whatsapp_msg_id = status_event.get('id', '')
    status = status_event.get('status', '')
    
    status_mapping = {
        'sent': 'sent',
        'delivered': 'delivered',
        'read': 'read',
        'failed': 'failed',
    }
    
    mapped_status = status_mapping.get(status)
    if mapped_status and whatsapp_msg_id:
        _update_message_status(whatsapp_msg_id, mapped_status)


# --------------------------------------------------
# CONVERSATION MAPPING HELPER
# --------------------------------------------------

def _update_conversation_mapping(phone, ticket_id, doc_id, sender, ticket_data=None):
    """
    Write to the new production 'whatsappConversations' collection.
    Document ID = UUID (never a phone number).
    Indexed by studentPhone for fast lookup in _find_ticket_by_phone.
    Also upserts the legacy 'whatsapp_conversations' collection for
    backward compatibility during the migration window.
    """
    digits = ''.join(c for c in str(phone) if c.isdigit())
    # Local 10-digit form
    local_phone = digits[-10:] if len(digits) >= 10 else digits

    # Extract student name from ticket_data if provided
    student_name = ''
    if ticket_data:
        student_name = (
            ticket_data.get('fullName') or
            ticket_data.get('studentName') or
            ticket_data.get('student', {}).get('name', '') or
            ''
        )

    # ── New collection: whatsappConversations (UUID doc IDs) ──────────────
    # Check if a document for this phone already exists
    new_payload = {
        'ticketId': ticket_id,
        'studentPhone': local_phone,
        'studentPhoneFull': digits,
        'studentName': student_name,
        'lastMessageId': doc_id,
        'lastMessageAt': admin_firestore.SERVER_TIMESTAMP,
        'lastSender': sender,
        'updatedAt': admin_firestore.SERVER_TIMESTAMP,
    }
    try:
        # Try to find existing conversation doc for this phone
        existing = list(
            vendbeesdb.collection('whatsappConversations')
            .where('studentPhone', '==', local_phone)
            .limit(1)
            .get()
        )
        if existing:
            # Update existing document
            vendbeesdb.collection('whatsappConversations').document(existing[0].id).set(
                new_payload, merge=True
            )
        else:
            # Create new document with UUID
            conv_id = str(uuid.uuid4())
            new_payload['conversationId'] = conv_id
            new_payload['createdAt'] = admin_firestore.SERVER_TIMESTAMP
            new_payload['status'] = 'active'
            vendbeesdb.collection('whatsappConversations').document(conv_id).set(new_payload)
    except Exception as e:
        print(f"[WHATSAPP] Error updating whatsappConversations for {local_phone}: {e}", file=sys.stderr, flush=True)

    # ── Legacy collection: whatsapp_conversations (phone as doc ID) ───────
    # Keep writing here so existing fast-path lookups still work
    legacy_payload = {
        'phone': digits,
        'ticketId': ticket_id,
        'lastMessageId': doc_id,
        'lastMessageAt': admin_firestore.SERVER_TIMESTAMP,
        'lastSender': sender,
    }
    for fmt in {digits, local_phone}:
        try:
            vendbeesdb.collection('whatsapp_conversations').document(fmt).set(legacy_payload, merge=True)
        except Exception as e:
            print(f"[WHATSAPP] Error updating legacy conversation mapping for {fmt}: {e}", file=sys.stderr, flush=True)


# --------------------------------------------------
# OUTGOING MEDIA MESSAGE HELPER
# --------------------------------------------------

def _store_outgoing_media_message(ticket_id, phone, message, doc_id,
                                  message_type='image', media_url=None,
                                  mime_type=None, file_name=None,
                                  file_size=None, caption=None, status='sent',
                                  storage_path=None):
    """Store an outgoing (admin) media message in tickets/{ticketId}/chats/{docId}."""
    doc_data = _build_chat_doc(
        message_id=doc_id,
        ticket_id=ticket_id,
        sender_type='admin',
        sender_phone=None,
        message=message,
        message_type=message_type,
        status=status,
        whatsapp_message_id=None,
        media_url=media_url,
        storage_path=storage_path,
        mime_type=mime_type,
        file_name=file_name,
        file_size=file_size,
        caption=caption
    )
    vendbeesdb.collection('tickets').document(ticket_id) \
        .collection('chats').document(doc_id).set(doc_data)
    return doc_id


# --------------------------------------------------
# MEDIA API ENDPOINTS
# --------------------------------------------------

@whatsapp_bp.route('/api/whatsapp/send-image', methods=['POST'])
def send_image():
    """
    Send an image via WhatsApp.
    Request (multipart/form-data): ticketId, phone, caption (optional), image (file)
    Response: { success, messageId } or { success: false, error }
    """
    ticket_id = request.form.get('ticketId')
    phone = request.form.get('phone')
    caption = request.form.get('caption', '')

    if not ticket_id:
        return jsonify({'success': False, 'error': 'ticketId is required.'}), 400
    if not phone:
        return jsonify({'success': False, 'error': 'phone is required.'}), 400

    image_file = request.files.get('image')
    if not image_file or not image_file.filename:
        return jsonify({'success': False, 'error': 'image file is required.'}), 400

    # Validate phone
    is_valid, normalized_phone, phone_error = validate_phone(phone)
    if not is_valid:
        return jsonify({'success': False, 'error': phone_error}), 400

    # Validate MIME type
    content_type = image_file.content_type or 'application/octet-stream'
    if content_type not in ALLOWED_MIME_TYPES:
        return jsonify({'success': False, 'error': f'File type {content_type} is not allowed.'}), 400

    try:
        file_bytes = image_file.read()
        filename = image_file.filename

        # Upload to Firebase Storage under organized admin/images path
        upload_result = upload_to_firebase_storage(file_bytes, content_type, filename, ticket_id, 'whatsapp/admin/images')
        if not upload_result['success']:
            return jsonify({'success': False, 'error': upload_result['error']}), 500

        public_url = upload_result['download_url']

        # Store message with 'sending' status
        temp_id = str(uuid.uuid4())
        _store_outgoing_media_message(
            ticket_id, normalized_phone, caption or '[Image]', temp_id,
            message_type='image', media_url=public_url,
            mime_type=content_type, file_name=filename,
            file_size=upload_result['file_size'], caption=caption,
            status='sending',
            storage_path=upload_result.get('storage_path')
        )
        # Send via WhatsApp Cloud API
        result = send_image_message(normalized_phone, public_url, caption)

        if result['success']:
            whatsapp_msg_id = result.get('messageId')
            vendbeesdb.collection('tickets').document(ticket_id) \
                .collection('chats').document(temp_id).update({
                    'status': 'sent',
                    'whatsappMessageId': whatsapp_msg_id,
                })
            if whatsapp_msg_id:
                _store_message_mapping(whatsapp_msg_id, ticket_id, temp_id)
            _update_conversation_mapping(normalized_phone, ticket_id, temp_id, 'admin')
            print(f"[WHATSAPP] Image sent to {normalized_phone} for ticket {ticket_id}",
                  file=sys.stderr, flush=True)
            return jsonify({'success': True, 'messageId': whatsapp_msg_id}), 200
        else:
            vendbeesdb.collection('tickets').document(ticket_id) \
                .collection('chats').document(temp_id).update({'status': 'failed'})
            return jsonify({'success': False, 'error': result.get('error', 'Failed to send image.')}), 502

    except Exception as e:
        print(f"[WHATSAPP] send-image error: {e}", file=sys.stderr, flush=True)
        traceback.print_exc(file=sys.stderr)
        return jsonify({'success': False, 'error': f'Server error: {str(e)}'}), 500


@whatsapp_bp.route('/api/whatsapp/send-document', methods=['POST'])
def send_document():
    """
    Send a document via WhatsApp.
    Request (multipart/form-data): ticketId, phone, caption (optional), document (file)
    Response: { success, messageId } or { success: false, error }
    """
    ticket_id = request.form.get('ticketId')
    phone = request.form.get('phone')
    caption = request.form.get('caption', '')

    if not ticket_id:
        return jsonify({'success': False, 'error': 'ticketId is required.'}), 400
    if not phone:
        return jsonify({'success': False, 'error': 'phone is required.'}), 400

    doc_file = request.files.get('document')
    if not doc_file or not doc_file.filename:
        return jsonify({'success': False, 'error': 'document file is required.'}), 400

    # Validate phone
    is_valid, normalized_phone, phone_error = validate_phone(phone)
    if not is_valid:
        return jsonify({'success': False, 'error': phone_error}), 400

    # Validate MIME type
    content_type = doc_file.content_type or 'application/octet-stream'
    if content_type not in ALLOWED_MIME_TYPES:
        return jsonify({'success': False, 'error': f'File type {content_type} is not allowed.'}), 400

    try:
        file_bytes = doc_file.read()
        filename = doc_file.filename

        # Upload to Firebase Storage under organized admin/documents path
        upload_result = upload_to_firebase_storage(file_bytes, content_type, filename, ticket_id, 'whatsapp/admin/documents')
        if not upload_result['success']:
            return jsonify({'success': False, 'error': upload_result['error']}), 500

        public_url = upload_result['download_url']

        # Store message with 'sending' status
        temp_id = str(uuid.uuid4())
        _store_outgoing_media_message(
            ticket_id, normalized_phone, caption or f'[Document: {filename}]', temp_id,
            message_type='document', media_url=public_url,
            mime_type=content_type, file_name=filename,
            file_size=upload_result['file_size'], caption=caption,
            status='sending',
            storage_path=upload_result.get('storage_path')
        )
        result = send_document_message(normalized_phone, public_url, filename, caption)

        if result['success']:
            whatsapp_msg_id = result.get('messageId')
            vendbeesdb.collection('tickets').document(ticket_id) \
                .collection('chats').document(temp_id).update({
                    'status': 'sent',
                    'whatsappMessageId': whatsapp_msg_id,
                })
            if whatsapp_msg_id:
                _store_message_mapping(whatsapp_msg_id, ticket_id, temp_id)
            _update_conversation_mapping(normalized_phone, ticket_id, temp_id, 'admin')
            print(f"[WHATSAPP] Document sent to {normalized_phone} for ticket {ticket_id}",
                  file=sys.stderr, flush=True)
            return jsonify({'success': True, 'messageId': whatsapp_msg_id}), 200
        else:
            vendbeesdb.collection('tickets').document(ticket_id) \
                .collection('chats').document(temp_id).update({'status': 'failed'})
            return jsonify({'success': False, 'error': result.get('error', 'Failed to send document.')}), 502

    except Exception as e:
        print(f"[WHATSAPP] send-document error: {e}", file=sys.stderr, flush=True)
        traceback.print_exc(file=sys.stderr)
        return jsonify({'success': False, 'error': f'Server error: {str(e)}'}), 500


@whatsapp_bp.route('/api/whatsapp/upload-media', methods=['POST'])
def upload_media():
    """
    Upload a media file to Firebase Storage (no WhatsApp send).
    Request (multipart/form-data): ticketId, file
    Response: { success, downloadUrl, fileName, fileSize, mimeType }
    """
    ticket_id = request.form.get('ticketId')
    if not ticket_id:
        return jsonify({'success': False, 'error': 'ticketId is required.'}), 400

    media_file = request.files.get('file')
    if not media_file or not media_file.filename:
        return jsonify({'success': False, 'error': 'file is required.'}), 400

    content_type = media_file.content_type or 'application/octet-stream'
    if content_type not in ALLOWED_MIME_TYPES:
        return jsonify({'success': False, 'error': f'File type {content_type} is not allowed.'}), 400

    try:
        file_bytes = media_file.read()
        filename = media_file.filename

        upload_result = upload_to_firebase_storage(file_bytes, content_type, filename, ticket_id)
        if not upload_result['success']:
            return jsonify({'success': False, 'error': upload_result['error']}), 500

        return jsonify({
            'success': True,
            'downloadUrl': upload_result['download_url'],
            'fileName': filename,
            'fileSize': upload_result['file_size'],
            'mimeType': content_type,
        }), 200

    except Exception as e:
        print(f"[WHATSAPP] upload-media error: {e}", file=sys.stderr, flush=True)
        traceback.print_exc(file=sys.stderr)
        return jsonify({'success': False, 'error': f'Server error: {str(e)}'}), 500


# --------------------------------------------------
# INTERNAL NOTES ENDPOINT
# --------------------------------------------------

@whatsapp_bp.route('/api/whatsapp/internal-note', methods=['POST'])
def add_internal_note():
    """
    Store an internal admin note in the ticket chat.
    This is never sent to WhatsApp — it only lives in Firestore.
    Request:  { ticketId, note }
    Response: { success, noteId }
    """
    data = request.get_json()
    if not data:
        return jsonify({'success': False, 'error': 'Request body is required.'}), 400

    ticket_id = data.get('ticketId')
    note = data.get('note')

    if not ticket_id:
        return jsonify({'success': False, 'error': 'ticketId is required.'}), 400
    if not note:
        return jsonify({'success': False, 'error': 'note is required.'}), 400

    try:
        doc_id = str(uuid.uuid4())
        doc_data = {
            'messageId': doc_id,
            'ticketId': ticket_id,
            'sender': 'admin',
            'senderType': 'internal',
            'message': note,
            'timestamp': admin_firestore.SERVER_TIMESTAMP,
            'status': 'stored',
            'whatsappMessageId': None,
            'messageType': 'note',
        }
        vendbeesdb.collection('tickets').document(ticket_id) \
            .collection('chats').document(doc_id).set(doc_data)

        print(f"[WHATSAPP] Internal note added for ticket {ticket_id}",
              file=sys.stderr, flush=True)
        return jsonify({'success': True, 'noteId': doc_id}), 200

    except Exception as e:
        print(f"[WHATSAPP] internal-note error: {e}", file=sys.stderr, flush=True)
        traceback.print_exc(file=sys.stderr)
        return jsonify({'success': False, 'error': f'Server error: {str(e)}'}), 500
