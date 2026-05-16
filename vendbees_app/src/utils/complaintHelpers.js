/**
 * Complaint data normalization helpers.
 * Maps actual Firestore camelCase fields to the shape used by the admin UI.
 *
 * Firestore ticket schema:
 *   ticketId, type, fullName, mobileNumber, registerNumber,
 *   machineId, issueType, complaintText, attachments,
 *   status, rewarded, createdAt (Timestamp)
 *
 * Firestore feedback schema:
 *   ticketId, type, fullName, mobileNumber, registerNumber,
 *   complaintText, status, rewarded, createdAt (Timestamp)
 */

/** Safely convert Firestore Timestamp, ISO string, or Date to a JS Date */
export function toSafeDate(val) {
    if (!val) return new Date(0);
    if (val?.toDate) return val.toDate();           // Firestore Timestamp
    if (val instanceof Date) return val;
    const d = new Date(val);
    return isNaN(d.getTime()) ? new Date(0) : d;
}

/** Normalize a ticket doc from Firestore into consistent shape */
export function normalizeTicket(raw, docId) {
    return {
        ...raw,
        id: docId,
        type: 'Ticket',
        ticket_id: raw.ticketId || raw.ticket_id || null,
        issue_type: raw.issueType || raw.issue_type || 'General Issue',
        machine_id: raw.machineId || raw.machine_id || null,
        issue_detail: raw.complaintText || raw.issue_detail || raw.message || '',
        created_at: raw.createdAt || raw.created_at || null,
        status: raw.status || 'Submitted',
        attachments: raw.attachments || [],
        student: {
            name: raw.fullName || raw.studentName || raw.student?.name || 'Anonymous',
            phone: raw.mobileNumber || raw.student?.phone || 'N/A',
            reg_no: raw.registerNumber || raw.regNo || raw.student?.reg_no || 'N/A',
        },
        chat_history: raw.chatHistory || raw.chat_history || [],
    };
}

/** Normalize a feedback doc from Firestore into consistent shape */
export function normalizeFeedback(raw, docId) {
    return {
        ...raw,
        id: docId,
        type: 'Suggestion',
        issue_type: 'Feedback',
        ticket_id: raw.ticketId || raw.ticket_id || raw.feedbackId || raw.feedback_id || null,
        feedback_id: raw.ticketId || raw.feedbackId || raw.ticket_id || raw.feedback_id || null,
        message: raw.complaintText || raw.message || raw.issue_detail || '',
        issue_detail: raw.complaintText || raw.message || raw.issue_detail || '',
        created_at: raw.createdAt || raw.created_at || null,
        status: raw.status || 'Pending',
        attachments: [],
        student: {
            name: raw.fullName || raw.studentName || raw.student?.name || 'Anonymous',
            phone: raw.mobileNumber || raw.student?.phone || 'N/A',
            reg_no: raw.registerNumber || raw.regNo || raw.student?.reg_no || 'N/A',
        },
    };
}

/** Build export-ready data array from filtered complaints */
export function buildExportData(complaints) {
    return complaints.map(c => ({
        'Ticket ID': c.ticket_id || c.feedback_id || 'N/A',
        'Type': c.type === 'Suggestion' ? 'Suggestion' : 'Complaint',
        'Issue Type': c.issue_type || 'N/A',
        'Status': c.status || 'N/A',
        'Date Created': toSafeDate(c.created_at).toLocaleString(),
        'Machine ID': c.machine_id || 'N/A',
        'Student Name': c.student?.name || 'Anonymous',
        'Mobile': c.student?.phone || 'N/A',
        'Register No': c.student?.reg_no || 'N/A',
        'Description': c.issue_detail || c.message || '',
        'Attachments Count': c.attachments?.length || 0,
    }));
}

/** Generate CSV string from export data */
export function generateCSV(data) {
    if (!data.length) return '';
    const headers = Object.keys(data[0]);
    const rows = [headers.join(',')];
    data.forEach(row => {
        rows.push(headers.map(h => {
            const val = (row[h] ?? '').toString().replace(/"/g, '""');
            return `"${val}"`;
        }).join(','));
    });
    return rows.join('\n');
}

/** Generate a styled HTML table for PDF export */
export function generatePDFHtml(data) {
    const cols = ['Ticket ID','Type','Issue Type','Status','Date Created','Machine ID','Student Name','Mobile'];
    const headerCells = cols.map(h =>
        `<th style="padding:6px 8px;text-align:left;border-bottom:2px solid #e2e8f0;font-weight:700;color:#475569;font-size:9px;">${h}</th>`
    ).join('');
    const bodyRows = data.map((r, i) =>
        `<tr style="background:${i % 2 ? '#f8fafc' : '#fff'};">${cols.map(h =>
            `<td style="padding:5px 8px;border-bottom:1px solid #f1f5f9;font-size:9px;">${r[h] || ''}</td>`
        ).join('')}</tr>`
    ).join('');
    return `<div style="font-family:Inter,sans-serif;padding:20px;">
        <h1 style="font-size:18px;color:#1e293b;margin-bottom:4px;">Complaints Report</h1>
        <p style="font-size:11px;color:#64748b;margin-bottom:16px;">Generated: ${new Date().toLocaleString()} • ${data.length} records</p>
        <table style="width:100%;border-collapse:collapse;">
            <thead><tr style="background:#f1f5f9;">${headerCells}</tr></thead>
            <tbody>${bodyRows}</tbody>
        </table>
    </div>`;
}
