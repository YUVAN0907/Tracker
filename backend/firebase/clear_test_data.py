"""
Script to clear test data and reset PO status for fresh testing.
Deletes all purchasedProductBatch, purchasedProductCase, vendorPurchaseOrder, and vendorPurchaseItem records,
then updates ALL PO status to 'pending'.
"""

import os
import sys

sys.path.insert(0, os.path.dirname(__file__))
from dataconnect_db import execute_graphql

def clear_test_data():
    print("Clearing purchased product data...")

    # Delete all purchasedProductCase records
    try:
        result = execute_graphql("""
        mutation DeleteAllCases {
          purchasedProductCase_deleteMany(all: true)
        }
        """)
        print("✓ Deleted all purchasedProductCase records")
    except Exception as e:
        print(f"✗ ERROR deleting purchasedProductCase: {e}")

    # Delete all purchasedProductBatch records
    try:
        result = execute_graphql("""
        mutation DeleteAllBatches {
          purchasedProductBatch_deleteMany(all: true)
        }
        """)
        print("✓ Deleted all purchasedProductBatch records")
    except Exception as e:
        print(f"✗ ERROR deleting purchasedProductBatch: {e}")

    # Delete all vendorPurchaseItem records
    try:
        result = execute_graphql("""
        mutation DeleteAllVendorPurchaseItems {
          vendorPurchaseItem_deleteMany(all: true)
        }
        """)
        print("✓ Deleted all vendorPurchaseItem records")
    except Exception as e:
        print(f"✗ ERROR deleting vendorPurchaseItem: {e}")

    # Delete all vendorPurchaseOrder records
    try:
        result = execute_graphql("""
        mutation DeleteAllVendorPurchaseOrders {
          vendorPurchaseOrder_deleteMany(all: true)
        }
        """)
        print("✓ Deleted all vendorPurchaseOrder records")
    except Exception as e:
        print(f"✗ ERROR deleting vendorPurchaseOrder: {e}")

    # Fetch all POs to update their status
    try:
        print("\nFetching all purchase orders...")
        po_result = execute_graphql("""
        query GetAllPOs {
          purchaseOrderHeaders(limit: 1000) {
            poId
            status
          }
        }
        """)
        
        # Handle both response formats
        pos = []
        if po_result:
            if 'data' in po_result:
                pos = po_result.get('data', {}).get('purchaseOrderHeaders', [])
            elif isinstance(po_result, dict) and 'purchaseOrderHeaders' in po_result:
                pos = po_result.get('purchaseOrderHeaders', [])
        
        if pos:
            print(f"Found {len(pos)} purchase orders")
            
            # Update each PO status to 'pending'
            updated_count = 0
            for po in pos:
                po_id = po.get('poId')
                current_status = po.get('status')
                
                if current_status and current_status.lower() != 'pending':
                    try:
                        result = execute_graphql("""
                        mutation UpdatePOStatus($poId: String!, $status: String!) {
                          purchaseOrderHeader_update(key: {poId: $poId}, data: {status: $status})
                        }
                        """, {"poId": po_id, "status": "pending"})
                        print(f"✓ Updated PO {po_id} status from '{current_status}' to 'pending'")
                        updated_count += 1
                    except Exception as e:
                        print(f"✗ ERROR updating PO {po_id}: {e}")
                else:
                    print(f"  PO {po_id} already 'pending' or status unknown")
            
            print(f"\nStatus reset complete! Updated {updated_count} PO(s) to 'pending'")
        else:
            print(f"No purchase orders found or error fetching")
    except Exception as e:
        print(f"✗ ERROR fetching/updating POs: {e}")

    print("\n" + "="*60)
    print("Data clearing and PO status reset complete!")
    print("="*60)

if __name__ == "__main__":
    clear_test_data()