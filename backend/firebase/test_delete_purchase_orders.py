import argparse
from dataconnect_db import execute_graphql

GET_ALL_PURCHASE_ORDER_DATA = """
query GetAllPurchaseOrderData {
  purchaseOrderHeaders(limit: 10000) {
    poId
  }
  purchaseOrderLines(limit: 10000) {
    lineId
    poId
  }
  vendorPurchaseOrders(limit: 10000) {
    purchaseOrderId
    poId
  }
  vendorPurchaseItems(limit: 10000) {
    itemId
    purchaseOrderId
  }
}
"""

DELETE_VENDOR_PURCHASE_ITEM_MUTATION = """
mutation DeleteVendorPurchaseItem($itemId: UUID!) {
  vendorPurchaseItem_delete(key: { itemId: $itemId })
}
"""

DELETE_VENDOR_PURCHASE_ORDER_MUTATION = """
mutation DeleteVendorPurchaseOrder($purchaseOrderId: UUID!) {
  vendorPurchaseOrder_delete(key: { purchaseOrderId: $purchaseOrderId })
}
"""

DELETE_PURCHASE_ORDER_LINE_MUTATION = """
mutation DeletePurchaseOrderLine($lineId: String!) {
  purchaseOrderLine_delete(key: { lineId: $lineId })
}
"""

DELETE_PURCHASE_ORDER_HEADER_MUTATION = """
mutation DeletePurchaseOrderHeader($poId: String!) {
  purchaseOrderHeader_delete(key: { poId: $poId })
}
"""


def fetch_purchase_order_data():
    result = execute_graphql(GET_ALL_PURCHASE_ORDER_DATA)
    return {
        "purchase_order_headers": result.get("purchaseOrderHeaders", []),
        "purchase_order_lines": result.get("purchaseOrderLines", []),
        "vendor_purchase_orders": result.get("vendorPurchaseOrders", []),
        "vendor_purchase_items": result.get("vendorPurchaseItems", []),
    }


def delete_purchase_orders(confirm: bool = False):
    data = fetch_purchase_order_data()

    vendor_purchase_items = data.get("vendor_purchase_items", [])
    vendor_purchase_orders = data.get("vendor_purchase_orders", [])
    purchase_order_lines = data.get("purchase_order_lines", [])
    purchase_order_headers = data.get("purchase_order_headers", [])

    print("Found:")
    print(f"  - Vendor purchase items: {len(vendor_purchase_items)}")
    print(f"  - Vendor purchase orders: {len(vendor_purchase_orders)}")
    print(f"  - Purchase order lines: {len(purchase_order_lines)}")
    print(f"  - Purchase order headers: {len(purchase_order_headers)}")

    if not confirm:
        print("Dry run only. Re-run with --confirm to actually delete these records.")
        return

    deleted_items = 0
    for item in vendor_purchase_items:
        item_id = item.get("itemId")
        if item_id:
            execute_graphql(DELETE_VENDOR_PURCHASE_ITEM_MUTATION, {"itemId": item_id})
            deleted_items += 1

    deleted_orders = 0
    for order in vendor_purchase_orders:
        purchase_order_id = order.get("purchaseOrderId")
        if purchase_order_id:
            execute_graphql(DELETE_VENDOR_PURCHASE_ORDER_MUTATION, {"purchaseOrderId": purchase_order_id})
            deleted_orders += 1

    deleted_lines = 0
    for line in purchase_order_lines:
        line_id = line.get("lineId")
        if line_id:
            execute_graphql(DELETE_PURCHASE_ORDER_LINE_MUTATION, {"lineId": line_id})
            deleted_lines += 1

    deleted_headers = 0
    for header in purchase_order_headers:
        po_id = header.get("poId")
        if po_id:
            execute_graphql(DELETE_PURCHASE_ORDER_HEADER_MUTATION, {"poId": po_id})
            deleted_headers += 1

    print("Deletion complete:")
    print(f"  - Deleted vendor purchase items: {deleted_items}")
    print(f"  - Deleted vendor purchase orders: {deleted_orders}")
    print(f"  - Deleted purchase order lines: {deleted_lines}")
    print(f"  - Deleted purchase order headers: {deleted_headers}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Delete purchase order records from Data Connect tables")
    parser.add_argument(
        "--confirm",
        action="store_true",
        help="Actually delete the records instead of showing a dry run",
    )
    args = parser.parse_args()
    delete_purchase_orders(confirm=args.confirm)
