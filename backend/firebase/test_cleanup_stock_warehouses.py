import argparse
from dataconnect_db import execute_graphql

GET_ALL_STOCK_DATA = """
query GetAllStockData {
  batchAssignments(limit: 10000) {
    batch
  }
  stockCoverAssignments(limit: 10000) {
    id
    batch
  }
  stockCoverProductAssignments(limit: 10000) {
    id
    stockCoverAssignmentId
  }
  warehouseStocks(limit: 10000) {
    stockId
  }
}
"""

DELETE_STOCK_COVER_PRODUCT_ASSIGNMENT_MUTATION = """
mutation DeleteStockCoverProductAssignment($id: UUID!) {
  stockCoverProductAssignment_delete(key: { id: $id })
}
"""

DELETE_STOCK_COVER_ASSIGNMENT_MUTATION = """
mutation DeleteStockCoverAssignment($id: UUID!) {
  stockCoverAssignment_delete(key: { id: $id })
}
"""

DELETE_BATCH_ASSIGNMENT_MUTATION = """
mutation DeleteBatchAssignment($batch: Int!) {
  batchAssignment_delete(key: { batch: $batch })
}
"""

DELETE_WAREHOUSE_STOCK_MUTATION = """
mutation DeleteWarehouseStock($stockId: UUID!) {
  warehouseStock_delete(key: { stockId: $stockId })
}
"""


def fetch_stock_data():
    result = execute_graphql(GET_ALL_STOCK_DATA)
    return {
        "batch_assignments": result.get("batchAssignments", []),
        "stock_cover_assignments": result.get("stockCoverAssignments", []),
        "stock_cover_product_assignments": result.get("stockCoverProductAssignments", []),
        "warehouse_stocks": result.get("warehouseStocks", []),
    }


def cleanup_stock_tables(confirm: bool = False):
    data = fetch_stock_data()
    batch_assignments = data.get("batch_assignments", [])
    stock_cover_assignments = data.get("stock_cover_assignments", [])
    stock_cover_product_assignments = data.get("stock_cover_product_assignments", [])
    warehouse_stocks = data.get("warehouse_stocks", [])

    print("Found:")
    print(f"  - Batch assignments: {len(batch_assignments)}")
    print(f"  - Stock cover assignments: {len(stock_cover_assignments)}")
    print(f"  - Stock cover product assignments: {len(stock_cover_product_assignments)}")
    print(f"  - Warehouse stocks: {len(warehouse_stocks)}")

    if not confirm:
        print("Dry run only. Re-run with --confirm to actually delete these records.")
        return

    deleted_product_assignments = 0
    for assignment in stock_cover_product_assignments:
        assignment_id = assignment.get("id")
        if assignment_id:
            execute_graphql(DELETE_STOCK_COVER_PRODUCT_ASSIGNMENT_MUTATION, {"id": assignment_id})
            deleted_product_assignments += 1

    deleted_cover_assignments = 0
    for assignment in stock_cover_assignments:
        assignment_id = assignment.get("id")
        if assignment_id:
            execute_graphql(DELETE_STOCK_COVER_ASSIGNMENT_MUTATION, {"id": assignment_id})
            deleted_cover_assignments += 1

    deleted_batches = 0
    for batch_assignment in batch_assignments:
        batch = batch_assignment.get("batch")
        if batch is not None:
            execute_graphql(DELETE_BATCH_ASSIGNMENT_MUTATION, {"batch": batch})
            deleted_batches += 1

    deleted_stocks = 0
    for stock in warehouse_stocks:
        stock_id = stock.get("stockId")
        if stock_id:
            execute_graphql(DELETE_WAREHOUSE_STOCK_MUTATION, {"stockId": stock_id})
            deleted_stocks += 1

    print("Deletion complete:")
    print(f"  - Deleted stock cover product assignments: {deleted_product_assignments}")
    print(f"  - Deleted stock cover assignments: {deleted_cover_assignments}")
    print(f"  - Deleted batch assignments: {deleted_batches}")
    print(f"  - Deleted warehouse stocks: {deleted_stocks}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Delete stock-related Data Connect records from the target tables")
    parser.add_argument(
        "--confirm",
        action="store_true",
        help="Actually delete the records instead of showing a dry run",
    )
    args = parser.parse_args()
    cleanup_stock_tables(confirm=args.confirm)
