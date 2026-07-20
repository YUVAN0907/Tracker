/**
 * Complaint data normalization helpers.
 * Maps actual Firestore camelCase fields to the shape used by the admin UI.
 *
 * Firestore ticket schema:
 *   ticketId, type, fullName, mobileNumber, registerNumber,
 *   machineId, issueType, complaintText, attachments,
 *   status, createdAt (Timestamp), resolvedAt, resolution,
 *   refundAmount
 *
 * Firestore feedback schema:
 *   ticketId, type, fullName, mobileNumber, registerNumber,
 *   complaintText, status, createdAt (Timestamp)
 *
 * WhatsApp chats sub-collection:
 *   tickets/{ticketId}/chats — queried on demand
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
        // Always use the stored display ticket_id field (VB-TICK-xxx) — never expose raw Firestore docId
        ticket_id: raw.ticketId || raw.ticket_id || null,
        issue_type: raw.issueType || raw.issue_type || 'General Issue',
        machine_id: raw.machineId || raw.machine_id || null,
        machine_name: raw.machineName || raw.machine_name || raw.machineId || raw.machine_id || null,
        issue_detail: raw.complaintText || raw.issue_detail || raw.message || '',
        created_at: raw.createdAt || raw.created_at || null,
        status: raw.status || 'Submitted',
        statusLocked: raw.statusLocked || false,
        attachments: raw.attachments || [],
        student: {
            name: raw.fullName || raw.studentName || raw.student?.name || 'Anonymous',
            phone: raw.mobileNumber || raw.phoneNumber || raw.student?.phone || 'N/A',
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
            phone: raw.mobileNumber || raw.phoneNumber || raw.student?.phone || 'N/A',
            reg_no: raw.registerNumber || raw.regNo || raw.student?.reg_no || 'N/A',
        },
    };
}

/**
 * Build export-ready data array from filtered complaints.
 * Includes all columns for CSV/Excel. PDF uses a subset via generatePDFHtml.
 * @param {Array} complaints - normalized complaint/feedback objects
 * @param {Object} options - optional flags:
 *   { includeProofUrls, includeWhatsAppData, includeResolution }
 */
export function buildExportData(complaints, options = {}) {
    return complaints.map(c => {
        const base = {
            'Ticket ID':          c.ticket_id || c.feedback_id || 'N/A',
            'Type':               c.type === 'Suggestion' ? 'Suggestion' : 'Complaint',
            'Issue Type':         c.issue_type || 'N/A',
            'Status':             c.status || 'N/A',
            'Date Created':       toSafeDate(c.created_at).toLocaleString(),
            'Machine ID':         c.machine_id || c.machine_name || 'N/A',
            'Student Name':       c.student?.name || 'Anonymous',
            'Mobile':             c.student?.phone || 'N/A',
            'Register No':        c.student?.reg_no || 'N/A',
            'Description':        c.issue_detail || c.message || '',
            'Attachments Count':  (c.attachments || []).length,
        };

        // Proof image URLs (pipe-separated) — off by default for smaller exports
        if (options.includeProofUrls) {
            base['Proof Image URLs'] = (c.attachments || []).join(' | ');
        }

        // WhatsApp communication columns
        if (options.includeWhatsAppData !== false) {
            base['WhatsApp Phone'] = c.student?.phone || 'N/A';
            base['WA Chat Count']  = c.chatCount != null ? String(c.chatCount) : 'N/A';
            base['Last WA Message'] = c.lastWhatsAppMessage
                ? String(c.lastWhatsAppMessage).slice(0, 120)
                : 'N/A';
            base['Last WA At'] = c.lastWhatsAppAt
                ? toSafeDate(c.lastWhatsAppAt).toLocaleString()
                : 'N/A';
        }

        // Resolution / Refund columns
        if (options.includeResolution !== false) {
            base['Resolved At']     = c.resolvedAt
                ? toSafeDate(c.resolvedAt).toLocaleString()
                : 'N/A';
            base['Resolution Notes'] = c.resolution || c.resolutionText || 'N/A';
            base['Refund Amount']   = c.refundAmount != null ? `₹${c.refundAmount}` : 'N/A';
        }

        return base;
    });
}

/** Generate CSV string from export data */
export function generateCSV(data) {
    if (!data.length) return '';
    const headers = Object.keys(data[0]);
    const rows = [headers.map(h => `"${h.replace(/"/g, '""')}"`).join(',')];
    data.forEach(row => {
        rows.push(headers.map(h => {
            const val = (row[h] ?? '').toString()
                .replace(/"/g, '""')   // escape quotes
                .replace(/\r?\n/g, ' '); // collapse newlines in cells
            return `"${val}"`;
        }).join(','));
    });
    return rows.join('\n');
}

/**
 * Generate a styled HTML table for PDF export.
 * Includes all columns for a comprehensive A4 landscape report.
 */
export function generatePDFHtml(data, title = 'Complaints Report') {
    const cols = [
        'Ticket ID', 'Type', 'Issue Type', 'Status',
        'Date Created', 'Machine ID', 'Student Name', 'Mobile',
        'Register No', 'Description',
        'WA Chat Count', 'Last WA At', 'Resolved At', 'Resolution Notes',
    ].filter(col => data.length === 0 || col in data[0]);

    const headerCells = cols.map(h =>
        `<th style="padding:6px 8px;text-align:left;border-bottom:2px solid #e2e8f0;font-weight:700;color:#475569;font-size:8px;white-space:nowrap;">${h}</th>`
    ).join('');
    const bodyRows = data.map((r, i) =>
        `<tr style="background:${i % 2 ? '#f8fafc' : '#fff'};"><td colspan="${cols.length}"></td></tr>`.replace(
            `<td colspan="${cols.length}"></td>`,
            cols.map(h =>
                `<td style="padding:5px 8px;border-bottom:1px solid #f1f5f9;font-size:8px;max-width:180px;word-break:break-word;">${r[h] || ''}</td>`
            ).join('')
        )
    ).join('');

    return `<div style="font-family:Inter,sans-serif;padding:20px;">
        <h1 style="font-size:16px;color:#1e293b;margin-bottom:4px;">${title}</h1>
        <p style="font-size:10px;color:#64748b;margin-bottom:16px;">Generated: ${new Date().toLocaleString()} • ${data.length} record${data.length !== 1 ? 's' : ''}</p>
        <table style="width:100%;border-collapse:collapse;">
            <thead><tr style="background:#f1f5f9;">${headerCells}</tr></thead>
            <tbody>${bodyRows}</tbody>
        </table>
    </div>`;
}

/**
 * Filter complaints by a date range.
 * @param {Array} complaints
 * @param {string} range - 'Today'|'Yesterday'|'ThisWeek'|'ThisMonth'|'Custom'|'All'
 * @param {string} customStart - ISO date string (YYYY-MM-DD), used when range === 'Custom'
 * @param {string} customEnd   - ISO date string (YYYY-MM-DD), used when range === 'Custom'
 */
export function filterByDateRange(complaints, range, customStart, customEnd) {
    if (!range || range === 'All') return complaints;

    const now = new Date();
    const startOfDay = (d) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };
    const endOfDay   = (d) => { const x = new Date(d); x.setHours(23, 59, 59, 999); return x; };

    let from, to;

    if (range === 'Today') {
        from = startOfDay(now);
        to   = endOfDay(now);
    } else if (range === 'Yesterday') {
        const y = new Date(now); y.setDate(y.getDate() - 1);
        from = startOfDay(y);
        to   = endOfDay(y);
    } else if (range === 'ThisWeek') {
        const day = now.getDay();
        const mon = new Date(now); mon.setDate(now.getDate() - (day === 0 ? 6 : day - 1));
        from = startOfDay(mon);
        to   = endOfDay(now);
    } else if (range === 'ThisMonth') {
        from = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
        to   = endOfDay(now);
    } else if (range === 'Custom' && customStart && customEnd) {
        from = startOfDay(new Date(customStart));
        to   = endOfDay(new Date(customEnd));
    } else {
        return complaints;
    }

    return complaints.filter(c => {
        const d = toSafeDate(c.created_at);
        return d >= from && d <= to;
    });
}
