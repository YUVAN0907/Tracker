from datetime import datetime, timezone

from dataconnect_db import execute_graphql, format_timestamp

GET_WAREHOUSES_QUERY = """
query GetWarehouses {
  warehouses(limit: 1000) {
    warehouseId
    name
    address
  }
}
"""

INSERT_WAREHOUSE_MUTATION = """
mutation InsertWarehouse(
  $warehouseId: String!,
  $name: String!,
  $location: String,
  $address: String,
  $notes: String,
  $createdAt: Timestamp,
  $updatedAt: Timestamp
) {
  warehouse_insert(data: {
    warehouseId: $warehouseId,
    name: $name,
    location: $location,
    address: $address,
    notes: $notes,
    createdAt: $createdAt,
    updatedAt: $updatedAt
  })
}
"""

WAREHOUSES_TO_INSERT = [
    {
        "warehouseId": "FADAROS01",
        "name": "Anna nagar Fadaros warehouse 01",
        "location": "Anna nagar west, Chennai",
        "address": "No:1371, 28th, Kambar colony, I Block, Anna nagar west, Chennai-600040",
        "notes": "FADAROS warehouse 01"
    },
    {
        "warehouseId": "FADAROS02",
        "name": "FADAROS warehouse 02",
        "location": "Srm University, srm nagar potheri, Kattankulathur",
        "address": "Srm University, srm nagar potheri, Kattankulathur-603203",
        "notes": "FADAROS warehouse 02"
    }
]


def insert_warehouses():
    existing = execute_graphql(GET_WAREHOUSES_QUERY, {})
    existing_warehouses = {w["warehouseId"] for w in existing.get("warehouses", [])}

    now = format_timestamp(datetime.now(timezone.utc))

    for warehouse in WAREHOUSES_TO_INSERT:
        warehouse_id = warehouse["warehouseId"]
        if warehouse_id in existing_warehouses:
            print(f"Skipping existing warehouse: {warehouse_id} ({warehouse['name']})")
            continue

        variables = {
            "warehouseId": warehouse_id,
            "name": warehouse["name"],
            "location": warehouse.get("location", ""),
            "address": warehouse.get("address", ""),
            "notes": warehouse.get("notes", ""),
            "createdAt": now,
            "updatedAt": now,
        }

        try:
            execute_graphql(INSERT_WAREHOUSE_MUTATION, variables)
            print(f"Inserted warehouse: {warehouse_id} - {warehouse['name']}")
        except Exception as exc:
            print(f"Failed to insert warehouse {warehouse_id}: {exc}")


if __name__ == "__main__":
    insert_warehouses()
