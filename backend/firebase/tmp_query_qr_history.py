import json
from dataconnect_db import execute_graphql

queries = [
    ('All QR histories', '''
query {
  qrCodeHistories(limit: 50, orderBy: [{createdAt: DESC}]) {
    qrId
    userId
    machineIds
    qrData
    notes
    createdAt
    updatedAt
  }
}
'''),
    ('default_user histories', '''
query GetDefaultUserHistories {
  qrCodeHistories(where: {userId: {eq: "default_user"}}, orderBy: [{createdAt: DESC}]) {
    qrId
    userId
    machineIds
    qrData
    notes
    createdAt
    updatedAt
  }
}
''')
]

for title, query in queries:
    print('===', title, '===')
    try:
        result = execute_graphql(query)
        print(json.dumps(result, indent=2)[:5000])
    except Exception as e:
        print('ERROR', e)
    print()