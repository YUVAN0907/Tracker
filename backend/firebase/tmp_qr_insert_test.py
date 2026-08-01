from dataconnect_db import execute_graphql
import uuid

mutation = '''
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
'''
payload = {
    'qrId': str(uuid.uuid4()),
    'batchDateKey': 'BATCH:9998|DATE:2026-07-31',
    'machineIds': ['X'],
    'qrData': '{}',
    'notes': 'dup',
    'createdAt': '2026-07-31T00:00:00Z',
    'updatedAt': '2026-07-31T00:00:00Z'
}
print(execute_graphql(mutation, payload))
