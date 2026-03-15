from dataconnect_db import execute_graphql

try:
    res = execute_graphql('mutation { product_delete(id: "DUMMY") }')
    print("delete query:", res)
except Exception as e:
    print("ERR1", e)

try:
    res = execute_graphql('mutation { product_delete(productId: "DUMMY") }')
    print("delete query 2:", res)
except Exception as e:
    print("ERR2", e)

try:
    res = execute_graphql('mutation { product_update(id: "DUMMY", data: {}) { productId } }')
    print("update query:", res)
except Exception as e:
    print("ERR3", e)

try:
    res = execute_graphql('mutation { product_update(productId: "DUMMY", data: {}) { productId } }')
    print("update query 2:", res)
except Exception as e:
    print("ERR4", e)
