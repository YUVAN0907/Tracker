import json
from dataconnect_config import get_session
session = get_session()
user_id = 'ef3e56a3-519c-473d-bc68-4d294b5ab9b9'
query = '''query ($userId: String!) { users(limit: 1, where: { userId: { eq: $userId } }) { userId email fullName permissions } }'''
resp = session.execute_graphql(query, {'userId': user_id})
print('QUERY RESP:')
print(json.dumps(resp, indent=2))
mutation = '''mutation ($userId: String!, $data: User_Data!) { user_update(key: { userId: $userId }, data: $data) }'''
update_data = {'permissions': json.dumps(['create_po'])}
resp2 = session.execute_graphql(mutation, {'userId': user_id, 'data': update_data})
print('UPDATE RESP:')
print(json.dumps(resp2, indent=2))
resp3 = session.execute_graphql(query, {'userId': user_id})
print('QUERY AFTER UPDATE RESP:')
print(json.dumps(resp3, indent=2))
