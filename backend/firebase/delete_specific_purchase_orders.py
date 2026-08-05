import argparse
from dataconnect_db import execute_graphql

GET_PO_DATA_QUERY = """
query GetPurchaseOrderData($poId: String!) {
  purchaseOrderHeaders(where: { poId: { eq: $poId } }) {
    poId
  }
  purchaseOrderLines(where: { poId: { eq: $poId } }) {
    lineId
    poId
  }
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

TARGET_PO_IDS = [
    "VP-20260802073109-D05",
    "VP-20260731202116-D05",
    "VP-20260731104812-SVAS16",
    "VP-20260730224514-AA07",
]


def fetch_po_records(po_id):
    result = execute_graphql(GET_PO_DATA_QUERY, {"poId": po_id})
    return {
        "header": result.get("purchaseOrderHeaders", []),
        "lines": result.get("purchaseOrderLines", []),
    }


def delete_purchase_order(po_id, confirm=False):
    data = fetch_po_records(po_id)
    header_records = data.get("header", [])
    line_records = data.get("lines", [])

    print(f"PO ID: {po_id}")
    print(f"  - Purchase order header records found: {len(header_records)}")
    print(f"  - Purchase order line records found: {len(line_records)}")

    if not confirm:
        print("  Dry run only. Use --confirm to delete.")
        return

    deleted_lines = 0
    for line in line_records:
        line_id = line.get("lineId")
        if line_id:
            execute_graphql(DELETE_PURCHASE_ORDER_LINE_MUTATION, {"lineId": line_id})
            deleted_lines += 1

    deleted_headers = 0
    if header_records:
        execute_graphql(DELETE_PURCHASE_ORDER_HEADER_MUTATION, {"poId": po_id})
        deleted_headers = 1

    print(f"  Deleted purchase order lines: {deleted_lines}")
    print(f"  Deleted purchase order headers: {deleted_headers}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(
        description="Delete only the specified purchase orders from PurchaseOrder tables."
    )
    parser.add_argument(
        "--confirm",
        action="store_true",
        help="Actually delete the matching purchase orders instead of doing a dry run.",
    )
    parser.add_argument(
        "--po-ids",
        nargs="*",
        default=TARGET_PO_IDS,
        help="Optional list of PO IDs to delete. Defaults to the four requested PO IDs.",
    )
    args = parser.parse_args()

    po_ids = args.po_ids or TARGET_PO_IDS
    if not po_ids:
        parser.error("At least one --po-ids value must be provided.")

    print("Deleting the following purchase orders from PurchaseOrder tables:")
    for po_id in po_ids:
        delete_purchase_order(po_id, confirm=args.confirm)
        print("---")
