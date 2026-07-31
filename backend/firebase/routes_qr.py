from flask import Blueprint, request, jsonify, send_file
from dataconnect_db import execute_graphql
import logging
import uuid
import json
import sys
import traceback
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
mutation CreateQrCodeHistory($qrId: UUID!, $batchDateKey: String!, $machineIds: [String!]!, $qrData: String!, $notes: String, $createdAt: Timestamp!, $updatedAt: Timestamp!) {
  qrCodeHistory_insert(data: {
    qrId: $qrId,
    batchDateKey: $batchDateKey,
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
query GetQrCodeHistory {
  qrCodeHistories(orderBy: [{createdAt: DESC}]) {
    qrId
    batchDateKey
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
    # Manual QR generation has been disabled — QR codes are generated automatically during batch creation
    return jsonify({'error': 'Manual QR generation disabled. QR codes are auto-generated during batch creation.'}), 405

    # manual generation disabled; nothing further to do

@qr_bp.route('/api/qr/history', methods=['GET'])
def get_qr_history():
    """
    Get QR code generation history for a user.
    Query params: userId
    """
    try:
        user_id = request.args.get('userId')

        result = execute_graphql(GET_QR_HISTORY_QUERY, {})

        if 'errors' in result:
            logger.error(f"Failed to get QR history: {result['errors']}")
            return jsonify({'error': 'Failed to retrieve QR history', 'details': result['errors']}), 500

        history = result.get('qrCodeHistories', [])


        return jsonify({
            'success': True,
            'history': history
        }), 200

    except Exception as e:
        logger.error(f"Error retrieving QR history: {str(e)}", exc_info=True)
        return jsonify({'error': str(e)}), 500


@qr_bp.route('/api/qr/generate-from-batch', methods=['POST'])
def generate_qr_from_batch():
  """
  Generate QR history record from an existing batch number.
  Request JSON: { "batch": 1, "userId": "user_id" }
  """
  try:
    data = request.json or {}
    batch = data.get('batch')
    user_id = None

    if not batch:
      return jsonify({'error': 'batch is required'}), 400

    # Query stockCoverAssignments for machine IDs in this batch
    get_machines_query = """
    query GetMachinesForBatch($batch: Int!) {
      stockCoverAssignments(where: {batch: {eq: $batch}}) {
        machineId
      }
    }
    """

    print(f"[DEBUG] generate_qr_from_batch received data: {data}", file=sys.stderr, flush=True)
    machines_result = execute_graphql(get_machines_query, {'batch': int(batch)})
    print(f"[DEBUG] machines_result: {machines_result}", file=sys.stderr, flush=True)
    if 'errors' in machines_result:
      logger.error(f"Failed to query machines for batch {batch}: {machines_result['errors']}")
      return jsonify({'error': 'Failed to query machines for batch', 'details': machines_result['errors']}), 500

    scas = machines_result.get('stockCoverAssignments', [])
    machine_ids = list({ (s.get('machineId') or '').strip() for s in scas if s.get('machineId') })

    if not machine_ids:
      return jsonify({'error': 'No machines found for batch'}), 404

    created_date = datetime.utcnow().date().isoformat()
    qr_id = str(uuid.uuid4())
    qr_data = {
      'qrId': qr_id,
      'batch': batch,
      'createdAt': datetime.utcnow().isoformat() + 'Z',
      'machines': []
    }
    for mid in machine_ids:
      qr_data['machines'].append({
        'machineId': mid,
        'qrUrl': f"https://vendbees.com/machine/{mid}",
        'qrCode': f"BATCH:{batch}|{created_date}|MACHINE:{mid}"
      })

    batch_date_key = f"BATCH:{batch}|DATE:{created_date}"
    result = execute_graphql(CREATE_QR_HISTORY_MUTATION, {
      'qrId': qr_id,
      'batchDateKey': batch_date_key,
      'machineIds': machine_ids,
      'qrData': json.dumps(qr_data),
      'notes': f'Generated from batch {batch}',
      'createdAt': datetime.utcnow().isoformat() + 'Z',
      'updatedAt': datetime.utcnow().isoformat() + 'Z'
    })
    print(f"[DEBUG] CREATE_QR_HISTORY result: {result}", file=sys.stderr, flush=True)

    if 'errors' in result:
      logger.error(f"Failed to create QR history from batch {batch}: {result['errors']}")
      return jsonify({'error': 'Failed to create QR history', 'details': result['errors']}), 500

    return jsonify({'success': True, 'qrId': qr_id, 'machineIds': machine_ids}), 200

  except Exception as e:
    tb = traceback.format_exc()
    logger.error(f"Error in generate_qr_from_batch: {str(e)}\n{tb}")
    return jsonify({'error': str(e), 'traceback': tb}), 500

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