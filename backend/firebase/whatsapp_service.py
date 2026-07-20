"""
WhatsApp Cloud API Service — Production Hardened
Handles all communication with Meta's WhatsApp Business Cloud API.

All credentials are read from environment variables — never hardcoded.
Supports: text, image, document, template messages.
Media: download from Meta, upload to Firebase Storage.
"""

import os
import re
import time
import sys
import uuid
import requests
from dotenv import load_dotenv

# ── Env file loading (multi-location search) ──────────────────────────────────
_current_dir    = os.path.dirname(os.path.abspath(__file__))
_parent_dir     = os.path.dirname(_current_dir)
_grandparent    = os.path.dirname(_parent_dir)

for _env_path in [
    os.path.join(_parent_dir,  '.env'),
    os.path.join(_grandparent, '.env'),
    os.path.join(_current_dir,  '.env'),
]:
    if os.path.exists(_env_path):
        load_dotenv(_env_path, override=False)

# ── Credentials — all from environment variables ──────────────────────────────
WHATSAPP_TOKEN           = os.environ.get('WHATSAPP_TOKEN', '')
WHATSAPP_PHONE_NUMBER_ID = os.environ.get('WHATSAPP_PHONE_NUMBER_ID', '')
WHATSAPP_WABA_ID         = os.environ.get('WHATSAPP_WABA_ID', '')
WHATSAPP_API_VERSION     = os.environ.get('WHATSAPP_API_VERSION', 'v23.0')
WHATSAPP_VERIFY_TOKEN    = os.environ.get('WHATSAPP_VERIFY_TOKEN', '')
WHATSAPP_APP_SECRET      = os.environ.get('WHATSAPP_APP_SECRET', '')

# Firebase Storage bucket (from env, with fallback to known default)
_STORAGE_BUCKET = os.environ.get(
    'FIREBASE_STORAGE_BUCKET', 'vendbees-60d7b.firebasestorage.app'
)

BASE_URL = (
    f"https://graph.facebook.com/{WHATSAPP_API_VERSION}"
    f"/{WHATSAPP_PHONE_NUMBER_ID}/messages"
)


def reload_whatsapp_config():
    """
    Reload the .env file and return current credentials as a tuple.
    This allows switching from test to production number by only
    changing environment variables and redeploying — no code changes.
    """
    for _env_path in [
        os.path.join(_parent_dir,  '.env'),
        os.path.join(_grandparent, '.env'),
        os.path.join(_current_dir,  '.env'),
    ]:
        if os.path.exists(_env_path):
            load_dotenv(_env_path, override=True)
            break

    token      = os.environ.get('WHATSAPP_TOKEN', '')
    phone_id   = os.environ.get('WHATSAPP_PHONE_NUMBER_ID', '')
    waba_id    = os.environ.get('WHATSAPP_WABA_ID', '')
    api_ver    = os.environ.get('WHATSAPP_API_VERSION', 'v23.0')
    verify_tok = os.environ.get('WHATSAPP_VERIFY_TOKEN', '')
    app_secret = os.environ.get('WHATSAPP_APP_SECRET', '')
    base_url   = f"https://graph.facebook.com/{api_ver}/{phone_id}/messages"

    return token, phone_id, waba_id, api_ver, verify_tok, base_url


# ── Allowed MIME types for incoming AND outgoing media ────────────────────────
ALLOWED_MIME_TYPES = {
    # Images
    'image/jpeg',
    'image/png',
    'image/webp',
    'image/gif',
    'image/webp',   # stickers arrive as webp
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

# ── MIME → extension mapping ──────────────────────────────────────────────────
_MIME_EXT = {
    'image/jpeg':       '.jpg',
    'image/png':        '.png',
    'image/webp':       '.webp',
    'image/gif':        '.gif',
    'audio/ogg':        '.ogg',
    'audio/mpeg':       '.mp3',
    'audio/mp4':        '.m4a',
    'audio/amr':        '.amr',
    'audio/aac':        '.aac',
    'video/mp4':        '.mp4',
    'video/3gpp':       '.3gp',
    'application/pdf':  '.pdf',
    'application/msword': '.doc',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document': '.docx',
    'application/vnd.ms-excel':              '.xls',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': '.xlsx',
    'application/vnd.ms-powerpoint':         '.ppt',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation': '.pptx',
    'text/plain':        '.txt',
    'application/zip':  '.zip',
}


def get_media_extension(mime_type: str) -> str:
    """Return file extension (with leading dot) for a MIME type."""
    return _MIME_EXT.get(mime_type, '.bin')


# ── Meta API error code mapping ───────────────────────────────────────────────
ERROR_MESSAGES = {
    131000: 'Something went wrong. Please try again.',
    131005: 'WhatsApp access token has expired. Contact administrator.',
    131009: 'This phone number is not registered on WhatsApp.',
    131021: 'WhatsApp rate limit reached. Please wait and try again.',
    131026: 'Message could not be delivered. Recipient may have blocked messages.',
    131047: 'Message expired (24-hour window closed).',
    131051: 'Invalid message type.',
    132000: 'Message template is invalid or not approved.',
    133000: 'Server temporarily unavailable. Please try again later.',
    133010: 'Phone number is not valid for WhatsApp messaging.',
    135000: 'Generic WhatsApp API error. Please try again.',
    368:    'Temporarily blocked due to rate limiting.',
    100:    'Invalid parameter in the request.',
    190:    'WhatsApp access token has expired or is invalid.',
}

MAX_RETRIES     = 2
RETRY_DELAY_BASE = 1  # seconds


# =============================================================================
# PHONE VALIDATION
# =============================================================================

def validate_phone(phone):
    """
    Validate and normalize a phone number to E.164 format.
    Strips non-digits; auto-prepends '91' (India) for 10-digit numbers.
    Returns (is_valid: bool, normalized_phone: str|None, error: str|None).
    """
    if not phone:
        return False, None, 'Phone number is required.'

    digits = re.sub(r'[^0-9]', '', str(phone))
    if not digits:
        return False, None, 'Phone number contains no digits.'

    # Remove leading zeros (but keep at least one digit)
    digits = digits.lstrip('0') or digits

    if len(digits) == 10:
        digits = '91' + digits

    if len(digits) < 7 or len(digits) > 15:
        return False, None, f'Phone number must be 7–15 digits. Got {len(digits)}.'

    return True, digits, None


# =============================================================================
# INTERNAL REQUEST HELPERS
# =============================================================================

def _get_headers(token: str) -> dict:
    return {
        'Authorization': f'Bearer {token}',
        'Content-Type':  'application/json',
    }


def _handle_api_error(response) -> dict:
    """Parse a non-2xx Meta API response into a structured error dict."""
    try:
        error_data   = response.json().get('error', {})
        error_code   = error_data.get('code', 0)
        error_subcode = error_data.get('error_subcode', 0)
        friendly     = ERROR_MESSAGES.get(
            error_subcode,
            ERROR_MESSAGES.get(error_code, error_data.get('message', 'Unknown WhatsApp API error.'))
        )
        return {
            'success':       False,
            'error':         friendly,
            'error_code':    error_code,
            'error_subcode': error_subcode,
            'details':       error_data.get('message', ''),
        }
    except Exception:
        return {
            'success':    False,
            'error':      f'WhatsApp API returned status {response.status_code}.',
            'error_code': response.status_code,
        }


def _make_request(payload: dict, retry_count: int = 0) -> dict:
    """
    POST to the WhatsApp Cloud API with exponential-backoff retry.
    Retries on 429, 5xx, timeouts, and connection errors.
    """
    token, phone_id, _, _, _, base_url = reload_whatsapp_config()

    if not token or not phone_id:
        return {
            'success': False,
            'error':   (
                'WhatsApp API credentials not configured. '
                'Set WHATSAPP_TOKEN and WHATSAPP_PHONE_NUMBER_ID in .env.'
            ),
        }

    try:
        resp = requests.post(
            base_url,
            json=payload,
            headers=_get_headers(token),
            timeout=30,
        )

        if resp.status_code in (200, 201):
            data = resp.json()
            message_id = data.get('messages', [{}])[0].get('id')
            return {'success': True, 'messageId': message_id, 'response': data}

        # Retry on rate-limit or server errors
        if resp.status_code in (429, 500, 502, 503, 504) and retry_count < MAX_RETRIES:
            delay = RETRY_DELAY_BASE * (2 ** retry_count)
            time.sleep(delay)
            return _make_request(payload, retry_count + 1)

        return _handle_api_error(resp)

    except requests.exceptions.Timeout:
        if retry_count < MAX_RETRIES:
            time.sleep(RETRY_DELAY_BASE * (2 ** retry_count))
            return _make_request(payload, retry_count + 1)
        return {'success': False, 'error': 'WhatsApp API request timed out after retries.'}

    except requests.exceptions.ConnectionError:
        if retry_count < MAX_RETRIES:
            time.sleep(RETRY_DELAY_BASE * (2 ** retry_count))
            return _make_request(payload, retry_count + 1)
        return {'success': False, 'error': 'Failed to connect to WhatsApp API. Check network.'}

    except Exception as exc:
        return {'success': False, 'error': f'Unexpected error: {str(exc)}'}


# =============================================================================
# OUTGOING MESSAGE FUNCTIONS
# =============================================================================

def send_text_message(phone: str, message: str) -> dict:
    """
    Send a plain-text WhatsApp message.
    Returns { success, messageId } or { success: False, error }.
    """
    is_valid, norm_phone, err = validate_phone(phone)
    if not is_valid:
        return {'success': False, 'error': err}

    payload = {
        'messaging_product': 'whatsapp',
        'recipient_type':    'individual',
        'to':                norm_phone,
        'type':              'text',
        'text':              {'preview_url': False, 'body': message},
    }
    return _make_request(payload)


def send_template_message(phone: str, template_name: str,
                          language_code: str = 'en',
                          components: list = None) -> dict:
    """
    Send a pre-approved Meta template message.
    Returns { success, messageId } or { success: False, error }.
    """
    is_valid, norm_phone, err = validate_phone(phone)
    if not is_valid:
        return {'success': False, 'error': err}

    template = {'name': template_name, 'language': {'code': language_code}}
    if components:
        template['components'] = components

    payload = {
        'messaging_product': 'whatsapp',
        'recipient_type':    'individual',
        'to':                norm_phone,
        'type':              'template',
        'template':          template,
    }
    return _make_request(payload)


def send_image_message(phone: str, image_url: str, caption: str = '') -> dict:
    """
    Send an image via a public Firebase Storage URL.
    Returns { success, messageId } or { success: False, error }.
    """
    is_valid, norm_phone, err = validate_phone(phone)
    if not is_valid:
        return {'success': False, 'error': err}

    image_obj = {'link': image_url}
    if caption:
        image_obj['caption'] = caption

    payload = {
        'messaging_product': 'whatsapp',
        'recipient_type':    'individual',
        'to':                norm_phone,
        'type':              'image',
        'image':             image_obj,
    }
    return _make_request(payload)


def send_document_message(phone: str, document_url: str,
                          filename: str, caption: str = '') -> dict:
    """
    Send a document via a public Firebase Storage URL.
    Returns { success, messageId } or { success: False, error }.
    """
    is_valid, norm_phone, err = validate_phone(phone)
    if not is_valid:
        return {'success': False, 'error': err}

    doc_obj = {'link': document_url, 'filename': filename}
    if caption:
        doc_obj['caption'] = caption

    payload = {
        'messaging_product': 'whatsapp',
        'recipient_type':    'individual',
        'to':                norm_phone,
        'type':              'document',
        'document':          doc_obj,
    }
    return _make_request(payload)


def get_status_notification_message(status: str, student_name: str, ticket_id: str):
    """
    Convenience wrapper: return the auto-notification message for a status change.
    Delegates to NotificationBuilder.
    """
    from notification_builder import NotificationBuilder
    complaint_data = {
        'ticket_id': ticket_id,
        'ticketId':  ticket_id,
        'fullName':  student_name,
        'status':    status,
    }
    return NotificationBuilder.build_notification(complaint_data, status)


# =============================================================================
# MEDIA DOWNLOAD (from Meta)
# =============================================================================

def download_media(media_id: str) -> dict:
    """
    Download binary media from Meta WhatsApp Cloud API.

    Two-step process:
      1. GET the media URL from the Graph API using media_id.
      2. GET the actual binary content from that URL.

    Returns:
      { success: True, content_bytes, mime_type, file_size }
      { success: False, error }
    """
    token, _, _, api_version, _, _ = reload_whatsapp_config()
    if not token:
        return {'success': False, 'error': 'WhatsApp token not configured.'}

    try:
        # Step 1: Retrieve media metadata (URL) from Graph API
        meta_url  = f"https://graph.facebook.com/{api_version}/{media_id}"
        meta_resp = requests.get(
            meta_url,
            headers={'Authorization': f'Bearer {token}'},
            timeout=30,
        )
        if meta_resp.status_code != 200:
            return {
                'success': False,
                'error': f'Failed to get media URL. Status {meta_resp.status_code}.',
            }

        meta_data  = meta_resp.json()
        media_url  = meta_data.get('url')
        mime_type  = meta_data.get('mime_type', 'application/octet-stream')

        if not media_url:
            return {'success': False, 'error': 'Media URL not found in API response.'}

        # Step 2: Download binary content
        dl_resp = requests.get(
            media_url,
            headers={'Authorization': f'Bearer {token}'},
            timeout=60,
        )
        if dl_resp.status_code != 200:
            return {
                'success': False,
                'error': f'Failed to download media content. Status {dl_resp.status_code}.',
            }

        return {
            'success':       True,
            'content_bytes': dl_resp.content,
            'mime_type':     mime_type,
            'file_size':     len(dl_resp.content),
        }

    except requests.exceptions.Timeout:
        return {'success': False, 'error': 'Media download timed out.'}
    except requests.exceptions.ConnectionError:
        return {'success': False, 'error': 'Failed to connect for media download.'}
    except Exception as exc:
        return {'success': False, 'error': f'Media download error: {str(exc)}'}


# =============================================================================
# FIREBASE STORAGE UPLOAD
# =============================================================================

def upload_to_firebase_storage(
    file_bytes: bytes,
    mime_type:  str,
    filename:   str,
    ticket_id:  str,
    media_category: str = 'whatsapp/misc',
) -> dict:
    """
    Upload binary content to Firebase Storage and return a tokenised download URL.

    Storage layout:
      WhatsApp student media:
        whatsapp/{ticketId}/student/images/
        whatsapp/{ticketId}/student/voice/
        whatsapp/{ticketId}/student/audio/
        whatsapp/{ticketId}/student/documents/
        whatsapp/{ticketId}/student/videos/
        whatsapp/{ticketId}/student/stickers/

      WhatsApp admin media:
        whatsapp/{ticketId}/admin/images/
        whatsapp/{ticketId}/admin/voice/
        whatsapp/{ticketId}/admin/audio/
        whatsapp/{ticketId}/admin/documents/
        whatsapp/{ticketId}/admin/videos/

      Complaint proof images (existing, unchanged):
        complaints/{ticketId}/proof/

    :param media_category: sub-path string, e.g. 'whatsapp/student/images'.
                           The caller constructs this; never mix with proof.
    :returns: { success, download_url, file_size, storage_path } or
              { success: False, error }
    """
    import firebase_admin.storage as _fbs

    try:
        bucket        = _fbs.bucket(_STORAGE_BUCKET)
        unique_prefix = str(uuid.uuid4())[:8]
        safe_name     = (filename or 'file').replace(' ', '_').replace('/', '_')
        blob_path     = f"{media_category}/{ticket_id}/{unique_prefix}_{safe_name}"
        blob          = bucket.blob(blob_path)

        # Generate a download token so the URL is usable from the frontend
        # without Firebase Authentication or making the bucket public.
        download_token = str(uuid.uuid4())
        blob.metadata  = {'firebaseStorageDownloadTokens': download_token}

        blob.upload_from_string(file_bytes, content_type=mime_type)
        blob.patch()   # apply the metadata (token)

        encoded_path = blob_path.replace('/', '%2F')
        download_url = (
            f"https://firebasestorage.googleapis.com/v0/b/{_STORAGE_BUCKET}/o/"
            f"{encoded_path}?alt=media&token={download_token}"
        )

        return {
            'success':      True,
            'download_url': download_url,
            'file_size':    len(file_bytes),
            'storage_path': blob_path,
        }

    except Exception as exc:
        print(f"[STORAGE] Upload error: {exc}", file=sys.stderr)
        return {'success': False, 'error': f'Firebase Storage upload error: {str(exc)}'}
