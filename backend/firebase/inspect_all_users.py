import json
from dataconnect_config import get_session
session = get_session()
query = '''query { users { userId email fullName permissions } }'''
resp = session.execute_graphql(query)
print(json.dumps(resp, indent=2))
