import json
import uuid
from datetime import datetime

from dataconnect_db import execute_graphql

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


def build_qr_history_payload(batch_number, created_date, machine_ids, user_id=None, notes=None):
    """Build the QR history payload for a batch and its machine list."""
    if not machine_ids:
        return None

    unique_machine_ids = [m for m in dict.fromkeys(str(mid).strip() for mid in machine_ids) if m]
    if not unique_machine_ids:
        return None

    created_date_part = created_date.split('T')[0] if isinstance(created_date, str) and 'T' in created_date else created_date
    batch_date_key = f"BATCH:{batch_number}|DATE:{created_date_part}"

    qr_id = str(uuid.uuid4())
    qr_data = {
        'qrId': qr_id,
        'batch': batch_number,
        'createdAt': created_date,
        'machines': []
    }

    for mid in unique_machine_ids:
        qr_data['machines'].append({
            'machineId': mid,
            'qrUrl': f"https://vendbees.com/machine/{mid}",
            'qrCode': f"BATCH:{batch_number}|{created_date_part}|MACHINE:{mid}"
        })

    return {
        'qrId': qr_id,
        'batchDateKey': batch_date_key,
        'machineIds': unique_machine_ids,
        'qrData': json.dumps(qr_data),
        'notes': notes or f'Auto-generated for batch {batch_number}',
        'createdAt': datetime.utcnow().isoformat() + 'Z',
        'updatedAt': datetime.utcnow().isoformat() + 'Z'
    }


def create_batch_qr_history(batch_number, created_date, machine_ids, user_id, notes=None, execute_fn=None):
    """Insert a QR history record for a batch once, using the correct batch metadata."""
    payload = build_qr_history_payload(batch_number, created_date, machine_ids, user_id, notes=notes)
    if not payload:
        print(f"[QR_UTILS] No QR payload created for batch {batch_number}: machine_ids={machine_ids}", flush=True)
        return None

    print(f"[QR_UTILS] Creating QR history payload for batch {batch_number}: {json.dumps(payload, indent=2)}", flush=True)
    gql_executor = execute_fn or execute_graphql
    result = gql_executor(CREATE_QR_HISTORY_MUTATION, payload)
    print(f"[QR_UTILS] QR history insert result for batch {batch_number}: {result}", flush=True)
    return result
