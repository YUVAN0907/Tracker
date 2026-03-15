from dataconnect_db import execute_graphql

try:
    res = execute_graphql('mutation { product_update(id: "DUMMY", data: {}) }')
    print("update query with id:", res)
except Exception as e:
    print("ERR1", e)

