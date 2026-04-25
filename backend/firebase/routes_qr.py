from flask import Blueprint, request, jsonify, send_file
from dataconnect_db import execute_graphql
import logging
import uuid
import json
from datetime import datetime
import qrcode
from fpdf import FPDF
from io import BytesIO

qr_bp = Blueprint('qr', __name__)
logger = logging.getLogger(__name__)

# --- QR PDF Generation Endpoint ---
@qr_bp.route('/api/qr/pdf/<machine_id>', methods=['GET'])
def download_machine_qr_pdf(machine_id):
  """
  Generate a PDF containing a QR code that encodes the given machine ID.
  """
  try:
    import tempfile
    import os
    # 1. Generate QR code image (encoding just the machine ID)
    img = qrcode.make(machine_id)
    with tempfile.NamedTemporaryFile(suffix='.png', delete=False) as tmp_img_file:
      img.save(tmp_img_file, format='PNG')
      tmp_img_path = tmp_img_file.name

    try:
      # 2. Create PDF and embed QR code
      pdf = FPDF()
      pdf.add_page()
      pdf.image(tmp_img_path, x=60, y=40, w=90, h=90)
      pdf.set_font('Arial', 'B', 16)
      pdf.ln(120)
      pdf.cell(0, 10, f'Machine ID: {machine_id}', 0, 1, 'C')
      pdf_bytes = pdf.output(dest='S').encode('latin1')
      pdf_buffer = BytesIO(pdf_bytes)
      pdf_buffer.seek(0)

      # 3. Serve PDF
      return send_file(
        pdf_buffer,
        as_attachment=True,
        download_name=f"machine-qr-code-{machine_id}.pdf",
        mimetype='application/pdf'
      )
    finally:
      if os.path.exists(tmp_img_path):
        os.remove(tmp_img_path)
  except Exception as e:
    logger.error(f"Error generating QR PDF: {str(e)}", exc_info=True)
    return jsonify({'error': str(e)}), 500

# Mutation to create QR code history record
CREATE_QR_HISTORY_MUTATION = """
mutation CreateQrCodeHistory($qrId: UUID!, $userId: String, $machineIds: [String!]!, $qrData: String!, $notes: String, $createdAt: Timestamp!, $updatedAt: Timestamp!) {
  qrCodeHistory_insert(data: {
    qrId: $qrId,
    userId: $userId,
    machineIds: $machineIds,
    qrData: $qrData,
    notes: $notes,
    createdAt: $createdAt,
    updatedAt: $updatedAt
  })
}
"""

# Query to get QR code history
GET_QR_HISTORY_QUERY = """
query GetQrCodeHistory($userId: String) {
  qrCodeHistories(
    where: {userId: {eq: $userId}}
    orderBy: [{createdAt: DESC}]
  ) {
    qrId
    machineIds
    qrData
    pdfGenerated
    pdfDownloadCount
    lastDownloadedAt
    notes
    createdAt
    updatedAt
  }
}
"""

# Query to validate user existence
GET_USER_QUERY = """
query GetUser($userId: String!) {
  user(key: {userId: $userId}) {
    userId
  }
}
"""

# Mutation to update PDF download count
UPDATE_QR_DOWNLOAD_MUTATION = """
mutation UpdateQrDownload($qrId: UUID!, $downloadCount: Int!, $lastDownloadedAt: Timestamp!, $updatedAt: Timestamp!) {
  qrCodeHistory_update(key: {qrId: $qrId}, data: {
    pdfDownloadCount: $downloadCount,
    lastDownloadedAt: $lastDownloadedAt,
    updatedAt: $updatedAt
  })
}
"""

DELETE_QR_HISTORY_MUTATION = """
mutation DeleteQrCodeHistory($qrId: UUID!) {
  qrCodeHistory_delete(key: {qrId: $qrId})
}
"""

@qr_bp.route('/api/qr/generate', methods=['POST'])
def generate_qr_codes():
    """
    Generate QR codes for selected machines and save history.
    Request JSON:
    {
      "userId": "user_id",
      "machineIds": ["machine1", "machine2"],
      "notes": "Optional notes"
    }
    """
    try:
        data = request.json
        user_id = data.get('userId')
        machine_ids = data.get('machineIds', [])
        notes = data.get('notes', '')
        
        if not user_id:
            user_id = "default_user"  # For development
        
        if not machine_ids or len(machine_ids) == 0:
            return jsonify({'error': 'At least one machine ID is required'}), 400
        notes = data.get('notes', '')

        if not user_id:
            return jsonify({'error': 'userId is required'}), 400

        if not machine_ids or len(machine_ids) == 0:
            return jsonify({'error': 'At least one machineId is required'}), 400

        # Validate user exists (optional for now - create if doesn't exist)
        user_result = execute_graphql(GET_USER_QUERY, {'userId': user_id})
        if 'errors' in user_result:
            logger.warning(f"Could not validate user {user_id}: {user_result['errors']}")
            # Continue anyway for development
        elif not user_result.get('user'):
            logger.warning(f"User {user_id} does not exist in database")
            # Continue anyway for development

        # Generate unique QR ID
        qr_id = str(uuid.uuid4())

        # Create QR data (machine details with URLs)
        qr_data = {
            'qrId': qr_id,
            'machines': []
        }

        # Use machineIds as is, assume they are valid
        for machine_id in machine_ids:
            qr_data['machines'].append({
                'machineId': machine_id,
                'location': '',  # Could look up if needed
                'status': '',
                'qrUrl': f"https://vendbees.com/machine/{machine_id}",
                'qrCode': f"MACHINE:{machine_id}"
            })

        # Save to database
        qr_data_json = json.dumps(qr_data)

        result = execute_graphql(CREATE_QR_HISTORY_MUTATION, {
            'qrId': qr_id,
            'userId': user_id,
            'machineIds': machine_ids,
            'qrData': qr_data_json,
            'notes': notes,
            'createdAt': datetime.utcnow().isoformat() + 'Z',
            'updatedAt': datetime.utcnow().isoformat() + 'Z'
        })

        if 'errors' in result:
            logger.error(f"Failed to create QR history: {result['errors']}")
            return jsonify({'error': 'Failed to save QR history', 'details': result['errors']}), 500

        logger.info(f"Generated QR codes for machines: {machine_ids}")

        return jsonify({
            'success': True,
            'qrId': qr_id,
            'qrData': qr_data,
            'message': f'Generated QR codes for {len(machine_ids)} machines'
        }), 200

    except Exception as e:
        logger.error(f"Error generating QR codes: {str(e)}", exc_info=True)
        return jsonify({'error': str(e)}), 500

@qr_bp.route('/api/qr/history', methods=['GET'])
def get_qr_history():
    """
    Get QR code generation history for a user.
    Query params: userId
    """
    try:
        user_id = request.args.get('userId')

        if not user_id:
            return jsonify({'error': 'userId query parameter is required'}), 400

        result = execute_graphql(GET_QR_HISTORY_QUERY, {'userId': user_id})

        if 'errors' in result:
            logger.error(f"Failed to get QR history: {result['errors']}")
            return jsonify({'error': 'Failed to retrieve QR history', 'details': result['errors']}), 500

        history = result.get('qrCodeHistories', [])

        # Parse JSON data for each record
        for record in history:
            try:
                record['qrData'] = json.loads(record['qrData'])
            except:
                record['qrData'] = {}

        return jsonify({
            'success': True,
            'history': history
        }), 200

    except Exception as e:
        logger.error(f"Error retrieving QR history: {str(e)}", exc_info=True)
        return jsonify({'error': str(e)}), 500

@qr_bp.route('/api/qr/download/<qr_id>', methods=['POST'])
def update_qr_download(qr_id):
    """
    Update download count when QR PDF is downloaded.
    """
    try:
        # First get current download count
        get_query = """
        query GetQrDownloadCount($qrId: UUID!) {
          qrCodeHistory(key: {qrId: $qrId}) {
            pdfDownloadCount
          }
        }
        """

        current_result = execute_graphql(get_query, {'qrId': qr_id})

        if 'errors' in current_result:
            logger.error(f"Failed to get current download count: {current_result['errors']}")
            return jsonify({'error': 'Failed to update download count'}), 500

        current_count = current_result.get('qrCodeHistory', {}).get('pdfDownloadCount', 0)
        new_count = current_count + 1

        # Update download count
        result = execute_graphql(UPDATE_QR_DOWNLOAD_MUTATION, {
            'qrId': qr_id,
            'downloadCount': new_count,
            'lastDownloadedAt': datetime.utcnow().isoformat() + 'Z',
            'updatedAt': datetime.utcnow().isoformat() + 'Z'
        })

        if 'errors' in result:
            logger.error(f"Failed to update download count: {result['errors']}")
            return jsonify({'error': 'Failed to update download count', 'details': result['errors']}), 500

        return jsonify({
            'success': True,
            'downloadCount': new_count
        }), 200

    except Exception as e:
        logger.error(f"Error updating QR download count: {str(e)}", exc_info=True)
        return jsonify({'error': str(e)}), 500

@qr_bp.route('/api/qr/delete/<qr_id>', methods=['DELETE'])
def delete_qr_history(qr_id):
    """
    Delete a QR history record.
    """
    try:
        result = execute_graphql(DELETE_QR_HISTORY_MUTATION, {'qrId': qr_id})

        if 'errors' in result:
            logger.error(f"Failed to delete QR history: {result['errors']}")
            return jsonify({'error': 'Failed to delete QR history', 'details': result['errors']}), 500

        return jsonify({
            'success': True,
            'qrId': qr_id
        }), 200
    except Exception as e:
        logger.error(f"Error deleting QR history: {str(e)}", exc_info=True)
        return jsonify({'error': str(e)}), 500