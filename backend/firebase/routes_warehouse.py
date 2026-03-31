from flask import Blueprint, request, jsonify
from datetime import datetime
from dataconnect_db import execute_graphql, format_timestamp
import sys
import traceback

warehouse_bp = Blueprint('warehouse', __name__)

# ==========================================
# GRAPHQL QUERIES / MUTATIONS
# ==========================================

GET_WAREHOUSE_INV_QUERY = """
query GetWarehouse($productId: String!) {
  warehouseInventory(key: { productId: $productId }) {
    productId
    availableUnits
    unitsPerCase
  }
}
"""

# Get all purchased product cases for a product (sorted by expiry)
GET_PURCHASED_PRODUCT_CASES_FOR_PRODUCT = """
query GetPurchasedProductCases($productId: String!) {
  purchasedProductBatches(
    where: { productId: { eq: $productId } }
    limit: 1000
  ) {
    id
    productId
  }
}
"""

# Get warehouse entries for dashboard (with case expiry info)
GET_WAREHOUSE_ENTRIES = """
query GetWarehouseEntries {
  warehouseEntries(limit: 10000) {
    id
    productId
    caseLabel
    purchasedProductCaseId
    availableUnits
    addedDate
    notes
    purchasedProductCase {
      id
      expd
      availableUnits
    }
  }
}
"""

# Insert new warehouse entry
INSERT_WAREHOUSE_ENTRY_MUTATION = """
mutation InsertWarehouseEntry(
  $productId: String!,
  $caseLabel: String!,
  $purchasedProductCaseId: UUID!,
  $availableUnits: Int!,
  $addedDate: Timestamp!,
  $notes: String
) {
  warehouseEntry_insert(data: {
    productId: $productId,
    caseLabel: $caseLabel,
    purchasedProductCaseId: $purchasedProductCaseId,
    availableUnits: $availableUnits,
    addedDate: $addedDate,
    notes: $notes
  }) {
    id
    productId
    caseLabel
    availableUnits
  }
}
"""

# Update purchased product case available units
UPDATE_PURCHASED_PRODUCT_CASE_MUTATION = """
mutation UpdatePurchasedProductCase(
  $caseId: UUID!,
  $availableUnits: Int!
) {
  purchasedProductCase_update(
    key: { id: $caseId }
    data: { availableUnits: $availableUnits }
  )
}
"""

UPSERT_WAREHOUSE_MUTATION = """
mutation UpsertWarehouse($productId: String!, $availableUnits: Int!, $unitsPerCase: Int, $notes: String, $lastReceivedDate: Timestamp) {
  warehouseInventory_upsert(data: {
    productId: $productId,
    availableUnits: $availableUnits,
    unitsPerCase: $unitsPerCase,
    notes: $notes,
    lastReceivedDate: $lastReceivedDate
  }) {
    productId
    availableUnits
  }
}
"""

DELETE_WAREHOUSE_MUTATION = """
mutation DeleteWarehouse($productId: String!) {
  warehouseInventory_delete(key: { productId: $productId }) {
    productId
  }
}
"""

# Get warehouse entries for a product (with case details)
GET_WAREHOUSE_ENTRIES_FOR_PRODUCT = """
query GetWarehouseEntriesForProduct($productId: String!) {
  warehouseEntries(where: { productId: { eq: $productId } }, limit: 10000) {
    id
    productId
    caseLabel
    purchasedProductCaseId
    availableUnits
    addedDate
    notes
    purchasedProductCase {
      id
      expd
      availableUnits
    }
  }
}
"""

# Update warehouse entry units available
UPDATE_WAREHOUSE_ENTRY_MUTATION = """
mutation UpdateWarehouseEntry(
  $id: UUID!,
  $availableUnits: Int!
) {
  warehouseEntry_update(
    key: { id: $id }
    data: { availableUnits: $availableUnits }
  )
}
"""

# Delete warehouse entries for a product
DELETE_WAREHOUSE_ENTRIES_MUTATION = """
mutation DeleteWarehouseEntry($id: UUID!) {
  warehouseEntry_delete(key: { id: $id }) {
    id
  }
}
"""

# ==========================================
# HELPER FUNCTIONS
# ==========================================

def calculate_warehouse_total(warehouse_entries, product_id=None):
    """Calculate total available units in warehouse from warehouse entries"""
    total = 0
    for entry in warehouse_entries:
        if product_id is None or entry.get('productId') == product_id:
            total += entry.get('unitsRemaining', 0)
    return total

def get_purchased_product_cases_sorted_by_expiry(product_id):
    """Get all available purchased product cases for a product, sorted by expiry (soonest first)"""
    try:
        # Get all batches for this product
        batches_query = """query GetBatchesForProduct($productId: String!) {
            purchasedProductBatches(where: { productId: { eq: $productId } }, limit: 1000) {
                id
                productId
            }
        }"""
        
        batches_res = execute_graphql(batches_query, {"productId": product_id})
        batch_ids = [b.get("id") for b in batches_res.get("purchasedProductBatches", [])]
        
        print(f"[warehouse] Found {len(batch_ids)} batches for product {product_id}: {batch_ids}", file=sys.stderr, flush=True)
        
        if not batch_ids:
            print(f"[warehouse] No batches found for product {product_id}", file=sys.stderr, flush=True)
            return []
        
        # Get all cases for these batches (without where clause, and filter in Python)
        cases_query = """query GetAllCases {
            purchasedProductCases(limit: 10000) {
                id
                caseLabel
                purchasedProductBatchId
                expd
                availableUnits
            }
        }"""
        
        cases_res = execute_graphql(cases_query, {})
        all_cases = cases_res.get("purchasedProductCases", [])
        
        print(f"[warehouse] Fetched {len(all_cases)} total cases", file=sys.stderr, flush=True)
        
        # Filter cases for this product's batches
        filtered_cases = [c for c in all_cases if c.get('purchasedProductBatchId') in batch_ids]
        
        print(f"[warehouse] Filtered to {len(filtered_cases)} cases for product {product_id}", file=sys.stderr, flush=True)
        
        # Filter cases that have available units and sort by expiry
        available_cases = [c for c in filtered_cases if c.get('availableUnits', 0) > 0]
        available_cases.sort(key=lambda x: x.get('expd', ''), reverse=False)  # Sort by expiry ascending
        
        print(f"[warehouse] {len(available_cases)} cases have available units", file=sys.stderr, flush=True)
        
        return available_cases
    except Exception as e:
        print(f"[warehouse] Error fetching purchased product cases: {e}", file=sys.stderr, flush=True)
        import traceback
        traceback.print_exc(file=sys.stderr)
        return []

# ==========================================
# API ENDPOINTS
# ==========================================

@warehouse_bp.route('/api/warehouse/purchase-products', methods=['GET'])
def get_available_purchased_products():
    """Get list of available purchased products that can be added to warehouse"""
    try:
        # First, get all purchased product batches
        batches_query = """query GetPurchasedProductBatches {
            purchasedProductBatches(limit: 1000) {
                id
                poId
                productId
                batch
                unitsPerCase
                product {
                    productId
                    productName
                }
            }
        }"""
        
        batches_res = execute_graphql(batches_query, {})
        batches = batches_res.get("purchasedProductBatches", [])
        batches_map = {b.get('id'): b for b in batches}
        
        # Then get all cases
        cases_query = """query GetPurchasedProductCases {
            purchasedProductCases(limit: 10000) {
                id
                purchasedProductBatchId
                caseLabel
                expd
                availableUnits
            }
        }"""
        
        cases_res = execute_graphql(cases_query, {})
        cases = cases_res.get("purchasedProductCases", [])
        
        # Group by product ID with expiry date and available units
        products_map = {}
        for case in cases:
            batch_id = case.get('purchasedProductBatchId')
            batch = batches_map.get(batch_id, {})
            product_id = batch.get('productId', '')
            available_units = case.get('availableUnits', 0)
            
            # Only include cases with available units
            if available_units <= 0 or not product_id:
                continue
            
            if product_id not in products_map:
                products_map[product_id] = {
                    'Product_ID': product_id,
                    'Product_Name': batch.get('product', {}).get('productName', ''),
                    'PO_ID': batch.get('poId', ''),
                    'Units_Per_Case': batch.get('unitsPerCase', 1),
                    'Total_Available_Units': 0,
                    'cases': []
                }
            
            products_map[product_id]['Total_Available_Units'] += available_units
            products_map[product_id]['cases'].append({
                'case_id': case.get('id'),
                'caseLabel': case.get('caseLabel'),
                'availableUnits': available_units,
                'expd': case.get('expd')
            })
        
        # Sort cases by expiry date (soonest first)
        for product in products_map.values():
            product['cases'].sort(key=lambda x: x.get('expd', ''), reverse=False)
        
        products_list = list(products_map.values())
        # Sort by total available units (descending)
        products_list.sort(key=lambda x: x['Total_Available_Units'], reverse=True)
        
        print(f"[warehouse] Found {len(products_list)} products with available units", file=sys.stderr, flush=True)
        return jsonify(products_list)
    
    except Exception as e:
        print(f"[warehouse] Error getting purchased products: {e}", file=sys.stderr, flush=True)
        import traceback
        traceback.print_exc(file=sys.stderr)
        return jsonify({'error': str(e)}), 500

@warehouse_bp.route('/api/warehouse/add-from-purchase', methods=['POST'])
def add_to_warehouse_from_purchase():
    """
    Add units to warehouse from purchased products with smart case allocation.
    Takes from cases expiring soonest.
    """
    import sys as sys_module
    import os
    
    # Log to file to bypass Flask's stderr buffering
    log_file = os.path.join(os.path.dirname(__file__), 'warehouse.log')
    def log(msg):
        with open(log_file, 'a') as f:
            f.write(f"{msg}\n")
            f.flush()
    
    data = request.json
    log(f"\n=== add-from-purchase request ===")
    log(f"Request data: {data}")
    
    try:
        product_id = str(data.get('product_id', '')).strip()
        units_to_add = int(data.get('units_to_add', 0))
        notes = data.get('notes', '')
        
        log(f"product_id={product_id}, units_to_add={units_to_add}")
        
        if not product_id or units_to_add <= 0:
            return jsonify({'error': 'Valid product_id and units_to_add > 0 are required'}), 400
        
        # Get all cases
        log(f"Fetching all cases...")
        
        cases_query = """query GetAllCases {
            purchasedProductCases(limit: 100000) {
                id
                caseLabel
                purchasedProductBatchId
                expd
                availableUnits
            }
        }"""
        
        log(f"Executing cases query...")
        cases_res = execute_graphql(cases_query, {})
        log(f"Cases query response keys: {list(cases_res.keys())}")
        
        all_cases = cases_res.get("purchasedProductCases", [])
        log(f"Total cases fetched: {len(all_cases)}")
        
        if all_cases:
            log(f"Sample case keys: {list(all_cases[0].keys())}")
            log(f"Sample case: {all_cases[0]}")
        
        # Get all batches
        log(f"Fetching all batches...")
        batches_query = """query GetAllBatches {
            purchasedProductBatches(limit: 100000) {
                id
                productId
            }
        }"""
        
        batches_res = execute_graphql(batches_query, {})
        all_batches = batches_res.get("purchasedProductBatches", [])
        log(f"Total batches fetched: {len(all_batches)}")
        
        # Create product ID -> batch ID map
        batch_ids = [b.get('id') for b in all_batches if b.get('productId') == product_id]
        log(f"Batch IDs for product {product_id}: {batch_ids}")
        
        # Filter cases for this product
        available_cases = []
        for case in all_cases:
            case_batch_id = case.get('purchasedProductBatchId')
            case_available_units = case.get('availableUnits', 0)
            
            if case_batch_id in batch_ids and case_available_units > 0:
                available_cases.append(case)
                log(f"  Added case: {case.get('caseLabel')} from batch {case_batch_id}")
        
        log(f"Filtered to {len(available_cases)} cases for product {product_id}")
        
        if not available_cases:
            log(f"ERROR: No available cases found for product {product_id}")
            return jsonify({'error': f'No available purchased products found for {product_id}'}), 404
        
        # Sort by expiry (soonest first)
        available_cases.sort(key=lambda x: x.get('expd', ''), reverse=False)
        
        total_available = sum(c.get('availableUnits', 0) for c in available_cases)
        if total_available < units_to_add:
            return jsonify({'error': f'Insufficient available units. Available: {total_available}, Requested: {units_to_add}'}), 400
        
        # Smart allocation
        units_remaining = units_to_add
        allocated_cases = []
        
        for case in available_cases:
            if units_remaining <= 0:
                break
            
            try:
                case_id = case.get('id')
                case_label = case.get('caseLabel')
                case_available = case.get('availableUnits', 0)
                expd = case.get('expd')
                
                log(f"Processing case {case_label}: id={case_id}, available={case_available}, expd={expd}")
                
                units_from_this_case = min(units_remaining, case_available)
                units_remaining -= units_from_this_case
                
                allocated_cases.append({
                    'case_id': case_id,
                    'case_label': case_label,
                    'units_allocated': units_from_this_case,
                    'new_available': case_available - units_from_this_case,
                    'expd': expd
                })
                
                log(f"  Allocated {units_from_this_case} from {case_label}")
            except Exception as inner_e:
                log(f"ERROR in allocation loop: {inner_e}")
                raise
        
        log(f"Allocation complete: {len(allocated_cases)} cases used")
        # Continue with database updates...
        warehouse_entries_created = []
        
        for allocation in allocated_cases:
            try:
                # Update PurchasedProductCase available units
                case_update_vars = {
                    "caseId": allocation['case_id'],
                    "availableUnits": allocation['new_available']
                }
                log(f"Updating case {allocation['case_label']}: {case_update_vars}")
                update_result = execute_graphql(UPDATE_PURCHASED_PRODUCT_CASE_MUTATION, case_update_vars)
                log(f"Case update result: {update_result}")
                print(f"[warehouse] Updated case {allocation['case_label']}: available set to {allocation['new_available']}", file=sys.stderr, flush=True)
                
                # Create WarehouseEntry record with new schema
                entry_vars = {
                    "productId": product_id,
                    "caseLabel": allocation['case_label'],
                    "purchasedProductCaseId": allocation['case_id'],
                    "availableUnits": allocation['units_allocated'],  # Units available in warehouse from this case
                    "addedDate": format_timestamp(datetime.now()),
                    "notes": notes or f"Added to warehouse from {allocation['case_label']}"
                }
                log(f"Inserting warehouse entry: {entry_vars}")
                insert_result = execute_graphql(INSERT_WAREHOUSE_ENTRY_MUTATION, entry_vars)
                log(f"Warehouse entry insert result: {insert_result}")
                print(f"[warehouse] Created WarehouseEntry: {allocation['case_label']} with {allocation['units_allocated']} units", file=sys.stderr, flush=True)
                
                warehouse_entries_created.append(entry_vars)
            except Exception as allocation_error:
                error_msg = f"ERROR processing allocation {allocation['case_label']}: {str(allocation_error)}"
                log(error_msg)
                print(f"[warehouse] {error_msg}", file=sys.stderr, flush=True)
                print(traceback.format_exc(), file=sys.stderr, flush=True)
                raise
        
        # Update WarehouseInventory total (for backward compatibility)
        try:
            log(f"Fetching warehouse inventory for {product_id}")
            warehouse_res = execute_graphql(GET_WAREHOUSE_INV_QUERY, {"productId": product_id})
            current_inv = warehouse_res.get("warehouseInventory", {})
            current_units = int(current_inv.get("availableUnits", 0))
            
            units_per_case = int(current_inv.get("unitsPerCase", 1)) if current_inv else 1
            new_total_units = current_units + units_to_add
            
            warehouse_vars = {
                "productId": product_id,
                "availableUnits": new_total_units,
                "unitsPerCase": units_per_case,
                "notes": notes,
                "lastReceivedDate": format_timestamp(datetime.now())
            }
            log(f"Upserting warehouse inventory: {warehouse_vars}")
            upsert_result = execute_graphql(UPSERT_WAREHOUSE_MUTATION, warehouse_vars)
            log(f"Warehouse inventory upsert result: {upsert_result}")
            print(f"[warehouse] Updated WarehouseInventory: {product_id} total units = {new_total_units}", file=sys.stderr, flush=True)
        except Exception as inv_error:
            log(f"WARNING: Error updating warehouse inventory: {inv_error}")
            # Continue anyway, this is just for backward compatibility
            pass
        
        return jsonify({
            'message': f'Successfully added {units_to_add} units from {len(allocated_cases)} case(s) to warehouse',
            'product_id': product_id,
            'units_added': units_to_add,
            'cases_used': [
                {
                    'case_label': c.get('case_label', ''),
                    'units_from_case': c.get('units_allocated', 0),
                    'expiry_date': c.get('expd', '')
                }
                for c in allocated_cases
            ]
        })
    
    except Exception as e:
        error_msg = f"[warehouse] Error adding to warehouse: {str(e)}\nFull error: {repr(e)}"
        print(error_msg, file=sys.stderr, flush=True)
        log(f"\nEXCEPTION: {error_msg}")
        print(traceback.format_exc(), file=sys.stderr, flush=True)
        return jsonify({'error': str(e)}), 500

@warehouse_bp.route('/api/warehouse/add', methods=['POST'])
def add_to_warehouse():
    data = request.json
    try:
        product_id = str(data.get('product_id', data.get('Product_ID', ''))).strip()
        units_received = int(data.get('units_received', data.get('Units', data.get('units', 0))))
        units_per_case = int(data.get('units_per_case', data.get('Units_Per_Case', 1)))
        notes = data.get('notes', data.get('Notes', ''))

        if not product_id or units_received <= 0:
            return jsonify({'error': 'Valid Product ID and units > 0 are required'}), 400

        # Current stock
        res = execute_graphql(GET_WAREHOUSE_INV_QUERY, {"productId": product_id})
        current_inv = res.get("warehouseInventory")
        
        current_units = 0
        if current_inv:
            current_units = int(current_inv.get("availableUnits", 0))
            
        new_units = current_units + units_received

        vars = {
            "productId": product_id,
            "availableUnits": new_units,
            "unitsPerCase": units_per_case,
            "notes": notes,
            "lastReceivedDate": format_timestamp(datetime.now())
        }
        execute_graphql(UPSERT_WAREHOUSE_MUTATION, vars)

        return jsonify({'message': f'Success: Stock updated to {new_units} units for {product_id}'})

    except Exception as e:
        return jsonify({'error': str(e)}), 500

@warehouse_bp.route('/api/warehouse/transfer', methods=['POST'])
def transfer_from_warehouse():
    data = request.json
    try:
        product_id = str(data.get('product_id', '')).strip()
        units_to_transfer = int(data.get('units', 0))

        if not product_id or units_to_transfer <= 0:
            return jsonify({'error': 'Valid Product ID and units > 0 are required'}), 400

        # Get all warehouse entries for this product
        res = execute_graphql(GET_WAREHOUSE_ENTRIES_FOR_PRODUCT, {"productId": product_id})
        entries = res.get("warehouseEntries", [])

        if not entries:
            return jsonify({'error': f'Product {product_id} not found in warehouse'}), 404

        # Calculate total available units
        total_units = sum(int(e.get("availableUnits", 0)) for e in entries)

        if total_units < units_to_transfer:
            return jsonify({'error': f'Insufficient stock in warehouse (Available: {total_units}, Requested: {units_to_transfer})'}), 400

        # Reduce units from entries (from first to last)
        units_remaining = units_to_transfer
        for entry in entries:
            if units_remaining <= 0:
                break
            
            entry_id = entry.get('id')
            current_units = int(entry.get('availableUnits', 0))
            units_to_reduce = min(units_remaining, current_units)
            new_remaining = current_units - units_to_reduce
            units_remaining -= units_to_reduce
            
            # Update or delete the entry
            if new_remaining > 0:
                update_vars = {
                    "id": entry_id,
                    "availableUnits": new_remaining
                }
                execute_graphql(UPDATE_WAREHOUSE_ENTRY_MUTATION, update_vars)
            else:
                # Delete entry if no units left
                delete_vars = {"id": entry_id}
                execute_graphql(DELETE_WAREHOUSE_ENTRIES_MUTATION, delete_vars)

        # Calculate remaining units
        remaining_units = total_units - units_to_transfer

        return jsonify({
            'message': f'Successfully transferred {units_to_transfer} units.',
            'remaining': remaining_units
        })

    except Exception as e:
        return jsonify({'error': str(e)}), 500

@warehouse_bp.route('/api/warehouse/update', methods=['POST'])
def update_warehouse_item():
    data = request.json
    try:
        product_id = str(data.get('product_id', '')).strip()
        available_units = data.get('Available_Units')
        units_per_case = data.get('Units_Per_Case')
        notes = data.get('Notes', '')

        if not product_id:
            return jsonify({'error': 'Product ID is required'}), 400

        if available_units is None and units_per_case is None and not notes:
            return jsonify({'error': 'No updates provided'}), 400
            
        res = execute_graphql(GET_WAREHOUSE_INV_QUERY, {"productId": product_id})
        current_inv = res.get("warehouseInventory")
        
        if not current_inv:
            return jsonify({'error': 'Item not found in warehouse'}), 404

        new_units = int(available_units) if available_units is not None else int(current_inv.get('availableUnits', 0))
        new_upc = int(units_per_case) if units_per_case is not None else int(current_inv.get('unitsPerCase', 1))

        vars = {
            "productId": product_id,
            "availableUnits": new_units,
            "unitsPerCase": new_upc,
            "notes": notes,
            "lastReceivedDate": format_timestamp(datetime.now())
        }
        execute_graphql(UPSERT_WAREHOUSE_MUTATION, vars)

        return jsonify({'message': f'Warehouse item {product_id} updated successfully'})

    except Exception as e:
        return jsonify({'error': str(e)}), 500

@warehouse_bp.route('/api/warehouse/delete', methods=['POST'])
def delete_warehouse_item():
    data = request.json
    try:
        product_id = str(data.get('product_id', '')).strip()
        if not product_id:
            return jsonify({'error': 'Product ID is required'}), 400

        # Get all warehouse entries for this product
        res = execute_graphql(GET_WAREHOUSE_ENTRIES_FOR_PRODUCT, {"productId": product_id})
        entries = res.get("warehouseEntries", [])

        if not entries:
            return jsonify({'error': f'Product {product_id} not found in warehouse'}), 404

        # Delete all warehouse entries for this product
        for entry in entries:
            entry_id = entry.get('id')
            delete_vars = {"id": entry_id}
            execute_graphql(DELETE_WAREHOUSE_ENTRIES_MUTATION, delete_vars)

        return jsonify({'message': f'Product {product_id} successfully deleted from warehouse'})

    except Exception as e:
        return jsonify({'error': str(e)}), 500

