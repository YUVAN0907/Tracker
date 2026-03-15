from dataconnect_db import execute_graphql

res = execute_graphql('{ product(id: "LAYS001") { productId unitCost landedCost eanNo } }')
print(res)
