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
    const isLocalhost = typeof window !== 'undefined' && (
        window.location.hostname === 'localhost' ||
        window.location.hostname === '127.0.0.1' ||
        window.location.hostname.startsWith('192.168')
    );
    return isLocalhost
        ? 'http://localhost:3002/api'
        : (import.meta.env.VITE_API_URL || 'https://vendbees-inventory-backend-333114755202.asia-south1.run.app/api');
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
        const response = await fetch(url, {
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
        if (error.name === 'TypeError' && error.message.includes('fetch')) {
            return { success: false, error: 'Network error. Please check your connection and ensure the backend is running.' };
        }
        return { success: false, error: error.message || 'Failed to send message.' };
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
        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                ticketId,              // Firestore doc ID — used by backend to locate document
                status,
                phone,
                studentName: complaint?.student?.name || complaint?.fullName || 'Student',
                ticketDisplayId,       // Display-safe ticket ID shown in WhatsApp message
                // Also pass full complaint data so backend can build issue-type-specific messages
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
        return { success: false, error: error.message || 'Failed to send notification.' };
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
        const response = await fetch(url, {
            method: 'POST',
            body: formData,
        });
        const data = await response.json();
        if (!response.ok) {
            throw new Error(data.error || 'Failed to send image');
        }
        return data;
    } catch (error) {
        return { success: false, error: error.message || 'Failed to send image.' };
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
        const response = await fetch(url, {
            method: 'POST',
            body: formData,
        });
        const data = await response.json();
        if (!response.ok) {
            throw new Error(data.error || 'Failed to send document');
        }
        return data;
    } catch (error) {
        return { success: false, error: error.message || 'Failed to send document.' };
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
        const response = await fetch(url, {
            method: 'POST',
            body: formData,
        });
        const data = await response.json();
        if (!response.ok) {
            throw new Error(data.error || 'Failed to upload media');
        }
        return data;
    } catch (error) {
        return { success: false, error: error.message || 'Failed to upload media.' };
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
        const response = await fetch(url, {
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
        return { success: false, error: error.message || 'Failed to add internal note.' };
    }
}

