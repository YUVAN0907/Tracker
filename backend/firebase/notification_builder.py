"""
AI-Ready Notification Generator Service
Generates context-aware, dynamic status notifications using complaint information.

Messages are selected using a (issue_type, status) matrix so every issue type
gets its own tailored message — not a single generic "Please check the machine."
"""

# ---------------------------------------------------------------------------
# ISSUE-TYPE × STATUS TEMPLATES
# Keys: (issue_type_lower, status)  — fallback: (None, status)
# ---------------------------------------------------------------------------

# Shared closing line
_CLOSING = "Thank you,\nVendBees Support"

# ── Machine Down ────────────────────────────────────────────────────────────
_MACHINE_DOWN = {
    'Submitted': (
        "Hello {studentName},\n\n"
        "Your complaint ({ticketId}) for Machine {machineId} — Machine Down — has been received.\n\n"
        "Issue: {complaintDescription}\n\n"
        "Our technical team will inspect the machine shortly and update you here.\n\n"
        + _CLOSING
    ),
    'In Review': (
        "Hello {studentName},\n\n"
        "We are currently inspecting Machine {machineId} for your reported issue ({ticketId}).\n\n"
        "Issue: {complaintDescription}\n\n"
        "Our technician is on-site or en-route. We will notify you once the machine is operational.\n\n"
        + _CLOSING
    ),
    'Pending': (
        "Hello {studentName},\n\n"
        "Your complaint ({ticketId}) for Machine {machineId} is pending further investigation.\n\n"
        "We may need additional details. Please reply to this message if you can provide more information.\n\n"
        + _CLOSING
    ),
    'Resolved': (
        "Hello {studentName},\n\n"
        "Great news! Machine {machineId} has been repaired and is now operational.\n\n"
        "Your complaint ({ticketId}) has been marked as RESOLVED.\n\n"
        "{statusSpecificMessage}\n\n"
        "Please try using the machine again. If the issue persists, simply reply to this WhatsApp message and we will reopen your complaint immediately.\n\n"
        + _CLOSING
    ),
    'Refunded': (
        "Hello {studentName},\n\n"
        "Your refund request for Machine {machineId} (complaint {ticketId}) has been approved.\n\n"
        "{statusSpecificMessage}\n\n"
        "If you have any further concerns, simply reply to this WhatsApp conversation.\n\n"
        + _CLOSING
    ),
}

# ── Product Issue ────────────────────────────────────────────────────────────
_PRODUCT_ISSUE = {
    'Submitted': (
        "Hello {studentName},\n\n"
        "Your complaint ({ticketId}) regarding a product issue at Machine {machineId} has been received.\n\n"
        "Issue: {complaintDescription}\n\n"
        "We will review the product and machine configuration and update you shortly.\n\n"
        + _CLOSING
    ),
    'In Review': (
        "Hello {studentName},\n\n"
        "We are reviewing the product issue you reported ({ticketId}) for Machine {machineId}.\n\n"
        "Issue: {complaintDescription}\n\n"
        "Our team is investigating the stock and dispensing mechanism. We will update you soon.\n\n"
        + _CLOSING
    ),
    'Pending': (
        "Hello {studentName},\n\n"
        "Your product complaint ({ticketId}) for Machine {machineId} is pending review.\n\n"
        "We may need more details — please reply to this message with any additional information.\n\n"
        + _CLOSING
    ),
    'Resolved': (
        "Hello {studentName},\n\n"
        "Your product complaint ({ticketId}) for Machine {machineId} has been RESOLVED.\n\n"
        "{statusSpecificMessage}\n\n"
        "The product and machine have been inspected. If you experience the same issue again, reply to this message and we will address it immediately.\n\n"
        + _CLOSING
    ),
    'Refunded': (
        "Hello {studentName},\n\n"
        "Your refund for the product issue (complaint {ticketId}) has been approved.\n\n"
        "{statusSpecificMessage}\n\n"
        "If you have any further concerns, simply reply to this WhatsApp conversation.\n\n"
        + _CLOSING
    ),
}

# ── Payment Issue ────────────────────────────────────────────────────────────
_PAYMENT_ISSUE = {
    'Submitted': (
        "Hello {studentName},\n\n"
        "Your payment complaint ({ticketId}) for Machine {machineId} has been received.\n\n"
        "Issue: {complaintDescription}\n\n"
        "We will review your transaction and process your refund if eligible. Updates will be sent here.\n\n"
        + _CLOSING
    ),
    'In Review': (
        "Hello {studentName},\n\n"
        "We are reviewing your payment complaint ({ticketId}) for Machine {machineId}.\n\n"
        "Issue: {complaintDescription}\n\n"
        "Our team is verifying the transaction records. We will update you within 24 hours.\n\n"
        + _CLOSING
    ),
    'Pending': (
        "Hello {studentName},\n\n"
        "Your payment complaint ({ticketId}) is pending additional verification.\n\n"
        "Please share your transaction reference number or screenshot by replying to this message to help us process your refund faster.\n\n"
        + _CLOSING
    ),
    'Resolved': (
        "Hello {studentName},\n\n"
        "Your payment complaint ({ticketId}) for Machine {machineId} has been RESOLVED.\n\n"
        "{statusSpecificMessage}\n\n"
        "If you have not received your refund or have further payment concerns, reply to this message immediately.\n\n"
        + _CLOSING
    ),
    'Refunded': (
        "Hello {studentName},\n\n"
        "Your payment refund for complaint ({ticketId}) has been processed successfully.\n\n"
        "{statusSpecificMessage}\n\n"
        "The amount has been credited. If you do not see the credit, please reply to this message.\n\n"
        + _CLOSING
    ),
}

# ── Refund Issue ─────────────────────────────────────────────────────────────
_REFUND_ISSUE = {
    'Submitted': (
        "Hello {studentName},\n\n"
        "Your refund complaint ({ticketId}) for Machine {machineId} has been received.\n\n"
        "Issue: {complaintDescription}\n\n"
        "Our team will review the refund eligibility and process it accordingly.\n\n"
        + _CLOSING
    ),
    'In Review': (
        "Hello {studentName},\n\n"
        "We are reviewing your refund request ({ticketId}) for Machine {machineId}.\n\n"
        "Our accounts team is processing your case. We will update you shortly.\n\n"
        + _CLOSING
    ),
    'Pending': (
        "Hello {studentName},\n\n"
        "Your refund request ({ticketId}) is pending additional information.\n\n"
        "Please reply to this message with your student ID or transaction reference to help us expedite the process.\n\n"
        + _CLOSING
    ),
    'Resolved': (
        "Hello {studentName},\n\n"
        "Your refund complaint ({ticketId}) for Machine {machineId} has been RESOLVED.\n\n"
        "{statusSpecificMessage}\n\n"
        "If you have not received the refund amount, please reply to this message.\n\n"
        + _CLOSING
    ),
    'Refunded': (
        "Hello {studentName},\n\n"
        "Your refund for complaint ({ticketId}) has been successfully processed.\n\n"
        "{statusSpecificMessage}\n\n"
        "Thank you for your patience. If you have further concerns, reply to this message.\n\n"
        + _CLOSING
    ),
}

# ── Suggestion / Feedback ────────────────────────────────────────────────────
_SUGGESTION = {
    'Submitted': (
        "Hello {studentName},\n\n"
        "Thank you for your suggestion! (Reference: {ticketId})\n\n"
        "Your feedback: {complaintDescription}\n\n"
        "We value your input and will review it with our team.\n\n"
        + _CLOSING
    ),
    'In Review': (
        "Hello {studentName},\n\n"
        "Your suggestion ({ticketId}) is currently being reviewed by our team.\n\n"
        "Your feedback: {complaintDescription}\n\n"
        "We appreciate you taking the time to share this with us.\n\n"
        + _CLOSING
    ),
    'Pending': (
        "Hello {studentName},\n\n"
        "Your suggestion ({ticketId}) is pending further review.\n\n"
        "We will notify you once a decision has been made.\n\n"
        + _CLOSING
    ),
    'Approved': (
        "Hello {studentName},\n\n"
        "Great news! Your suggestion ({ticketId}) has been APPROVED by our team.\n\n"
        "Your feedback: {complaintDescription}\n\n"
        "We will work on implementing your idea. Thank you for helping us improve VendBees!\n\n"
        + _CLOSING
    ),
    'Resolved': (
        "Hello {studentName},\n\n"
        "Your suggestion ({ticketId}) has been marked as resolved.\n\n"
        "Thank you for your valuable feedback. It helps us improve the VendBees experience.\n\n"
        + _CLOSING
    ),
    'Refunded': (
        "Hello {studentName},\n\n"
        "Your feedback reference ({ticketId}) has been updated.\n\n"
        "Thank you for engaging with VendBees Support.\n\n"
        + _CLOSING
    ),
}

# ── General / Default ────────────────────────────────────────────────────────
_GENERAL = {
    'Submitted': (
        "Hello {studentName},\n\n"
        "Your complaint ({ticketId}) for Machine {machineId} has been submitted successfully.\n\n"
        "Issue: {complaintDescription}\n\n"
        "We will review it shortly and keep you updated here.\n\n"
        + _CLOSING
    ),
    'In Review': (
        "Hello {studentName},\n\n"
        "Your complaint ({ticketId}) for Machine {machineId} is now IN REVIEW.\n\n"
        "Issue: {complaintDescription}\n\n"
        "Our support team is actively working on resolving the issue. We will notify you of any updates.\n\n"
        + _CLOSING
    ),
    'Pending': (
        "Hello {studentName},\n\n"
        "Your complaint ({ticketId}) for Machine {machineId} is pending additional information.\n\n"
        "Please reply to this message if you have further details to share.\n\n"
        + _CLOSING
    ),
    'Resolved': (
        "Hello {studentName},\n\n"
        "Your complaint ({ticketId}) for Machine {machineId} has been marked as RESOLVED.\n\n"
        "{statusSpecificMessage}\n\n"
        "If the issue persists, simply reply to this WhatsApp message and we will reopen your complaint immediately.\n\n"
        + _CLOSING
    ),
    'Refunded': (
        "Hello {studentName},\n\n"
        "Your refund for complaint ({ticketId}) has been processed successfully.\n\n"
        "{statusSpecificMessage}\n\n"
        "If you have any further concerns, simply reply to this WhatsApp conversation.\n\n"
        + _CLOSING
    ),
}

# Master lookup: issue_type_lower → template_dict
_ISSUE_TEMPLATES = {
    'machine down':   _MACHINE_DOWN,
    'product issue':  _PRODUCT_ISSUE,
    'payment issue':  _PAYMENT_ISSUE,
    'refund issue':   _REFUND_ISSUE,
    'suggestion':     _SUGGESTION,
    'feedback':       _SUGGESTION,
    'general':        _GENERAL,
    'general complaint': _GENERAL,
}


class NotificationBuilder:
    """
    Service class responsible for compiling, templating, and generating
    formatted WhatsApp messages based on a Complaint Object.

    Selects message template using (issue_type, status) matrix so every
    issue type receives a unique, context-aware notification.
    """

    @staticmethod
    def build_notification(complaint_data, status=None, custom_ai_message=None):
        """
        Builds and returns a formatted WhatsApp message from a complaint dict.

        :param complaint_data: dict containing ticket/complaint information
        :param status: optional status to override the one in complaint_data
        :param custom_ai_message: optional pre-formatted string (e.g. from an AI model)
        :return: str containing the formatted message, or None if no template found
        """
        # If an AI-generated summary is provided, return it directly
        if custom_ai_message:
            return custom_ai_message.strip()

        if not complaint_data:
            return "Notification update: Your complaint status has been updated. - VendBees Support"

        current_status = status or complaint_data.get('status', 'Submitted')

        # ── Extract complaint variables ──────────────────────────────────
        student_name = (
            complaint_data.get('fullName') or
            complaint_data.get('studentName') or
            complaint_data.get('student', {}).get('name') or
            'Student'
        )

        ticket_id = (
            complaint_data.get('ticket_id') or   # display ID preferred (VB-TICK-xxx)
            complaint_data.get('ticketId') or
            complaint_data.get('ticket_id') or
            'N/A'
        )

        machine_id = (
            complaint_data.get('machineId') or
            complaint_data.get('machine_id') or
            complaint_data.get('machine_name') or
            'Unknown Machine'
        )

        issue_type = (
            complaint_data.get('issueType') or
            complaint_data.get('issue_type') or
            'General'
        )

        complaint_description = (
            complaint_data.get('complaintText') or
            complaint_data.get('issue_detail') or
            complaint_data.get('description') or
            complaint_data.get('complaintDescription') or
            complaint_data.get('message') or
            'No description provided.'
        )

        # ── Build status-specific dynamic text ──────────────────────────
        status_specific_message = ''
        if current_status == 'Resolved':
            resolution = (
                complaint_data.get('resolution') or
                complaint_data.get('resolutionText') or
                'Our support team has completed the investigation and resolved the issue.'
            )
            status_specific_message = resolution

        elif current_status == 'Refunded':
            refund_amount = (
                complaint_data.get('refundAmount') or
                complaint_data.get('amount') or
                complaint_data.get('refund_amount')
            )
            if refund_amount:
                status_specific_message = f'Your refund of ₹{refund_amount} has been processed successfully.'
            else:
                status_specific_message = 'Your refund has been processed successfully.'

        # ── Select template by (issue_type, status) ─────────────────────
        issue_key = issue_type.strip().lower()
        template_dict = _ISSUE_TEMPLATES.get(issue_key, _GENERAL)
        template = template_dict.get(current_status)

        # Fallback: try General templates if issue-specific one is missing
        if not template:
            template = _GENERAL.get(current_status)

        # Last resort: universal fallback
        if not template:
            template = (
                "Hello {studentName},\n\n"
                "Your complaint ({ticketId}) has been updated to {status}.\n\n"
                "We will notify you of further updates.\n\n"
                + _CLOSING
            )

        # ── Format and return ────────────────────────────────────────────
        try:
            return template.format(
                studentName=student_name,
                ticketId=ticket_id,
                machineId=machine_id,
                complaintDescription=complaint_description,
                status=current_status,
                statusSpecificMessage=status_specific_message,
            )
        except Exception:
            # Emergency fallback
            return (
                f"Hello {student_name},\n\n"
                f"Your complaint ({ticket_id}) status is now {current_status}.\n\n"
                f"Thank you,\nVendBees Support"
            )
