/**
 * WhatsApp API Helper
 * Frontend utility for communicating with the WhatsApp backend endpoints.
 * All WhatsApp credentials remain server-side — this module only makes
 * HTTP calls to the Flask backend REST API.
 */

/**
 * Get the backend API base URL using the same pattern as DataContext.
 * Supports localhost development and Cloud Run production.
 */
function getApiUrl() {
    return (import.meta.env.VITE_API_URL || 'https://vendbees-inventory-backend-333114755202.asia-south1.run.app/api');
}

/**
 * Fetch with a timeout using AbortController.
 * @param {string} url
 * @param {RequestInit} options
 * @param {number} timeoutMs  - milliseconds before aborting (default 30 000)
 */
async function fetchWithTimeout(url, options = {}, timeoutMs = 30_000) {
    const controller = new AbortController();
    const timerId = setTimeout(() => controller.abort(), timeoutMs);
    try {
        return await fetch(url, { ...options, signal: controller.signal });
    } finally {
        clearTimeout(timerId);
    }
}

/**
 * Map a fetch error to a user-friendly message string.
 * @param {Error} error
 */
function _toUserError(error) {
    if (error.name === 'AbortError') {
        return 'Request timed out. The backend may be slow or unreachable.';
    }
    if (error.name === 'TypeError' && error.message.includes('fetch')) {
        return 'Network error. Please check your connection and ensure the backend is running.';
    }
    return error.message || 'An unknown error occurred.';
}


/**
 * Send a WhatsApp message to a student for a specific complaint.
 * @param {string} ticketId - Firestore document ID of the ticket
 * @param {string} phone - Student's phone number (will be normalized server-side)
 * @param {string} message - Message text content
 * @returns {Promise<{success: boolean, messageId?: string, error?: string}>}
 */
export async function sendWhatsAppMessage(ticketId, phone, message) {
    const url = `${getApiUrl()}/whatsapp/send`;
    try {
        const response = await fetchWithTimeout(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ticketId, phone, message }),
        });
        const data = await response.json();
        if (!response.ok) {
            throw new Error(data.error || `Request failed with status ${response.status}`);
        }
        return data;
    } catch (error) {
        return { success: false, error: _toUserError(error) };
    }
}

/**
 * Send automatic WhatsApp status notification when complaint status changes.
 * The backend generates the notification message from templates.
 * This is fire-and-forget — UI should not block on this call.
 * @param {string} ticketId - Firestore document ID of the ticket
 * @param {string} status - New complaint status (Submitted, In Review, Pending, Resolved, Refunded)
 * @param {object} complaint - Complaint data object with student info and ticket_id
 * @returns {Promise<{success: boolean, messageId?: string, error?: string}>}
 */
export async function sendStatusNotification(ticketId, status, complaint) {
    const phone = complaint?.student?.phone || complaint?.mobileNumber;
    if (!phone || phone === 'N/A') {
        return { success: false, error: 'No phone number available for notification.' };
    }

    // Always prefer the stored display ticket_id (e.g. VB-TICK-0001) over
    // the raw Firestore document ID (an auto-generated hash).
    // ticket_id is the field stored ON the document; ticketId param is the Firestore doc ID.
    const ticketDisplayId = (
        complaint?.ticket_id ||      // normalized display field (set by normalizeTicket)
        complaint?.ticketId ||       // raw Firestore field named 'ticketId'
        null                         // do NOT fall back to ticketId (Firestore doc ID)
    );

    const url = `${getApiUrl()}/whatsapp/notify`;
    try {
        const response = await fetchWithTimeout(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                ticketId,
                status,
                phone,
                studentName: complaint?.student?.name || complaint?.fullName || 'Student',
                ticketDisplayId,
                issueType: complaint?.issue_type || complaint?.issueType || 'General',
                machineId: complaint?.machine_id || complaint?.machineId || '',
                complaintText: complaint?.issue_detail || complaint?.complaintText || complaint?.message || '',
            }),
        });
        const data = await response.json();
        if (!response.ok) {
            throw new Error(data.error || `Notification request failed with status ${response.status}`);
        }
        return data;
    } catch (error) {
        return { success: false, error: _toUserError(error) };
    }
}


/**
 * Send an image with caption via WhatsApp.
 * @param {string} ticketId 
 * @param {string} phone 
 * @param {File} imageFile 
 * @param {string} caption 
 */
export async function sendWhatsAppImage(ticketId, phone, imageFile, caption = '') {
    const url = `${getApiUrl()}/whatsapp/send-image`;
    const formData = new FormData();
    formData.append('ticketId', ticketId);
    formData.append('phone', phone);
    formData.append('caption', caption);
    formData.append('image', imageFile);

    try {
        const response = await fetchWithTimeout(url, {
            method: 'POST',
            body: formData,
        }, 60_000);  // 60s for file uploads
        const data = await response.json();
        if (!response.ok) {
            throw new Error(data.error || 'Failed to send image');
        }
        return data;
    } catch (error) {
        return { success: false, error: _toUserError(error) };
    }
}

/**
 * Send a document with caption/filename via WhatsApp.
 * @param {string} ticketId 
 * @param {string} phone 
 * @param {File} docFile 
 * @param {string} caption 
 */
export async function sendWhatsAppDocument(ticketId, phone, docFile, caption = '') {
    const url = `${getApiUrl()}/whatsapp/send-document`;
    const formData = new FormData();
    formData.append('ticketId', ticketId);
    formData.append('phone', phone);
    formData.append('caption', caption);
    formData.append('document', docFile);

    try {
        const response = await fetchWithTimeout(url, {
            method: 'POST',
            body: formData,
        }, 60_000);  // 60s for file uploads
        const data = await response.json();
        if (!response.ok) {
            throw new Error(data.error || 'Failed to send document');
        }
        return data;
    } catch (error) {
        return { success: false, error: _toUserError(error) };
    }
}

/**
 * Upload a media file without sending it via WhatsApp.
 * @param {File} file 
 * @param {string} ticketId 
 */
export async function uploadMedia(file, ticketId) {
    const url = `${getApiUrl()}/whatsapp/upload-media`;
    const formData = new FormData();
    formData.append('ticketId', ticketId);
    formData.append('file', file);

    try {
        const response = await fetchWithTimeout(url, {
            method: 'POST',
            body: formData,
        }, 60_000);  // 60s for file uploads
        const data = await response.json();
        if (!response.ok) {
            throw new Error(data.error || 'Failed to upload media');
        }
        return data;
    } catch (error) {
        return { success: false, error: _toUserError(error) };
    }
}

/**
 * Send an internal admin note for the ticket.
 * @param {string} ticketId 
 * @param {string} note 
 */
export async function sendInternalNote(ticketId, note) {
    const url = `${getApiUrl()}/whatsapp/internal-note`;
    try {
        const response = await fetchWithTimeout(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ticketId, note }),
        });
        const data = await response.json();
        if (!response.ok) {
            throw new Error(data.error || 'Failed to add internal note');
        }
        return data;
    } catch (error) {
        return { success: false, error: _toUserError(error) };
    }
}

