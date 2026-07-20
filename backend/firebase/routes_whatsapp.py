"""
WhatsApp API Routes — Production Hardened
Flask Blueprint for WhatsApp Cloud API integration.

Features:
  - Meta webhook signature verification (X-Hub-Signature-256)
  - Webhook idempotency (duplicate event rejection)
  - Complete 23-field chat document schema
  - Conversation mapping with unread count
  - Correct Firebase Storage paths (whatsapp/{ticketId}/...)
  - Support: text, image, audio, voice, video, document,
             sticker, location, contacts, reaction, interactive
  - Outgoing: text, image, document
  - Status tracking: sending → sent → delivered → read → failed
  - All credentials from environment variables only
"""

import sys
import uuid
import hmac
import hashlib
import traceback
from flask import Blueprint, request, jsonify
from firebase_admin import firestore as admin_firestore
import firebase_config  # ensures Firebase app is initialized
from whatsapp_service import (
    send_text_message,
    send_template_message,
    send_image_message,
    send_document_message,
    validate_phone,
    get_status_notification_message,
    download_media,
    upload_to_firebase_storage,
    get_media_extension,
    ALLOWED_MIME_TYPES,
    reload_whatsapp_config,
)

whatsapp_bp = Blueprint('whatsapp', __name__)

# Connect to the named 'vendbeesdb' database
vendbeesdb = admin_firestore.client(database_id='vendbeesdb')


# =============================================================================
# CONSTANTS
# =============================================================================

# Ordered status progression (higher index = more advanced)
_STATUS_ORDER = {'sending': 0, 'sent': 1, 'delivered': 2, 'read': 3, 'failed': -1}

# Meta webhook status names → internal status names
_META_STATUS_MAP = {
    'sent': 'sent',
    'delivered': 'delivered',
    'read': 'read',
    'failed': 'failed',
}


# =============================================================================
# FIRESTORE HELPERS
# =============================================================================

def _build_chat_doc(
    message_id, ticket_id, conversation_id, sender_type,
    sender_phone, receiver_phone, message,
    message_type='text', status='sending',
    whatsapp_message_id=None, meta_media_id=None,
    firebase_storage_path=None, firebase_download_url=None,
    mime_type=None, file_name=None, file_size=None,
    duration=None, caption=None, reply_to_message_id=None,
    delivery_status=None, read_status=None, failed_reason=None,
    latitude=None, longitude=None,
):
    """
    Build a complete, production-ready chat document.
    Stores every field the objective requires and every Meta attribute
    that may be useful later.
    """
    now = admin_firestore.SERVER_TIMESTAMP
    doc = {
        # Identity
        'messageId':            message_id,
        'ticketId':             ticket_id,
        'conversationId':       conversation_id,

        # Participants
        'senderType':           sender_type,          # 'student' | 'admin' | 'internal' | 'system'
        'sender':               sender_type,          # alias kept for any existing queries
        'senderPhone':          sender_phone,
        'receiver':             'admin' if sender_type == 'student' else 'student',
        'receiverPhone':        receiver_phone,

        # Content
        'message':              message,
        'text':                 message,              # alias for raw text queries
        'messageType':          message_type,         # text|image|audio|voice|video|document|sticker|location|contacts|reaction|interactive|note|system
        'caption':              caption,
        'duration':             duration,
        'replyToMessageId':     reply_to_message_id,

        # Latitude / Longitude (for location messages)
        'latitude':             latitude,
        'longitude':            longitude,

        # Media
        'mediaType':            message_type if message_type not in ('text', 'note', 'system', 'internal') else None,
        'firebaseStoragePath':  firebase_storage_path,
        'firebaseDownloadUrl':  firebase_download_url,
        'mediaUrl':             firebase_download_url,   # alias kept for existing frontend queries
        'storagePath':          firebase_storage_path,   # alias
        'mimeType':             mime_type,
        'fileName':             file_name,
        'fileSize':             file_size,

        # Meta identifiers
        'whatsappMessageId':    whatsapp_message_id,
        'metaMessageId':        whatsapp_message_id,   # alias
        'metaMediaId':          meta_media_id,

        # Status
        'status':               status,
        'deliveryStatus':       delivery_status or status,
        'readStatus':           read_status or ('read' if status == 'read' else 'unread'),
        'failedReason':         failed_reason,

        # Timestamps
        'createdAt':            now,
        'updatedAt':            now,
        'timestamp':            now,   # alias used by existing frontend orderBy queries
    }
    return doc


def _store_outgoing_message(
    ticket_id, phone, message, doc_id, status='sending',
    message_type='text', media_url=None, mime_type=None,
    file_name=None, file_size=None, caption=None,
    storage_path=None, conversation_id=None,
):
    """Store an outgoing (admin → student) message in tickets/{ticketId}/chats/{docId}."""
    doc_data = _build_chat_doc(
        message_id=doc_id,
        ticket_id=ticket_id,
        conversation_id=conversation_id,
        sender_type='admin',
        sender_phone=None,
        receiver_phone=phone,
        message=message,
        message_type=message_type,
        status=status,
        firebase_storage_path=storage_path,
        firebase_download_url=media_url,
        mime_type=mime_type,
        file_name=file_name,
        file_size=file_size,
        caption=caption,
    )
    vendbeesdb.collection('tickets').document(ticket_id) \
        .collection('chats').document(doc_id).set(doc_data)
    return doc_id


def _store_incoming_message(
    ticket_id, conversation_id, phone, student_name,
    message, whatsapp_message_id,
    message_type='text', media_url=None, mime_type=None,
    file_name=None, file_size=None, duration=None, caption=None,
    latitude=None, longitude=None, reply_to_message_id=None,
    meta_media_id=None, storage_path=None,
):
    """Store an incoming (student → admin) message in tickets/{ticketId}/chats/{docId}."""
    doc_id = whatsapp_message_id or str(uuid.uuid4())
    doc_data = _build_chat_doc(
        message_id=doc_id,
        ticket_id=ticket_id,
        conversation_id=conversation_id,
        sender_type='student',
        sender_phone=phone,
        receiver_phone=None,
        message=message,
        message_type=message_type,
        status='received',
        whatsapp_message_id=whatsapp_message_id,
        meta_media_id=meta_media_id,
        firebase_storage_path=storage_path,
        firebase_download_url=media_url,
        mime_type=mime_type,
        file_name=file_name,
        file_size=file_size,
        duration=duration,
        caption=caption,
        reply_to_message_id=reply_to_message_id,
        latitude=latitude,
        longitude=longitude,
    )
    vendbeesdb.collection('tickets').document(ticket_id) \
        .collection('chats').document(doc_id).set(doc_data)
    return doc_id


def _store_message_mapping(whatsapp_message_id, ticket_id, chat_doc_id, conversation_id=None):
    """Store whatsappMessageId → (ticketId, chatDocId, conversationId) for webhook status lookups."""
    vendbeesdb.collection('whatsapp_message_map').document(whatsapp_message_id).set({
        'ticketId':       ticket_id,
        'chatDocId':      chat_doc_id,
        'conversationId': conversation_id,
        'createdAt':      admin_firestore.SERVER_TIMESTAMP,
    })


def _is_duplicate_event(whatsapp_message_id):
    """
    Return True if this message ID was already processed.
    Uses whatsapp_message_map as the idempotency store.
    """
    if not whatsapp_message_id:
        return False
    try:
        doc = vendbeesdb.collection('whatsapp_message_map') \
            .document(whatsapp_message_id).get()
        return doc.exists
    except Exception:
        return False


# =============================================================================
# PHONE & TICKET LOOKUP
# =============================================================================

def _normalize_digits(phone_raw):
    """Return all plausible E.164 digit formats for a given phone string."""
    digits = ''.join(c for c in str(phone_raw) if c.isdigit())
    formats = {digits}
    if len(digits) > 10:
        formats.add(digits[-10:])
    if len(digits) == 10:
        formats.add('91' + digits)
    if digits.startswith('91') and len(digits) == 12:
        formats.add(digits[2:])
    if digits.startswith('0') and len(digits) == 11:
        formats.add(digits[1:])
    return formats


def _find_ticket_by_phone(phone_raw):
    """
    Find the most recent active ticket for a given phone number.

    Lookup order (fastest first):
      1. whatsappConversations (indexed by studentPhone)  ← production path
      2. tickets collection by mobileNumber               ← slow fallback
      3. tickets collection by phoneNumber                ← alternative schema

    Returns (ticket_doc_id, ticket_data) or (None, None).
    """
    formats = _normalize_digits(phone_raw)

    # ── Fast path: whatsappConversations (UUID doc IDs, indexed by studentPhone) ──
    for fmt in formats:
        try:
            convs = list(
                vendbeesdb.collection('whatsappConversations')
                .where('studentPhone', '==', fmt)
                .limit(1)
                .get()
            )
            if convs:
                mapped_ticket_id = convs[0].to_dict().get('ticketId')
                if mapped_ticket_id:
                    ticket_snap = vendbeesdb.collection('tickets').document(mapped_ticket_id).get()
                    if ticket_snap.exists:
                        return ticket_snap.id, ticket_snap.to_dict()
        except Exception as exc:
            print(f"[WA] whatsappConversations lookup error for {fmt}: {exc}", file=sys.stderr)

    # ── Slow path: direct tickets query ──
    for field in ('mobileNumber', 'phoneNumber'):
        for fmt in formats:
            try:
                tickets = list(
                    vendbeesdb.collection('tickets')
                    .where(field, '==', fmt)
                    .get()
                )
                if tickets:
                    active = [t for t in tickets if not t.to_dict().get('statusLocked')]
                    target = active[0] if active else tickets[0]
                    return target.id, target.to_dict()
            except Exception as exc:
                print(f"[WA] tickets query error (field={field}, fmt={fmt}): {exc}", file=sys.stderr)

    print(f"[WA] No ticket found for phone variants: {formats}", file=sys.stderr)
    return None, None


# =============================================================================
# CONVERSATION MAPPING
# =============================================================================

# =============================================================================
# CONVERSATION STATE & FLOW MANAGEMENT
# =============================================================================

def _is_customer_service_window_open(phone_short):
    """
    Check if there is an active 24-hour customer service window open for the given phone.
    Returns: (is_open: bool, conversation_doc: dict|None, conv_id: str|None)
    """
    try:
        existing = list(
            vendbeesdb.collection('whatsappConversations')
            .where('studentPhone', '==', phone_short)
            .limit(1)
            .get()
        )
        if not existing:
            return False, None, None
        
        conv_doc = existing[0].to_dict()
        conv_id = existing[0].id
        
        # Check lastCustomerMessageTime field
        last_cust_time = conv_doc.get('lastCustomerMessageTime')
        if not last_cust_time:
            return False, conv_doc, conv_id
        
        # Determine timestamp
        from datetime import datetime, timezone
        if hasattr(last_cust_time, 'timestamp'):
            last_cust_ts = last_cust_time.timestamp()
        elif isinstance(last_cust_time, (int, float)):
            last_cust_ts = last_cust_time
        else:
            try:
                from dateutil import parser
                last_cust_ts = parser.parse(str(last_cust_time)).timestamp()
            except Exception:
                return False, conv_doc, conv_id
        
        now_ts = datetime.now(timezone.utc).timestamp()
        elapsed = now_ts - last_cust_ts
        
        if elapsed < 86400:  # 24 hours in seconds
            return True, conv_doc, conv_id
        
        return False, conv_doc, conv_id
    except Exception as exc:
        print(f"[WA] Error checking conversation window: {exc}", file=sys.stderr)
        return False, None, None


def _send_outgoing_flow(ticket_id, normalized_phone, text_body, msg_type='text', media_url=None, filename=None, caption=None):
    """
    Common flow that:
    1. Checks if customer service window is open.
    2. Sends normal message if open.
    3. Sends utility template if closed.
    4. Automatically retries with template if normal send fails with 24h window error.
    5. Returns (result_dict, was_template_sent, actual_text_sent)
    """
    import os
    phone_short = normalized_phone[-10:] if len(normalized_phone) > 10 else normalized_phone
    
    window_open, conv_doc, conv_id = _is_customer_service_window_open(phone_short)
    
    student_name = 'Student'
    ticket_display_id = ticket_id
    try:
        ticket_doc = vendbeesdb.collection('tickets').document(ticket_id).get()
        if ticket_doc.exists:
            tdata = ticket_doc.to_dict()
            student_name = tdata.get('fullName') or tdata.get('studentName') or 'Student'
            ticket_display_id = tdata.get('ticketId') or tdata.get('ticket_id') or ticket_id
    except Exception as exc:
        print(f"[WA] Error fetching ticket in flow: {exc}", file=sys.stderr)
        
    template_name = os.environ.get('WHATSAPP_UTILITY_TEMPLATE_NAME', 'complaint_update')
    
    if template_name == 'hello_world':
        template_text = "Hello World"
    else:
        template_text = (
            f"Hello {student_name},\n\n"
            f"We have an update regarding your complaint {ticket_display_id}.\n\n"
            f"Please reply to this message to continue chatting with our support team.\n\n"
            f"Regards,\nVendBees Support"
        )

    def send_template():
        if template_name == 'hello_world':
            comps = None
        else:
            comps = [
                {
                    "type": "body",
                    "parameters": [
                        {"type": "text", "text": student_name},
                        {"type": "text", "text": ticket_display_id}
                    ]
                }
            ]
        res = send_template_message(normalized_phone, template_name, components=comps)
        return res

    if window_open:
        if msg_type == 'image' and media_url:
            result = send_image_message(normalized_phone, media_url, caption or '')
        elif msg_type == 'document' and media_url:
            result = send_document_message(normalized_phone, media_url, filename or 'document', caption or '')
        else:
            result = send_text_message(normalized_phone, text_body)
            
        is_window_closed_error = False
        if not result['success']:
            err_code = result.get('error_code') or 0
            err_sub = result.get('error_subcode') or 0
            err_msg = str(result.get('error', '')).lower()
            if err_code == 131047 or err_sub == 131047 or '24 hour' in err_msg or 'window' in err_msg or 'template' in err_msg:
                is_window_closed_error = True
                
        if is_window_closed_error:
            print(f"[WA] Meta rejected free-form (window closed). Retrying with template...", file=sys.stderr)
            result = send_template()
            return result, True, template_text
            
        return result, False, text_body
    else:
        print(f"[WA] Customer service window closed for {phone_short}. Sending template instead...", file=sys.stderr)
        result = send_template()
        return result, True, template_text


def _upsert_conversation(
    phone_raw, ticket_id, last_doc_id, last_sender,
    last_message='', last_message_type='text',
    ticket_data=None, increment_unread=False,
    is_template=False,
):
    """
    Upsert the whatsappConversations document for this phone/ticket pair.
    Document ID = UUID (never a phone number — security requirement).
    Indexed by studentPhone for fast webhook lookup.
    """
    local_phone = ''.join(c for c in str(phone_raw) if c.isdigit())
    if len(local_phone) > 10:
        local_phone_short = local_phone[-10:]
    else:
        local_phone_short = local_phone

    student_name = ''
    if ticket_data:
        student_name = (
            ticket_data.get('fullName') or
            ticket_data.get('studentName') or
            ''
        )

    payload = {
        'ticketId':        ticket_id,
        'studentPhone':    local_phone_short,
        'studentPhoneFull': local_phone,
        'studentName':     student_name,
        'lastMessage':     last_message[:500] if last_message else '',
        'lastMessageType': last_message_type,
        'lastMessageId':   last_doc_id,
        'lastSender':      last_sender,
        'lastMessageAt':   admin_firestore.SERVER_TIMESTAMP,
        'status':          'active',
        'updatedAt':       admin_firestore.SERVER_TIMESTAMP,
    }

    if last_sender == 'student':
        payload['lastCustomerMessageTime'] = admin_firestore.SERVER_TIMESTAMP
        payload['conversationOpen'] = True
        payload['conversationType'] = 'free_form'
    elif last_sender == 'admin':
        if is_template:
            payload['lastTemplateSent'] = admin_firestore.SERVER_TIMESTAMP
            payload['conversationOpen'] = False
            payload['conversationType'] = 'utility'
        else:
            payload['conversationOpen'] = True
            payload['conversationType'] = 'free_form'

    try:
        existing = list(
            vendbeesdb.collection('whatsappConversations')
            .where('studentPhone', '==', local_phone_short)
            .limit(1)
            .get()
        )
        if existing:
            conv_ref = vendbeesdb.collection('whatsappConversations').document(existing[0].id)
            if increment_unread:
                # Atomic increment — avoids race conditions on concurrent webhook events
                payload['unreadCount'] = admin_firestore.Increment(1)
            else:
                payload['unreadCount'] = 0
            conv_ref.set(payload, merge=True)
            return existing[0].id
        else:
            conv_id = str(uuid.uuid4())
            payload['conversationId'] = conv_id
            payload['unreadCount'] = 1 if increment_unread else 0
            payload['createdAt'] = admin_firestore.SERVER_TIMESTAMP
            vendbeesdb.collection('whatsappConversations').document(conv_id).set(payload)
            return conv_id
    except Exception as exc:
        print(f"[WA] Error upserting whatsappConversations for {local_phone_short}: {exc}", file=sys.stderr)
        return None


def _get_conversation_id(phone_raw):
    """Return existing conversation UUID for a phone, or None."""
    local_phone = ''.join(c for c in str(phone_raw) if c.isdigit())
    short = local_phone[-10:] if len(local_phone) > 10 else local_phone
    try:
        docs = list(
            vendbeesdb.collection('whatsappConversations')
            .where('studentPhone', '==', short)
            .limit(1)
            .get()
        )
        if docs:
            return docs[0].to_dict().get('conversationId', docs[0].id)
    except Exception:
        pass
    return None


# =============================================================================
# STATUS TRACKING
# =============================================================================

def _update_message_status(whatsapp_message_id, new_status, failed_reason=None):
    """
    Update delivery status of a tracked outgoing message.
    Only advances the status forward (sent → delivered → read).
    Marks as failed regardless of current status.
    """
    try:
        mapping_doc = vendbeesdb.collection('whatsapp_message_map') \
            .document(whatsapp_message_id).get()
        if not mapping_doc.exists:
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
        current_rank = _STATUS_ORDER.get(current_status, -2)
        new_rank = _STATUS_ORDER.get(new_status, -2)

        if new_status == 'failed' or new_rank > current_rank:
            updates = {
                'status':         new_status,
                'deliveryStatus': new_status,
                'updatedAt':      admin_firestore.SERVER_TIMESTAMP,
            }
            if new_status == 'read':
                updates['readStatus'] = 'read'
                updates['readAt'] = admin_firestore.SERVER_TIMESTAMP
            if new_status == 'delivered':
                updates['deliveredAt'] = admin_firestore.SERVER_TIMESTAMP
            if new_status == 'failed' and failed_reason:
                updates['failedReason'] = failed_reason
            chat_ref.update(updates)
    except Exception as exc:
        print(f"[WA] Error updating message status {whatsapp_message_id}: {exc}", file=sys.stderr)


# =============================================================================
# WEBHOOK SIGNATURE VERIFICATION
# =============================================================================

def _verify_webhook_signature(request_body: bytes, signature_header: str, app_secret: str) -> bool:
    """
    Verify Meta's X-Hub-Signature-256 header.
    Expected format: 'sha256=<hex_digest>'
    """
    if not app_secret:
        # Not configured — skip verification with a warning
        print("[WA] WARNING: WHATSAPP_APP_SECRET not set. Skipping signature verification.", file=sys.stderr)
        return True
    if not signature_header or not signature_header.startswith('sha256='):
        return False
    expected = 'sha256=' + hmac.new(
        app_secret.encode('utf-8'),
        request_body,
        hashlib.sha256,
    ).hexdigest()
    return hmac.compare_digest(expected, signature_header)


# =============================================================================
# API ENDPOINTS — OUTGOING MESSAGES
# =============================================================================

@whatsapp_bp.route('/api/whatsapp/send', methods=['POST'])
def send_message():
    """
    Send a WhatsApp text message to a student.
    Request:  { ticketId, phone, message }
    Response: { success, messageId } | { success: false, error }
    """
    data = request.get_json()
    if not data:
        return jsonify({'success': False, 'error': 'Request body is required.'}), 400

    ticket_id = data.get('ticketId')
    phone = data.get('phone')
    message = data.get('message', '').strip()

    if not ticket_id:
        return jsonify({'success': False, 'error': 'ticketId is required.'}), 400
    if not phone:
        return jsonify({'success': False, 'error': 'phone is required.'}), 400
    if not message:
        return jsonify({'success': False, 'error': 'message is required.'}), 400

    is_valid, normalized_phone, phone_error = validate_phone(phone)
    if not is_valid:
        return jsonify({'success': False, 'error': phone_error}), 400

    conv_id = _get_conversation_id(normalized_phone)
    temp_id = str(uuid.uuid4())

    # Call outgoing flow to determine if normal message or template should be sent
    result, was_template_sent, actual_message = _send_outgoing_flow(
        ticket_id, normalized_phone, message, msg_type='text'
    )

    _store_outgoing_message(
        ticket_id, normalized_phone, actual_message, temp_id,
        status='sending', conversation_id=conv_id,
        message_type='template' if was_template_sent else 'text',
    )

    if result['success']:
        wa_msg_id = result.get('messageId')
        updates = {
            'status':          'sent',
            'deliveryStatus':  'sent',
            'updatedAt':       admin_firestore.SERVER_TIMESTAMP,
        }
        if wa_msg_id:
            updates['whatsappMessageId'] = wa_msg_id
            updates['metaMessageId'] = wa_msg_id
        if was_template_sent:
            updates['originalAdminMessage'] = message

        vendbeesdb.collection('tickets').document(ticket_id) \
            .collection('chats').document(temp_id).update(updates)

        if wa_msg_id:
            _store_message_mapping(wa_msg_id, ticket_id, temp_id, conv_id)

        _upsert_conversation(
            normalized_phone, ticket_id, temp_id, 'admin',
            last_message=actual_message, last_message_type='template' if was_template_sent else 'text',
            increment_unread=False, is_template=was_template_sent
        )
        return jsonify({'success': True, 'messageId': wa_msg_id}), 200
    else:
        vendbeesdb.collection('tickets').document(ticket_id) \
            .collection('chats').document(temp_id).update({
                'status': 'failed',
                'deliveryStatus': 'failed',
                'failedReason': result.get('error', ''),
                'updatedAt': admin_firestore.SERVER_TIMESTAMP,
            })
        return jsonify({'success': False, 'error': result.get('error', 'Failed to send message.')}), 502


@whatsapp_bp.route('/api/whatsapp/notify', methods=['POST'])
def send_status_notification():
    """
    Send automatic WhatsApp notification when complaint status changes.
    Request:  { ticketId, status, phone, studentName, ticketDisplayId,
                issueType, machineId, complaintText }
    Response: { success, messageId } | { success: false, error }
    """
    data = request.get_json()
    if not data:
        return jsonify({'success': False, 'error': 'Request body is required.'}), 400

    ticket_id    = data.get('ticketId')
    status       = data.get('status')
    phone        = data.get('phone')
    student_name = data.get('studentName', 'Student')
    ticket_display_id = data.get('ticketDisplayId') or ticket_id

    issue_type_hint     = data.get('issueType', '')
    machine_id_hint     = data.get('machineId', '')
    complaint_text_hint = data.get('complaintText', '')

    if not ticket_id or not status or not phone:
        return jsonify({'success': False, 'error': 'ticketId, status, and phone are required.'}), 400

    # Fetch full ticket details from Firestore for context-aware template
    try:
        ticket_doc = vendbeesdb.collection('tickets').document(ticket_id).get()
        if ticket_doc.exists:
            complaint_data = ticket_doc.to_dict()
            complaint_data['ticket_id'] = (
                complaint_data.get('ticketId') or
                complaint_data.get('ticket_id') or
                ticket_display_id
            )
            complaint_data['ticketId'] = complaint_data['ticket_id']
        else:
            complaint_data = {
                'ticket_id': ticket_display_id,
                'ticketId':  ticket_display_id,
                'fullName':  student_name,
                'mobileNumber': phone,
                'status': status,
            }
    except Exception as exc:
        print(f"[WA] Error fetching ticket {ticket_id} for notification: {exc}", file=sys.stderr)
        complaint_data = {
            'ticket_id': ticket_display_id,
            'ticketId':  ticket_display_id,
            'fullName':  student_name,
            'mobileNumber': phone,
            'status': status,
        }

    # Overlay hints from frontend when Firestore fields are missing
    if issue_type_hint and not complaint_data.get('issueType') and not complaint_data.get('issue_type'):
        complaint_data['issueType'] = issue_type_hint
    if machine_id_hint and not complaint_data.get('machineId') and not complaint_data.get('machine_id'):
        complaint_data['machineId'] = machine_id_hint
    if complaint_text_hint and not complaint_data.get('complaintText') and not complaint_data.get('issue_detail'):
        complaint_data['complaintText'] = complaint_text_hint

    from notification_builder import NotificationBuilder
    message = NotificationBuilder.build_notification(complaint_data, status)
    if not message:
        return jsonify({'success': False, 'error': f'No notification template for status: {status}'}), 400

    is_valid, normalized_phone, phone_error = validate_phone(phone)
    if not is_valid:
        return jsonify({'success': False, 'error': phone_error}), 400

    conv_id = _get_conversation_id(normalized_phone)
    temp_id = str(uuid.uuid4())

    result, was_template_sent, actual_message = _send_outgoing_flow(
        ticket_id, normalized_phone, message, msg_type='text'
    )

    _store_outgoing_message(
        ticket_id, normalized_phone, actual_message, temp_id,
        status='sending', conversation_id=conv_id,
        message_type='template' if was_template_sent else 'text',
    )

    if result['success']:
        wa_msg_id = result.get('messageId')
        updates = {
            'status':         'sent',
            'deliveryStatus': 'sent',
            'updatedAt':      admin_firestore.SERVER_TIMESTAMP,
        }
        if wa_msg_id:
            updates['whatsappMessageId'] = wa_msg_id
            updates['metaMessageId'] = wa_msg_id
        if was_template_sent:
            updates['originalAdminMessage'] = message

        vendbeesdb.collection('tickets').document(ticket_id) \
            .collection('chats').document(temp_id).update(updates)

        if wa_msg_id:
            _store_message_mapping(wa_msg_id, ticket_id, temp_id, conv_id)

        _upsert_conversation(
            normalized_phone, ticket_id, temp_id, 'admin',
            last_message=actual_message, last_message_type='template' if was_template_sent else 'text',
            increment_unread=False, is_template=was_template_sent
        )
        return jsonify({'success': True, 'messageId': wa_msg_id}), 200
    else:
        vendbeesdb.collection('tickets').document(ticket_id) \
            .collection('chats').document(temp_id).update({
                'status': 'failed',
                'deliveryStatus': 'failed',
                'failedReason': result.get('error', ''),
                'updatedAt': admin_firestore.SERVER_TIMESTAMP,
            })
        return jsonify({'success': False, 'error': result.get('error', 'Failed to send notification.')}), 502


# =============================================================================
# WEBHOOK ENDPOINTS
# =============================================================================

@whatsapp_bp.route('/webhook/whatsapp', methods=['GET'])
def verify_webhook():
    """
    Meta webhook verification endpoint.
    GET with hub.mode=subscribe, hub.verify_token, hub.challenge.
    """
    mode      = request.args.get('hub.mode')
    token     = request.args.get('hub.verify_token')
    challenge = request.args.get('hub.challenge')

    _, _, _, _, verify_token, _ = reload_whatsapp_config()

    if mode == 'subscribe' and token == verify_token:
        print("[WA] Webhook verified successfully.", file=sys.stderr)
        return challenge, 200

    print("[WA] Webhook verification failed - token mismatch.", file=sys.stderr)
    return 'Forbidden', 403


@whatsapp_bp.route('/webhook/whatsapp', methods=['POST'])
def handle_webhook():
    """
    Handle incoming webhook events from Meta WhatsApp.

    Security:
      - Verifies X-Hub-Signature-256 before any processing.

    Idempotency:
      - Checks whatsapp_message_map before processing messages.

    Always returns 200 to prevent Meta retry storm.
    """
    # ── 1. Signature verification ──────────────────────────────────────────
    _, _, _, _, _, _ = reload_whatsapp_config()  # loads env
    import os
    app_secret = os.environ.get('WHATSAPP_APP_SECRET', '')
    signature  = request.headers.get('X-Hub-Signature-256', '')
    raw_body   = request.get_data()

    if not _verify_webhook_signature(raw_body, signature, app_secret):
        print("[WA] Webhook rejected - invalid signature.", file=sys.stderr)
        return 'Forbidden', 403

    # ── 2. Parse payload ───────────────────────────────────────────────────
    payload = request.get_json(force=True, silent=True)
    if not payload:
        return 'OK', 200

    try:
        for entry in payload.get('entry', []):
            for change in entry.get('changes', []):
                value = change.get('value', {})

                # Incoming messages from students
                for msg in value.get('messages', []):
                    _process_incoming_message(msg, value)

                # Delivery/read status updates
                for status_event in value.get('statuses', []):
                    _process_status_update(status_event)

    except Exception as exc:
        print(f"[WA] Webhook processing error: {exc}", file=sys.stderr)
        traceback.print_exc(file=sys.stderr)

    return 'OK', 200


# =============================================================================
# INCOMING MESSAGE PROCESSOR
# =============================================================================

def _process_incoming_message(msg, value):
    """Process a single incoming WhatsApp message from a student."""
    sender_phone    = msg.get('from', '')
    wa_msg_id       = msg.get('id', '')
    msg_type        = msg.get('type', 'text')

    # ── Idempotency check ──────────────────────────────────────────────────
    if _is_duplicate_event(wa_msg_id):
        print(f"[WA] Duplicate event skipped: {wa_msg_id}", file=sys.stderr)
        return

    # ── Ticket lookup ──────────────────────────────────────────────────────
    ticket_id, ticket_data = _find_ticket_by_phone(sender_phone)

    # Defaults
    media_url       = None
    mime_type       = None
    file_name       = None
    file_size       = None
    duration        = None
    caption         = None
    latitude        = None
    longitude       = None
    meta_media_id   = None
    storage_path    = None
    message_type    = msg_type

    reply_to_msg_id = msg.get('context', {}).get('id')

    # ── Per-type extraction ────────────────────────────────────────────────

    if msg_type == 'text':
        message_text = msg.get('text', {}).get('body', '')

    elif msg_type == 'image':
        obj = msg.get('image', {})
        media_id = obj.get('id')
        caption  = obj.get('caption', '')
        mime_type = obj.get('mime_type', 'image/jpeg')
        message_text = caption or '[Image received]'
        if media_id and ticket_id:
            media_url, storage_path, mime_type, file_size, meta_media_id = _fetch_and_store_media(
                media_id, ticket_id, 'student', 'images', 'image'
            )

    elif msg_type == 'audio':
        obj = msg.get('audio', {})
        media_id  = obj.get('id')
        mime_type = obj.get('mime_type', 'audio/ogg')
        # voice_note flag differentiates WhatsApp voice from regular audio
        sub_folder = 'voice' if obj.get('voice') else 'audio'
        message_type = 'voice' if obj.get('voice') else 'audio'
        message_text = '[Voice note received]' if message_type == 'voice' else '[Audio received]'
        if media_id and ticket_id:
            media_url, storage_path, mime_type, file_size, meta_media_id = _fetch_and_store_media(
                media_id, ticket_id, 'student', sub_folder, 'audio'
            )

    elif msg_type == 'video':
        obj = msg.get('video', {})
        media_id  = obj.get('id')
        caption   = obj.get('caption', '')
        mime_type = obj.get('mime_type', 'video/mp4')
        message_text = caption or '[Video received]'
        if media_id and ticket_id:
            media_url, storage_path, mime_type, file_size, meta_media_id = _fetch_and_store_media(
                media_id, ticket_id, 'student', 'videos', 'video'
            )

    elif msg_type == 'document':
        obj = msg.get('document', {})
        media_id  = obj.get('id')
        caption   = obj.get('caption', '')
        mime_type = obj.get('mime_type', 'application/pdf')
        file_name = obj.get('filename', 'document')
        message_text = caption or f'[Document: {file_name}]'
        if media_id and ticket_id:
            media_url, storage_path, mime_type, file_size, meta_media_id = _fetch_and_store_media(
                media_id, ticket_id, 'student', 'documents', 'document',
                original_filename=file_name,
            )

    elif msg_type == 'sticker':
        obj = msg.get('sticker', {})
        media_id  = obj.get('id')
        mime_type = obj.get('mime_type', 'image/webp')
        message_text = '[Sticker received]'
        if media_id and ticket_id:
            media_url, storage_path, mime_type, file_size, meta_media_id = _fetch_and_store_media(
                media_id, ticket_id, 'student', 'stickers', 'sticker'
            )

    elif msg_type == 'location':
        loc       = msg.get('location', {})
        latitude  = loc.get('latitude')
        longitude = loc.get('longitude')
        loc_name  = loc.get('name', '')
        loc_addr  = loc.get('address', '')
        parts     = [p for p in [loc_name, loc_addr] if p]
        message_text = f"[Location: {latitude}, {longitude}]"
        if parts:
            message_text += f" — {', '.join(parts)}"

    elif msg_type == 'contacts':
        contacts_list = msg.get('contacts', [])
        if contacts_list:
            c = contacts_list[0]
            c_name  = c.get('name', {}).get('formatted_name', 'Unknown')
            c_phone = c.get('phones', [{}])[0].get('phone', '')
            message_text = f"[Contact: {c_name} {c_phone}]"
        else:
            message_text = '[Contact received]'

    elif msg_type == 'reaction':
        emoji = msg.get('reaction', {}).get('emoji', '')
        message_text = f"[Reaction: {emoji}]"

    elif msg_type == 'interactive':
        interactive = msg.get('interactive', {})
        sub_type = interactive.get('type', '')
        if sub_type == 'button_reply':
            message_text = interactive.get('button_reply', {}).get('title', '[Button reply]')
        elif sub_type == 'list_reply':
            message_text = interactive.get('list_reply', {}).get('title', '[List reply]')
        else:
            message_text = '[Interactive message]'

    else:
        message_text = f'[{msg_type} message]'

    # ── Store if ticket found ──────────────────────────────────────────────
    if ticket_id:
        student_name = (
            ticket_data.get('fullName') or
            ticket_data.get('studentName') or
            'Student'
        ) if ticket_data else 'Student'

        conv_id = _upsert_conversation(
            sender_phone, ticket_id, wa_msg_id, 'student',
            last_message=message_text,
            last_message_type=message_type,
            ticket_data=ticket_data,
            increment_unread=True,
        )

        chat_doc_id = _store_incoming_message(
            ticket_id=ticket_id,
            conversation_id=conv_id,
            phone=sender_phone,
            student_name=student_name,
            message=message_text,
            whatsapp_message_id=wa_msg_id,
            message_type=message_type,
            media_url=media_url,
            mime_type=mime_type,
            file_name=file_name,
            file_size=file_size,
            duration=duration,
            caption=caption,
            latitude=latitude,
            longitude=longitude,
            reply_to_message_id=reply_to_msg_id,
            meta_media_id=meta_media_id,
            storage_path=storage_path,
        )

        if wa_msg_id and chat_doc_id:
            _store_message_mapping(wa_msg_id, ticket_id, chat_doc_id, conv_id)

        print(
            f"[WA] Incoming {msg_type} from {sender_phone} → ticket {ticket_id} "
            f"(docId={chat_doc_id})",
            file=sys.stderr,
        )
    else:
        print(f"[WA] No ticket for phone {sender_phone}. Message not stored.", file=sys.stderr)


# =============================================================================
# MEDIA HELPER
# =============================================================================

def _fetch_and_store_media(
    media_id, ticket_id, sender_dir, sub_folder, file_prefix,
    original_filename=None,
):
    """
    Download media from Meta and upload to Firebase Storage.
    Storage path: whatsapp/{ticketId}/{sender_dir}/{sub_folder}/
    Returns (media_url, storage_path, mime_type, file_size, meta_media_id).
    """
    dl = download_media(media_id)
    if not dl['success']:
        print(f"[WA] Media download failed ({media_id}): {dl['error']}", file=sys.stderr)
        return None, None, None, None, media_id

    mime = dl['mime_type']
    if mime not in ALLOWED_MIME_TYPES:
        print(f"[WA] Rejected media MIME type: {mime}", file=sys.stderr)
        return None, None, mime, None, media_id

    ext       = get_media_extension(mime)
    file_name = original_filename or f"{file_prefix}{ext}"
    category  = f"whatsapp/{sender_dir}/{sub_folder}"

    upload = upload_to_firebase_storage(
        dl['content_bytes'], mime, file_name, ticket_id, category
    )
    if not upload['success']:
        print(f"[WA] Storage upload failed: {upload['error']}", file=sys.stderr)
        return None, None, mime, dl['file_size'], media_id

    return (
        upload['download_url'],
        upload['storage_path'],
        mime,
        dl['file_size'],
        media_id,
    )


# =============================================================================
# STATUS UPDATE PROCESSOR
# =============================================================================

def _process_status_update(status_event):
    """Process a delivery/read/failed status update event from Meta."""
    wa_msg_id = status_event.get('id', '')
    status    = status_event.get('status', '')
    errors    = status_event.get('errors', [])

    failed_reason = None
    if errors:
        err = errors[0]
        failed_reason = f"[{err.get('code')}] {err.get('title', '')} — {err.get('message', '')}"

    mapped = _META_STATUS_MAP.get(status)
    if mapped and wa_msg_id:
        _update_message_status(wa_msg_id, mapped, failed_reason=failed_reason)


# =============================================================================
# OUTGOING MEDIA ENDPOINTS
# =============================================================================

@whatsapp_bp.route('/api/whatsapp/send-image', methods=['POST'])
def send_image():
    """
    Send an image via WhatsApp.
    Multipart: ticketId, phone, caption (optional), image (file)
    """
    ticket_id = request.form.get('ticketId')
    phone     = request.form.get('phone')
    caption   = request.form.get('caption', '')

    if not ticket_id:
        return jsonify({'success': False, 'error': 'ticketId is required.'}), 400
    if not phone:
        return jsonify({'success': False, 'error': 'phone is required.'}), 400

    image_file = request.files.get('image')
    if not image_file or not image_file.filename:
        return jsonify({'success': False, 'error': 'image file is required.'}), 400

    is_valid, normalized_phone, phone_error = validate_phone(phone)
    if not is_valid:
        return jsonify({'success': False, 'error': phone_error}), 400

    content_type = image_file.content_type or 'application/octet-stream'
    if content_type not in ALLOWED_MIME_TYPES:
        return jsonify({'success': False, 'error': f'File type {content_type} is not allowed.'}), 400
    if not content_type.startswith('image/'):
        return jsonify({'success': False, 'error': 'Only image files are accepted on this endpoint.'}), 400

    try:
        file_bytes = image_file.read()
        filename   = image_file.filename

        upload_result = upload_to_firebase_storage(
            file_bytes, content_type, filename, ticket_id, 'whatsapp/admin/images'
        )
        if not upload_result['success']:
            return jsonify({'success': False, 'error': upload_result['error']}), 500

        public_url = upload_result['download_url']
        conv_id    = _get_conversation_id(normalized_phone)
        temp_id    = str(uuid.uuid4())

        # Call outgoing flow to determine if image should be sent or converted to template
        result, was_template_sent, actual_message = _send_outgoing_flow(
            ticket_id, normalized_phone, caption or '[Image]',
            msg_type='image', media_url=public_url, caption=caption
        )

        if was_template_sent:
            _store_outgoing_message(
                ticket_id, normalized_phone, actual_message, temp_id,
                status='sending', conversation_id=conv_id,
                message_type='template',
            )
        else:
            _store_outgoing_message(
                ticket_id, normalized_phone, caption or '[Image]', temp_id,
                message_type='image', media_url=public_url,
                mime_type=content_type, file_name=filename,
                file_size=upload_result['file_size'], caption=caption,
                status='sending', storage_path=upload_result.get('storage_path'),
                conversation_id=conv_id,
            )

        if result['success']:
            wa_msg_id = result.get('messageId')
            updates = {
                'status':          'sent',
                'deliveryStatus':  'sent',
                'updatedAt':       admin_firestore.SERVER_TIMESTAMP,
            }
            if wa_msg_id:
                updates['whatsappMessageId'] = wa_msg_id
                updates['metaMessageId'] = wa_msg_id
            if was_template_sent:
                updates['originalAdminMessage'] = caption or '[Image]'
                updates['originalMediaUrl'] = public_url

            vendbeesdb.collection('tickets').document(ticket_id) \
                .collection('chats').document(temp_id).update(updates)

            if wa_msg_id:
                _store_message_mapping(wa_msg_id, ticket_id, temp_id, conv_id)

            _upsert_conversation(
                normalized_phone, ticket_id, temp_id, 'admin',
                last_message=actual_message,
                last_message_type='template' if was_template_sent else 'image',
                increment_unread=False, is_template=was_template_sent
            )
            return jsonify({'success': True, 'messageId': wa_msg_id}), 200
        else:
            vendbeesdb.collection('tickets').document(ticket_id) \
                .collection('chats').document(temp_id).update({
                    'status': 'failed',
                    'deliveryStatus': 'failed',
                    'failedReason': result.get('error', ''),
                    'updatedAt': admin_firestore.SERVER_TIMESTAMP,
                })
            return jsonify({'success': False, 'error': result.get('error', 'Failed to send image.')}), 502

    except Exception as exc:
        print(f"[WA] send-image error: {exc}", file=sys.stderr)
        return jsonify({'success': False, 'error': f'Server error: {str(exc)}'}), 500


@whatsapp_bp.route('/api/whatsapp/send-document', methods=['POST'])
def send_document():
    """
    Send a document via WhatsApp.
    Multipart: ticketId, phone, caption (optional), document (file)
    """
    ticket_id = request.form.get('ticketId')
    phone     = request.form.get('phone')
    caption   = request.form.get('caption', '')

    if not ticket_id:
        return jsonify({'success': False, 'error': 'ticketId is required.'}), 400
    if not phone:
        return jsonify({'success': False, 'error': 'phone is required.'}), 400

    doc_file = request.files.get('document')
    if not doc_file or not doc_file.filename:
        return jsonify({'success': False, 'error': 'document file is required.'}), 400

    is_valid, normalized_phone, phone_error = validate_phone(phone)
    if not is_valid:
        return jsonify({'success': False, 'error': phone_error}), 400

    content_type = doc_file.content_type or 'application/octet-stream'
    if content_type not in ALLOWED_MIME_TYPES:
        return jsonify({'success': False, 'error': f'File type {content_type} is not allowed.'}), 400

    try:
        file_bytes = doc_file.read()
        filename   = doc_file.filename

        upload_result = upload_to_firebase_storage(
            file_bytes, content_type, filename, ticket_id, 'whatsapp/admin/documents'
        )
        if not upload_result['success']:
            return jsonify({'success': False, 'error': upload_result['error']}), 500

        public_url = upload_result['download_url']
        conv_id    = _get_conversation_id(normalized_phone)
        temp_id    = str(uuid.uuid4())

        # Call outgoing flow to determine if document should be sent or converted to template
        result, was_template_sent, actual_message = _send_outgoing_flow(
            ticket_id, normalized_phone, caption or f'[Document: {filename}]',
            msg_type='document', media_url=public_url, filename=filename, caption=caption
        )

        if was_template_sent:
            _store_outgoing_message(
                ticket_id, normalized_phone, actual_message, temp_id,
                status='sending', conversation_id=conv_id,
                message_type='template',
            )
        else:
            _store_outgoing_message(
                ticket_id, normalized_phone, caption or f'[Document: {filename}]', temp_id,
                message_type='document', media_url=public_url,
                mime_type=content_type, file_name=filename,
                file_size=upload_result['file_size'], caption=caption,
                status='sending', storage_path=upload_result.get('storage_path'),
                conversation_id=conv_id,
            )

        if result['success']:
            wa_msg_id = result.get('messageId')
            updates = {
                'status':         'sent',
                'deliveryStatus': 'sent',
                'updatedAt':      admin_firestore.SERVER_TIMESTAMP,
            }
            if wa_msg_id:
                updates['whatsappMessageId'] = wa_msg_id
                updates['metaMessageId'] = wa_msg_id
            if was_template_sent:
                updates['originalAdminMessage'] = caption or f'[Document: {filename}]'
                updates['originalMediaUrl'] = public_url

            vendbeesdb.collection('tickets').document(ticket_id) \
                .collection('chats').document(temp_id).update(updates)

            if wa_msg_id:
                _store_message_mapping(wa_msg_id, ticket_id, temp_id, conv_id)

            _upsert_conversation(
                normalized_phone, ticket_id, temp_id, 'admin',
                last_message=actual_message,
                last_message_type='template' if was_template_sent else 'document',
                increment_unread=False, is_template=was_template_sent
            )
            return jsonify({'success': True, 'messageId': wa_msg_id}), 200
        else:
            vendbeesdb.collection('tickets').document(ticket_id) \
                .collection('chats').document(temp_id).update({
                    'status': 'failed',
                    'deliveryStatus': 'failed',
                    'failedReason': result.get('error', ''),
                    'updatedAt': admin_firestore.SERVER_TIMESTAMP,
                })
            return jsonify({'success': False, 'error': result.get('error', 'Failed to send document.')}), 502

    except Exception as exc:
        print(f"[WA] send-document error: {exc}", file=sys.stderr)
        return jsonify({'success': False, 'error': f'Server error: {str(exc)}'}), 500


@whatsapp_bp.route('/api/whatsapp/upload-media', methods=['POST'])
def upload_media():
    """
    Upload a media file to Firebase Storage (does not send via WhatsApp).
    Multipart: ticketId, file
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
        filename   = media_file.filename

        upload_result = upload_to_firebase_storage(
            file_bytes, content_type, filename, ticket_id, 'whatsapp/admin/misc'
        )
        if not upload_result['success']:
            return jsonify({'success': False, 'error': upload_result['error']}), 500

        return jsonify({
            'success':     True,
            'downloadUrl': upload_result['download_url'],
            'fileName':    filename,
            'fileSize':    upload_result['file_size'],
            'mimeType':    content_type,
        }), 200

    except Exception as exc:
        print(f"[WA] upload-media error: {exc}", file=sys.stderr)
        return jsonify({'success': False, 'error': f'Server error: {str(exc)}'}), 500


# =============================================================================
# INTERNAL NOTES ENDPOINT
# =============================================================================

@whatsapp_bp.route('/api/whatsapp/internal-note', methods=['POST'])
def add_internal_note():
    """
    Store an internal admin note in the ticket chat (never sent to WhatsApp).
    Request:  { ticketId, note }
    Response: { success, noteId }
    """
    data = request.get_json()
    if not data:
        return jsonify({'success': False, 'error': 'Request body is required.'}), 400

    ticket_id = data.get('ticketId')
    note      = data.get('note', '').strip()

    if not ticket_id:
        return jsonify({'success': False, 'error': 'ticketId is required.'}), 400
    if not note:
        return jsonify({'success': False, 'error': 'note is required.'}), 400

    try:
        doc_id = str(uuid.uuid4())
        now = admin_firestore.SERVER_TIMESTAMP
        doc_data = {
            'messageId':         doc_id,
            'ticketId':          ticket_id,
            'conversationId':    None,
            'senderType':        'internal',
            'sender':            'internal',
            'senderPhone':       None,
            'receiver':          None,
            'receiverPhone':     None,
            'message':           note,
            'text':              note,
            'messageType':       'note',
            'caption':           None,
            'mediaType':         None,
            'firebaseStoragePath': None,
            'firebaseDownloadUrl': None,
            'mediaUrl':          None,
            'storagePath':       None,
            'mimeType':          None,
            'fileName':          None,
            'fileSize':          None,
            'duration':          None,
            'whatsappMessageId': None,
            'metaMessageId':     None,
            'metaMediaId':       None,
            'replyToMessageId':  None,
            'latitude':          None,
            'longitude':         None,
            'status':            'stored',
            'deliveryStatus':    'stored',
            'readStatus':        'read',
            'failedReason':      None,
            'createdAt':         now,
            'updatedAt':         now,
            'timestamp':         now,
        }
        vendbeesdb.collection('tickets').document(ticket_id) \
            .collection('chats').document(doc_id).set(doc_data)
        return jsonify({'success': True, 'noteId': doc_id}), 200

    except Exception as exc:
        print(f"[WA] internal-note error: {exc}", file=sys.stderr)
        return jsonify({'success': False, 'error': f'Server error: {str(exc)}'}), 500
