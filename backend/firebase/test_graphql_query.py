from dataconnect_db import execute_graphql

try:
    res = execute_graphql('{ product(key: { productId: "LAYS001" }) { productId } }')
    print("key query:", res)
except Exception as e:
    print("ERR1:", e)

try:
    res = execute_graphql('{ product(productId: "LAYS001") { productId } }')
    print("productId query:", res)
except Exception as e:
    print("ERR2:", e)
