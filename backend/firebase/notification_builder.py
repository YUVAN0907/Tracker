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
}

# ── Product Issue ────────────────────────────────────────────────────────────
_PRODUCT_ISSUE = {
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
        "The product and the machine have been inspected. If you experience the same issue again, reply to this message and we will address it immediately.\n\n"
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
    'Refunded': (
        "Hello {studentName},\n\n"
        "Your payment refund for complaint ({ticketId}) has been processed successfully.\n\n"
        "{statusSpecificMessage}\n\n"
        "The amount has been credited. If you do not see the credit, please reply to this message.\n\n"
        + _CLOSING
    ),
}

# Master lookup: issue_type_lower → template_dict
_ISSUE_TEMPLATES = {
    # Machine Down variations
    'machine down':         _MACHINE_DOWN,
    'machine issue':        _MACHINE_DOWN,
    'vending machine down': _MACHINE_DOWN,
    'machine not working':  _MACHINE_DOWN,
    # Product Issue variations
    'product issue':        _PRODUCT_ISSUE,
    'product':              _PRODUCT_ISSUE,
    'item not dispensed':   _PRODUCT_ISSUE,
    'wrong product':        _PRODUCT_ISSUE,
    # Payment Issue variations
    'payment issue':        _PAYMENT_ISSUE,
    'payment':              _PAYMENT_ISSUE,
    'transaction issue':    _PAYMENT_ISSUE,
    'money deducted':       _PAYMENT_ISSUE,
}


class NotificationBuilder:
    """
    Service class responsible for compiling, templating, and generating
    formatted WhatsApp messages based on a Complaint Object.
    """

    @staticmethod
    def _extract_variables(complaint_data, status=None):
        current_status = status or complaint_data.get('status', 'In Review')

        student_name = (
            complaint_data.get('fullName') or
            complaint_data.get('studentName') or
            complaint_data.get('student', {}).get('name') or
            'Student'
        )

        ticket_id = (
            complaint_data.get('ticket_id') or   # display ID preferred (VB-TICK-xxx)
            complaint_data.get('ticketId') or
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

        # Normalize status for payment issues: 'Resolved' -> 'Refunded'
        issue_key = issue_type.strip().lower()
        is_payment = ('payment' in issue_key or 'transaction' in issue_key or 'money' in issue_key)
        if is_payment and current_status == 'Resolved':
            current_status = 'Refunded'

        complaint_description = (
            complaint_data.get('complaintText') or
            complaint_data.get('issue_detail') or
            complaint_data.get('description') or
            complaint_data.get('complaintDescription') or
            complaint_data.get('message') or
            'No description provided.'
        )

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

        return {
            'student_name': student_name,
            'ticket_id': ticket_id,
            'machine_id': machine_id,
            'issue_type': issue_type,
            'complaint_description': complaint_description,
            'current_status': current_status,
            'status_specific_message': status_specific_message,
        }

    @staticmethod
    def build_notification(complaint_data, status=None, custom_ai_message=None):
        if custom_ai_message:
            return custom_ai_message.strip()

        if not complaint_data:
            return "Notification update: Your complaint status has been updated. - VendBees Support"

        vars = NotificationBuilder._extract_variables(complaint_data, status)
        current_status = vars['current_status']
        issue_type = vars['issue_type']

        # ── Select template by (issue_type, status) ─────────────────────
        issue_key = issue_type.strip().lower()
        template_dict = _ISSUE_TEMPLATES.get(issue_key, _MACHINE_DOWN)
        template = template_dict.get(current_status)

        if not template:
            template = _MACHINE_DOWN.get(current_status)

        if not template:
            template = (
                "Hello {studentName},\n\n"
                "Your complaint ({ticketId}) has been updated to {status}.\n\n"
                "We will notify you of further updates.\n\n"
                + _CLOSING
            )

        try:
            return template.format(
                studentName=vars['student_name'],
                ticketId=vars['ticket_id'],
                machineId=vars['machine_id'],
                complaintDescription=vars['complaint_description'],
                status=current_status,
                statusSpecificMessage=vars['status_specific_message'],
            )
        except Exception:
            return (
                f"Hello {vars['student_name']},\n\n"
                f"Your complaint ({vars['ticket_id']}) status is now {current_status}.\n\n"
                f"Thank you,\nVendBees Support"
            )

    @staticmethod
    def build_meta_template_payload(complaint_data, status=None):
        """
        Generates Meta WhatsApp Business Cloud API category-specific template name and components list
        for button-driven notifications.

        Returns dict:
            {
                'template_name': str (e.g. 'vb_machinedown_inreview'),
                'components': list of dicts,
                'full_text': str
            }
        """
        vars = NotificationBuilder._extract_variables(complaint_data, status)
        curr_status = vars['current_status']
        full_text = NotificationBuilder.build_notification(complaint_data, status=curr_status)

        # Normalize issue category
        issue_key = vars['issue_type'].strip().lower()
        if 'product' in issue_key or 'item' in issue_key:
            cat_slug = 'productissue'
        elif 'payment' in issue_key or 'transaction' in issue_key or 'money' in issue_key:
            cat_slug = 'paymentissue'
        else:
            cat_slug = 'machinedown'

        status_slug = curr_status.lower().replace(' ', '')
        template_name = f"vb_{cat_slug}_{status_slug}"

        student_name = str(vars['student_name'])
        ticket_id = str(vars['ticket_id'])
        machine_id = str(vars['machine_id'])
        complaint_desc = str(vars['complaint_description'])
        status_msg = str(vars['status_specific_message'] or 'Thank you for contacting VendBees Support.')

        # Positional parameters matching each specific Meta Template body
        params = []
        if cat_slug == 'machinedown':
            if curr_status == 'In Review':
                # Hello {{1}}, We are currently inspecting Machine {{2}} for your reported issue ({{3}}). Issue: {{4}}
                params = [student_name, machine_id, ticket_id, complaint_desc]
            elif curr_status == 'Pending':
                # Hello {{1}}, Your complaint ({{2}}) for Machine {{3}} is pending further investigation.
                params = [student_name, ticket_id, machine_id]
            elif curr_status == 'Resolved':
                # Hello {{1}}, Great news! Machine {{2}} has been repaired... complaint ({{3}})... {{4}}
                params = [student_name, machine_id, ticket_id, status_msg]

        elif cat_slug == 'productissue':
            if curr_status == 'In Review':
                # Hello {{1}}, We are reviewing the product issue you reported ({{2}}) for Machine {{3}}. Issue: {{4}}
                params = [student_name, ticket_id, machine_id, complaint_desc]
            elif curr_status == 'Pending':
                # Hello {{1}}, Your product complaint ({{2}}) for Machine {{3}} is pending review.
                params = [student_name, ticket_id, machine_id]
            elif curr_status == 'Resolved':
                # Hello {{1}}, Your product complaint ({{2}}) for Machine {{3}} has been RESOLVED. {{4}}
                params = [student_name, ticket_id, machine_id, status_msg]
            elif curr_status == 'Refunded':
                # Hello {{1}}, Your refund for the product issue (complaint {{2}}) has been approved. {{3}}
                params = [student_name, ticket_id, status_msg]

        elif cat_slug == 'paymentissue':
            if curr_status == 'In Review':
                # Hello {{1}}, We are reviewing your payment complaint ({{2}}) for Machine {{3}}. Issue: {{4}}
                params = [student_name, ticket_id, machine_id, complaint_desc]
            elif curr_status == 'Pending':
                # Hello {{1}}, Your payment complaint ({{2}}) is pending additional verification.
                params = [student_name, ticket_id]
            elif curr_status == 'Refunded':
                # Hello {{1}}, Your payment refund for complaint ({{2}}) has been processed successfully. {{3}}
                params = [student_name, ticket_id, status_msg]

        # General fallback if parameters empty
        if not params:
            params = [student_name, ticket_id, machine_id]

        components = [{
            "type": "body",
            "parameters": [{"type": "text", "text": val} for val in params]
        }]

        return {
            'template_name': template_name,
            'components': components,
            'full_text': full_text
        }
