"""
WhatsApp Cloud API Service
Handles all communication with Meta's WhatsApp Business Cloud API.
All credentials read from environment variables — never exposed to frontend.
"""
import os
import re
import time
import requests
from dotenv import load_dotenv

# 1. Try loading from current working directory
load_dotenv()

# 2. Try loading from parent directory of this file (which is backend/)
current_dir = os.path.dirname(os.path.abspath(__file__))
parent_dir = os.path.dirname(current_dir)
parent_env = os.path.join(parent_dir, '.env')
if os.path.exists(parent_env):
    load_dotenv(parent_env)

# 3. Try loading from grandparent directory (project root)
grandparent_dir = os.path.dirname(parent_dir)
grandparent_env = os.path.join(grandparent_dir, '.env')
if os.path.exists(grandparent_env):
    load_dotenv(grandparent_env)

# WhatsApp Cloud API Configuration (from environment variables only)
WHATSAPP_TOKEN = os.environ.get('WHATSAPP_TOKEN', '')
WHATSAPP_PHONE_NUMBER_ID = os.environ.get('WHATSAPP_PHONE_NUMBER_ID', '')
WHATSAPP_WABA_ID = os.environ.get('WHATSAPP_WABA_ID', '')
WHATSAPP_API_VERSION = os.environ.get('WHATSAPP_API_VERSION', 'v23.0')
WHATSAPP_VERIFY_TOKEN = os.environ.get('WHATSAPP_VERIFY_TOKEN', '')

BASE_URL = f"https://graph.facebook.com/{WHATSAPP_API_VERSION}/{WHATSAPP_PHONE_NUMBER_ID}/messages"

def reload_whatsapp_config():
    """Reload .env file and return active WhatsApp credentials dynamically."""
    if os.path.exists(parent_env):
        load_dotenv(parent_env, override=True)
    elif os.path.exists(grandparent_env):
        load_dotenv(grandparent_env, override=True)
    else:
        load_dotenv(override=True)
        
    token = os.environ.get('WHATSAPP_TOKEN', '')
    phone_id = os.environ.get('WHATSAPP_PHONE_NUMBER_ID', '')
    waba_id = os.environ.get('WHATSAPP_WABA_ID', '')
    api_version = os.environ.get('WHATSAPP_API_VERSION', 'v23.0')
    verify_token = os.environ.get('WHATSAPP_VERIFY_TOKEN', '')
    
    base_url = f"https://graph.facebook.com/{api_version}/{phone_id}/messages"
    
    return token, phone_id, waba_id, api_version, verify_token, base_url

# Meta API error code mapping to user-friendly messages
ERROR_MESSAGES = {
    131000: "Something went wrong. Please try again.",
    131005: "WhatsApp access token has expired. Please contact administrator.",
    131009: "This phone number is not registered on WhatsApp.",
    131021: "WhatsApp rate limit reached. Please wait and try again.",
    131026: "Message could not be delivered. The recipient may have blocked messages.",
    131047: "This message was not delivered within 24 hours and has expired.",
    131051: "Invalid message type.",
    132000: "The message template is invalid or not approved.",
    133000: "Server is temporarily unavailable. Please try again later.",
    133010: "Phone number is not valid for WhatsApp messaging.",
    135000: "Generic WhatsApp API error. Please try again.",
    368: "Temporarily blocked due to rate limiting.",
    100: "Invalid parameter in the request.",
    190: "WhatsApp access token has expired or is invalid. Please generate a new temporary token in the Meta Developers Console.",
}

MAX_RETRIES = 3
RETRY_DELAY_BASE = 1  # seconds


def validate_phone(phone):
    """
    Validate and normalize phone number to E.164 format.
    Strips non-digits, auto-prepends '91' (India) if 10 digits.
    Returns (is_valid, normalized_phone, error_message)
    """
    if not phone:
        return False, None, "Phone number is required."
    
    # Strip all non-digit characters
    digits = re.sub(r'[^0-9]', '', str(phone))
    
    if not digits:
        return False, None, "Phone number contains no digits."
    
    # Remove leading zeros
    digits = digits.lstrip('0') or digits
    
    # If 10 digits (Indian local number), prepend country code
    if len(digits) == 10:
        digits = '91' + digits
    
    # Validate length (E.164: 7-15 digits including country code)
    if len(digits) < 7 or len(digits) > 15:
        return False, None, f"Phone number must be 7-15 digits. Got {len(digits)}."
    
    return True, digits, None


def _get_headers(token):
    """Return authorization headers for WhatsApp Cloud API."""
    return {
        'Authorization': f'Bearer {token}',
        'Content-Type': 'application/json',
    }


def _handle_api_error(response):
    """Parse Meta API error response and return a structured error dict."""
    try:
        error_data = response.json().get('error', {})
        error_code = error_data.get('code', 0)
        error_subcode = error_data.get('error_subcode', 0)
        
        friendly_message = ERROR_MESSAGES.get(
            error_subcode,
            ERROR_MESSAGES.get(error_code, error_data.get('message', 'Unknown WhatsApp API error.'))
        )
        
        return {
            'success': False,
            'error': friendly_message,
            'error_code': error_code,
            'error_subcode': error_subcode,
            'details': error_data.get('message', ''),
        }
    except Exception:
        return {
            'success': False,
            'error': f'WhatsApp API returned status {response.status_code}.',
            'error_code': response.status_code,
        }


def _make_request(payload, retry_count=0):
    """
    Make a request to the WhatsApp Cloud API with exponential backoff retry.
    Retries on 429, 5xx, timeouts, and connection errors.
    """
    token, phone_id, _, _, _, base_url = reload_whatsapp_config()
    
    if not token or not phone_id:
        return {
            'success': False,
            'error': 'WhatsApp API credentials are not configured. Set WHATSAPP_TOKEN and WHATSAPP_PHONE_NUMBER_ID in .env file.',
        }
    
    try:
        response = requests.post(
            base_url,
            json=payload,
            headers=_get_headers(token),
            timeout=30
        )
        
        if response.status_code in (200, 201):
            data = response.json()
            message_id = data.get('messages', [{}])[0].get('id', None)
            return {
                'success': True,
                'messageId': message_id,
                'response': data,
            }
        
        # Retry on rate limit or server errors
        if response.status_code in (429, 500, 502, 503, 504) and retry_count < MAX_RETRIES:
            delay = RETRY_DELAY_BASE * (2 ** retry_count)
            time.sleep(delay)
            return _make_request(payload, retry_count + 1)
        
        return _handle_api_error(response)
        
    except requests.exceptions.Timeout:
        if retry_count < MAX_RETRIES:
            delay = RETRY_DELAY_BASE * (2 ** retry_count)
            time.sleep(delay)
            return _make_request(payload, retry_count + 1)
        return {'success': False, 'error': 'WhatsApp API request timed out after retries.'}
    except requests.exceptions.ConnectionError:
        if retry_count < MAX_RETRIES:
            delay = RETRY_DELAY_BASE * (2 ** retry_count)
            time.sleep(delay)
            return _make_request(payload, retry_count + 1)
        return {'success': False, 'error': 'Failed to connect to WhatsApp API. Check network.'}
    except Exception as e:
        return {'success': False, 'error': f'Unexpected error: {str(e)}'}


def send_text_message(phone, message):
    """
    Send a text message via WhatsApp Cloud API.
    Phone is validated and normalized before sending.
    Returns dict with 'success', 'messageId', or 'error'.
    """
    is_valid, normalized_phone, error = validate_phone(phone)
    if not is_valid:
        return {'success': False, 'error': error}
    
    payload = {
        'messaging_product': 'whatsapp',
        'recipient_type': 'individual',
        'to': normalized_phone,
        'type': 'text',
        'text': {
            'preview_url': False,
            'body': message,
        }
    }
    
    return _make_request(payload)


def send_template_message(phone, template_name, language_code='en', components=None):
    """
    Send a template message via WhatsApp Cloud API.
    For future use with pre-approved Meta templates.
    """
    is_valid, normalized_phone, error = validate_phone(phone)
    if not is_valid:
        return {'success': False, 'error': error}
    
    template = {
        'name': template_name,
        'language': {'code': language_code}
    }
    if components:
        template['components'] = components
    
    payload = {
        'messaging_product': 'whatsapp',
        'recipient_type': 'individual',
        'to': normalized_phone,
        'type': 'template',
        'template': template,
    }
    
    return _make_request(payload)


def get_status_notification_message(status, student_name, ticket_id):
    """
    Get the auto-notification message for a complaint status change.
    Returns formatted message string, or None if no template for this status.
    Delegates to NotificationBuilder which uses the issue-type × status matrix.
    """
    from notification_builder import NotificationBuilder
    complaint_data = {
        'ticket_id': ticket_id,   # display ID (VB-TICK-xxx) preferred
        'ticketId': ticket_id,
        'fullName': student_name,
        'status': status
    }
    return NotificationBuilder.build_notification(complaint_data, status)


# --------------------------------------------------
# MEDIA SUPPORT
# --------------------------------------------------
import sys as _sys
import uuid as _uuid
import firebase_admin.storage as _firebase_storage

# Storage bucket from env var (fallback to project default)
_STORAGE_BUCKET = os.environ.get('FIREBASE_STORAGE_BUCKET', 'vendbees-60d7b.firebasestorage.app')

# Allowed MIME types for incoming and outgoing media (security validation)
ALLOWED_MIME_TYPES = {
    # Images
    'image/jpeg',
    'image/png',
    'image/webp',
    'image/gif',
    # Audio
    'audio/ogg',
    'audio/mpeg',
    'audio/mp4',
    'audio/amr',
    'audio/aac',
    # Video
    'video/mp4',
    'video/3gpp',
    # Documents
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-powerpoint',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'text/plain',
    'application/zip',
}


def get_media_extension(mime_type):
    """
    Map a MIME type string to a file extension (with leading dot).
    Returns '.bin' for unknown types.
    """
    mime_map = {
        'image/jpeg': '.jpg',
        'image/png': '.png',
        'image/webp': '.webp',
        'image/gif': '.gif',
        'audio/ogg': '.ogg',
        'audio/mpeg': '.mp3',
        'audio/mp4': '.m4a',
        'audio/amr': '.amr',
        'audio/aac': '.aac',
        'video/mp4': '.mp4',
        'video/3gpp': '.3gp',
        'application/pdf': '.pdf',
        'application/msword': '.doc',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document': '.docx',
        'application/vnd.ms-excel': '.xls',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': '.xlsx',
        'application/vnd.ms-powerpoint': '.ppt',
        'application/vnd.openxmlformats-officedocument.presentationml.presentation': '.pptx',
        'text/plain': '.txt',
        'application/zip': '.zip',
    }
    return mime_map.get(mime_type, '.bin')


def download_media(media_id):
    """
    Download media from WhatsApp Cloud API in two steps:
    1. GET the media URL from Graph API using the media_id.
    2. GET the actual binary content from that URL.
    Returns dict with {success, content_bytes, mime_type, file_size}
    or {success: False, error}.
    """
    token, _, _, api_version, _, _ = reload_whatsapp_config()

    if not token:
        return {'success': False, 'error': 'WhatsApp token not configured.'}

    try:
        # Step 1: Retrieve media metadata (URL) from Graph API
        meta_url = f"https://graph.facebook.com/{api_version}/{media_id}"
        meta_resp = requests.get(
            meta_url,
            headers={'Authorization': f'Bearer {token}'},
            timeout=30,
        )

        if meta_resp.status_code != 200:
            return {
                'success': False,
                'error': f'Failed to get media URL. Status {meta_resp.status_code}: {meta_resp.text}',
            }

        meta_data = meta_resp.json()
        media_url = meta_data.get('url')
        mime_type = meta_data.get('mime_type', 'application/octet-stream')

        if not media_url:
            return {'success': False, 'error': 'Media URL not found in API response.'}

        # Step 2: Download the actual binary content
        download_resp = requests.get(
            media_url,
            headers={'Authorization': f'Bearer {token}'},
            timeout=60,
        )

        if download_resp.status_code != 200:
            return {
                'success': False,
                'error': f'Failed to download media. Status {download_resp.status_code}.',
            }

        content_bytes = download_resp.content
        return {
            'success': True,
            'content_bytes': content_bytes,
            'mime_type': mime_type,
            'file_size': len(content_bytes),
        }

    except requests.exceptions.Timeout:
        return {'success': False, 'error': 'Media download timed out.'}
    except requests.exceptions.ConnectionError:
        return {'success': False, 'error': 'Failed to connect for media download.'}
    except Exception as e:
        return {'success': False, 'error': f'Media download error: {str(e)}'}
def upload_to_firebase_storage(file_bytes, mime_type, filename, ticket_id, media_category='whatsapp'):
    """
    Upload binary content to Firebase Storage and return a Firebase download URL.
    Uses a download token (firebaseStorageDownloadTokens metadata) so the URL works
    from the frontend without needing bucket-level public access or Firebase auth.

    Organized storage paths:
      complaints/{ticket_id}/whatsapp/student/images/
      complaints/{ticket_id}/whatsapp/student/audio/
      complaints/{ticket_id}/whatsapp/student/documents/
      complaints/{ticket_id}/whatsapp/admin/images/
      complaints/{ticket_id}/whatsapp/admin/documents/
      complaints/{ticket_id}/proof/   (for complaint proof uploads)

    :param media_category: sub-path string, e.g. 'student/images', 'admin/images',
                           'student/audio', 'student/documents', 'admin/documents'
    :returns: dict with {success, download_url, file_size, storage_path} or {success: False, error}
    """
    try:
        bucket = _firebase_storage.bucket(_STORAGE_BUCKET)
        unique_prefix = str(_uuid.uuid4())[:8]
        # Sanitize filename: replace spaces/slashes with underscores
        safe_filename = filename.replace(' ', '_').replace('/', '_')
        blob_path = f"complaints/{ticket_id}/{media_category}/{unique_prefix}_{safe_filename}"
        blob = bucket.blob(blob_path)

        # Generate a download token so the URL is accessible from the frontend
        # without requiring Firebase Authentication or bucket public access.
        download_token = str(_uuid.uuid4())
        blob.metadata = {'firebaseStorageDownloadTokens': download_token}

        blob.upload_from_string(file_bytes, content_type=mime_type)
        # Apply the metadata (token) after upload
        blob.patch()

        # Build the Firebase Storage download URL with the token
        # This URL format works without auth and without make_public()
        encoded_path = blob_path.replace('/', '%2F')
        download_url = (
            f"https://firebasestorage.googleapis.com/v0/b/{_STORAGE_BUCKET}/o/"
            f"{encoded_path}?alt=media&token={download_token}"
        )

        print(f"[STORAGE] Uploaded {blob_path} ({len(file_bytes)} bytes)", file=_sys.stderr, flush=True)
        return {
            'success': True,
            'download_url': download_url,
            'file_size': len(file_bytes),
            'storage_path': blob_path
        }
    except Exception as e:
        print(f"[STORAGE] Upload error: {e}", file=_sys.stderr, flush=True)
        return {'success': False, 'error': f'Firebase Storage upload error: {str(e)}'}


def send_image_message(phone, image_url, caption=''):
    """
    Send an image message via WhatsApp Cloud API using a public image URL.
    Returns dict with 'success', 'messageId', or 'error' (same as send_text_message).
    """
    is_valid, normalized_phone, error = validate_phone(phone)
    if not is_valid:
        return {'success': False, 'error': error}

    image_obj = {'link': image_url}
    if caption:
        image_obj['caption'] = caption

    payload = {
        'messaging_product': 'whatsapp',
        'recipient_type': 'individual',
        'to': normalized_phone,
        'type': 'image',
        'image': image_obj,
    }

    return _make_request(payload)


def send_document_message(phone, document_url, filename, caption=''):
    """
    Send a document message via WhatsApp Cloud API using a public document URL.
    Returns dict with 'success', 'messageId', or 'error' (same as send_text_message).
    """
    is_valid, normalized_phone, error = validate_phone(phone)
    if not is_valid:
        return {'success': False, 'error': error}

    document_obj = {'link': document_url, 'filename': filename}
    if caption:
        document_obj['caption'] = caption

    payload = {
        'messaging_product': 'whatsapp',
        'recipient_type': 'individual',
        'to': normalized_phone,
        'type': 'document',
        'document': document_obj,
    }

    return _make_request(payload)
