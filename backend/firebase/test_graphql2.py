from dataconnect_db import execute_graphql

try:
    res = execute_graphql('mutation { product_delete(productId: "DUMMY") }')
    print("delete query no fields:", res)
except Exception as e:
    print("ERR1", e)

try:
    res = execute_graphql('mutation { product_update(productId: "DUMMY", data: {}) }')
    print("update query no fields:", res)
except Exception as e:
    print("ERR2", e)
