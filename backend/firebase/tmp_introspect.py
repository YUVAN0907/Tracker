import json
from dataconnect_db import execute_graphql

query = '''query IntrospectWarehouse {
  __type(name: "Warehouse") {
    name
    fields {
      name
      type {
        kind
        name
        ofType {
          kind
          name
          ofType {
            kind
            name
          }
        }
      }
    }
  }
  __type(name: "Warehouse_KeyOutput") {
    name
    fields {
      name
      type {
        kind
        name
        ofType {
          kind
          name
          ofType {
            kind
            name
          }
        }
      }
    }
  }
}
'''

res = execute_graphql(query, {})
print(json.dumps(res, indent=2))
