import os
import sys
import json

sys.path.insert(0, os.path.dirname(__file__))
from dataconnect_config import get_auth_session, DATACONNECT_ENDPOINT

url = DATACONNECT_ENDPOINT

session = get_auth_session()

def execute_graphql(query, variables=None, timeout=30):
    payload = {"query": query}
    if variables:
        payload["variables"] = variables

    try:
        response = session.post(url, json=payload, timeout=timeout)
        response.raise_for_status()
        return response.json()
    except Exception as e:
        print(f"GraphQL request failed: {e}")
        return None

delete_assignments_query = """
mutation DeleteAssignments {
  machineStockAssignment_deleteMany(all: true)
}
"""

delete_po_query = """
mutation DeletePOs {
  purchaseOrder_deleteMany(where: {poId: {ne: ""}})
}
"""

delete_vendor_purchase_query = """
mutation DeleteVendorPurchases {
  vendorPurchase_deleteMany(all: true)
  purchasedProduct_deleteMany(all: true)
}
"""

if __name__ == "__main__":
    print("Deleting Machine Stock Assignments...")
    res1 = execute_graphql(delete_assignments_query)
    print("Result:", json.dumps(res1, indent=2))
    
    print("\\nDeleting Vendor Purchases and Purchased Products...")
    res2 = execute_graphql(delete_vendor_purchase_query)
    print("Result:", json.dumps(res2, indent=2))

    print("\\nDeleting Purchase Orders...")
    res3 = execute_graphql(delete_po_query)
    print("Result:", json.dumps(res3, indent=2))
