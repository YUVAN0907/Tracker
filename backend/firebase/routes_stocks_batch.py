from flask import Blueprint, request, jsonify
from datetime import datetime
from dataconnect_db import execute_graphql, format_timestamp
import logging

stocks_batch_bp = Blueprint('stocks_batch', __name__)
logger = logging.getLogger(__name__)

INSERT_MACHINE_ASSIGNMENT = """
mutation InsertAssignment(
  $batch: Int,
  $assignedDate: Timestamp,
  $machineId: String!,
  $stockLabel: String!,
  $caseLabel: String,
  $coverLabel: String!,
  $coverStatus: String,
  $productId: String!,
  $units: Int,
  $status: String
) {
  machineStockAssignment_insert(data: {
    batch: $batch,
    assignedDate: $assignedDate,
    machineId: $machineId,
    stockLabel: $stockLabel,
    caseLabel: $caseLabel,
    coverLabel: $coverLabel,
    coverStatus: $coverStatus,
    productId: $productId,
    units: $units,
    status: $status
  }) 
}
"""

UPDATE_ASSIGNMENT_STATUS = """
mutation UpdateAssignmentStatus($id: UUID!, $status: String!) {
  machineStockAssignment_update(id: $id, data: { status: $status }) 
}
"""

GET_MAX_BATCH_QUERY = """
query GetMaxBatch {
  machineStockAssignmentList(orderBy: [{batch: DESC}], limit: 1) {
    batch
  }
}
"""

GET_ALL_MACHINES_QUERY = """
query GetAllMachines {
  machineList {
    id
    name
    location
  }
}
"""

UPDATE_WAREHOUSE_STOCK_AFTER_BATCH = """
mutation UpdateWarehouseStock($productId: String!, $newUnits: Int!) {
  warehouseStock_update(key: {productId: $productId}, data: {availableUnits: $newUnits})
}
"""

GET_WH_UNITS_QUERY = """
query GetWH($productId: String!) {
  warehouseStock(key: {productId: $productId}) {
    availableUnits
  }
}
"""

# =============== NEW QUERIES FOR FIREBASE MIGRATION ===============

# Get all batch suggestions (stock-cover-product combinations with latest batches)
GET_BATCH_SUGGESTIONS_QUERY = """
query GetBatchSuggestions {
  machineStockAssignmentList(limit: 1000, orderBy: [{batch: DESC}]) {
    batch
    stockLabel
    coverLabel
    productId
    units
    product {
      productName
    }
  }
  warehouseStocks(where: { availableUnits: { gt: 0 }}) {
    productId
    availableUnits
    product {
      productName
    }
  }
}
"""

# Get previous batches for a specific stock-cover-product (filtering by batch parity)
GET_PREVIOUS_BATCHES_QUERY = """
query GetPreviousBatches(
  $stockLabel: String!, 
  $coverLabel: String!, 
  $productId: String!,
  $maxBatch: Int
) {
  machineStockAssignmentList(
    where: {
      AND: [
        { stockLabel: { eq: $stockLabel } }
        { coverLabel: { eq: $coverLabel } }
        { productId: { eq: $productId } }
        { batch: { lt: $maxBatch } }
        { units: { gt: 0 } }
      ]
    }
    orderBy: [{batch: DESC}]
    limit: 10
  ) {
    batch
    stockLabel
    coverLabel
    productId
    units
    product {
      productName
    }
  }
}
"""

# Get warehouse stock for a product (from all warehouses)
GET_WAREHOUSE_STOCK_QUERY = """
query GetWarehouseStock($productId: String!) {
  warehouseStocks(
    where: { productId: { eq: $productId } }
    orderBy: [{expd: ASC}]
  ) {
    stockId
    productId
    availableUnits
    unitsPerCase
    expd
    caseLabel
    warehouseId
    warehouse {
      warehouseId
      location
      name
    }
    product {
      productName
    }
  }
}
"""

# Get purchased products for a product
GET_PURCHASED_PRODUCTS_QUERY = """
query GetPurchasedProducts($productId: String!) {
  purchasedProductStockList(
    where: {
      AND: [
        { productId: { eq: $productId } }
        { unitsAvailable: { gt: 0 } }
      ]
    }
  ) {
    id
    purchasedProductBatchId
    productId
    unitsAvailable
    unitsPerCase
    expiryDate
    product {
      productName
    }
  }
}
"""

# Update MachineStockAssignment units (for decreasing from sources)
UPDATE_STOCK_UNITS_QUERY = """
mutation UpdateStockUnits($id: UUID!, $newUnits: Int!) {
  machineStockAssignment_update(key: { id: $id }, data: { units: $newUnits })
}
"""

# Update purchased product stock units
UPDATE_PURCHASED_STOCK_UNITS_QUERY = """
mutation UpdatePurchasedStock($id: UUID!, $newUnits: Int!) {
  purchasedProductStock_update(key: { id: $id }, data: { unitsAvailable: $newUnits })
}
"""

# Much of the existing batch creation logic involves mapping nested structures into the flat
# MachineStockAssignment Postgres table defined in the user's Data Connect schema.
@stocks_batch_bp.route('/api/stocks/create-batch-full', methods=['POST'])
def create_batch_full():
    data = request.json
    try:
        # Expected structure (now with 7 machines per batch):
        # {'batch_number': 1, 'created_date': '2026-03-05',
        #  'stocks': {'M001': {'covers': {'C': [...], 'C2': [...]}},
        #            'M002': {'covers': {'C': [...]}},
        #            ... for all 7 machines}}
        
        batch_number = int(data.get('batch_number', 0))
        created_date = data.get('created_date', datetime.now().isoformat().split('T')[0])
        stocks_dict = data.get('stocks', {})
        
        if not batch_number:
            return jsonify({'error': 'batch_number is required and must be > 0'}), 400
        
        if not stocks_dict:
            return jsonify({'error': 'stocks data is required'}), 400
        
        assigned_date = format_timestamp(datetime.strptime(created_date, '%Y-%m-%d'))
        
        # Track what we're creating for logging
        created_records = []
        product_usage = {}
        
        # Iterate over stocks (S1, S2, S3, ... S7)
        # Each stock key in stocks_dict corresponds to a stock position
        for stock_label, stock_data in stocks_dict.items():
            if not isinstance(stock_data, dict):
                continue
            
            machine_id = stock_data.get('machine', '').strip()
            if not machine_id:
                logger.warning(f"⚠️ Stock {stock_label} has no machine assigned, skipping")
                continue
            
            covers = stock_data.get('covers', {})
            
            # Iterate over covers (C, C2, C3...)
            for cover_label, products in covers.items():
                if not isinstance(products, list):
                    continue
                    
                # When batch is created, covers are initially "covered"
                cover_status = "covered"
                
                # Iterate over products in this cover
                for product in products:
                    product_id = str(product.get("product_id", product.get("productId", ""))).strip()
                    units = int(product.get("units", 0))
                    case_label = str(product.get("caseLabel", product.get("case_label", ""))).strip()
                    
                    if not product_id or units <= 0:
                        continue
                    
                    # Track product usage for source tracking
                    product_usage[product_id] = product_usage.get(product_id, 0) + units
                    
                    # Insert into MachineStockAssignment
                    vars = {
                        "batch": batch_number,
                        "assignedDate": assigned_date,
                        "machineId": machine_id,
                        "stockLabel": stock_label,
                        "caseLabel": case_label if case_label else None,
                        "coverLabel": cover_label,
                        "coverStatus": cover_status,
                        "productId": product_id,
                        "units": units,
                        "status": "Active"
                    }
                    
                    result = execute_graphql(INSERT_MACHINE_ASSIGNMENT, vars)
                    created_records.append({
                        'batch': batch_number,
                        'machine': machine_id,
                        'stock': machine_id,
                        'cover': cover_label,
                        'product': product_id,
                        'units': units
                    })
                    
                    logger.info(f"✅ Created MachineStockAssignment: Batch {batch_number}, Machine {machine_id}, Cover {cover_label}, Product {product_id}, Units {units}")
        
        # NOTE: Do NOT auto-deduct from warehouse here
        # Sources should be decreased via the separate /decrease-from-sources endpoint
        # This allows tracking which source (warehouse/previous batch/purchased) was used
        
        return jsonify({
            'success': True,
            'message': f'Batch {batch_number} created successfully',
            'batch_number': batch_number,
            'created_records': len(created_records),
            'details': created_records
        }), 200
        
    except Exception as e:
        logger.error(f"Error in create_batch_full: {str(e)}", exc_info=True)
        return jsonify({'error': str(e)}), 500


@stocks_batch_bp.route('/api/stocks/update-status', methods=['POST'])
def update_stock_status():
    data = request.json
    try:
        stock_id = str(data.get('stock_id', '')).strip()
        new_status = str(data.get('status', '')).strip()

        if not stock_id or not new_status:
            return jsonify({'error': 'Stock ID and Status are required'}), 400

        # Note: stock_id is mapped to the UUID 'id' of MachineStockAssignment
        execute_graphql(UPDATE_ASSIGNMENT_STATUS, {"id": stock_id, "status": new_status})

        return jsonify({'message': f'Status updated to {new_status}'})

    except Exception as e:
        return jsonify({'error': str(e)}), 500

@stocks_batch_bp.route('/api/stocks/decrease-from-sources', methods=['POST'])
def decrease_from_sources():
    """
    Decrease units from various sources after batch creation.
    Handles three types of sources:
    1. previous_batch: Decrease from MachineStockAssignment (existing batches)
    2. warehouse: Decrease from Warehouse
    3. purchased_product: Decrease from PurchasedProductStock
    """
    data = request.json
    sources = data.get('sources', [])
    
    if not sources:
        return jsonify({'error': 'No sources provided'}), 400
    
    results = {'processed': [], 'failed': []}
    
    try:
        for source in sources:
            source_type = source.get('type')
            
            try:
                if source_type == 'previous_batch':
                    # Decrease from MachineStockAssignment
                    batch_num = source.get('batch_number')
                    stock_label = source.get('stock_name')
                    cover_label = source.get('cover_name')
                    product_id = source.get('product_id')
                    units_to_decrease = int(source.get('units', 0))
                    
                    if not all([batch_num, stock_label, cover_label, product_id, units_to_decrease > 0]):
                        raise ValueError(f"Missing required fields for previous_batch source")
                    
                    # Get the assignment to update
                    query_vars = {
                        'batch': batch_num,
                        'stockLabel': stock_label,
                        'coverLabel': cover_label,
                        'productId': product_id
                    }
                    
                    get_query = """
                    query GetAssignment($batch: Int!, $stockLabel: String!, $coverLabel: String!, $productId: String!) {
                      machineStockAssignmentList(where: {
                        AND: [
                          {batch: {eq: $batch}}
                          {stockLabel: {eq: $stockLabel}}
                          {coverLabel: {eq: $coverLabel}}
                          {productId: {eq: $productId}}
                        ]
                      }) {
                        id
                        units
                      }
                    }
                    """
                    
                    res = execute_graphql(get_query, query_vars)
                    assignments = res.get('machineStockAssignmentList', [])
                    
                    if not assignments:
                        raise ValueError(f"Assignment not found: Batch {batch_num}, Stock {stock_label}, Product {product_id}")
                    
                    assignment = assignments[0]
                    current_units = int(assignment.get('units', 0))
                    new_units = max(0, current_units - units_to_decrease)
                    
                    execute_graphql(UPDATE_STOCK_UNITS_QUERY, {
                        'id': assignment.get('id'),
                        'newUnits': new_units
                    })
                    
                    results['processed'].append({
                        'type': 'previous_batch',
                        'batch': batch_num,
                        'product': product_id,
                        'decreased': units_to_decrease,
                        'remaining': new_units,
                        'status': 'success'
                    })
                    logger.info(f"✅ Decreased {units_to_decrease} units from Batch {batch_num}, remaining: {new_units}")
                
                
                elif source_type == 'warehouse':
                    # ✅ FIX: Use case_id to target specific warehouse case, not just product_id
                    product_id = source.get('product_id')
                    case_id = source.get('case_id')  # stockId from warehouse
                    units_to_decrease = int(source.get('units', 0))
                    
                    if not product_id or units_to_decrease <= 0:
                        raise ValueError(f"Missing required fields for warehouse source")
                    
                    # ✅ PREFERRED: If case_id provided, query specific case
                    if case_id:
                        logger.info(f"💡 Using case_id={case_id} for targeted warehouse decrease")
                        case_query = """
                        query GetCase($caseId: String!) {
                          warehouseStock(key: { stockId: $caseId }) {
                            stockId
                            availableUnits
                            productId
                          }
                        }
                        """
                        case_res = execute_graphql(case_query, {'caseId': case_id})
                        warehouse = case_res.get('warehouseStock')
                        
                        if not warehouse:
                            logger.warning(f"⚠️ Warehouse case {case_id} not found, falling back to product query")
                            case_id = None  # Fall back to product query
                        else:
                            current_units = int(warehouse.get('availableUnits', 0))
                            new_units = max(0, current_units - units_to_decrease)
                            
                            # Update specific case/stock
                            update_query = """
                            mutation UpdateCase($caseId: String!, $newUnits: Int!) {
                              warehouseStock_update(key: { stockId: $caseId }, data: { availableUnits: $newUnits })
                            }
                            """
                            execute_graphql(update_query, {'caseId': case_id, 'newUnits': new_units})
                            
                            results['processed'].append({
                                'type': 'warehouse',
                                'product': product_id,
                                'case_id': case_id,
                                'decreased': units_to_decrease,
                                'remaining': new_units,
                                'status': 'success'
                            })
                            logger.info(f"✅ Decreased {units_to_decrease} units from Warehouse Case {case_id}, remaining: {new_units}")
                            continue
                    
                    # ✅ FALLBACK: If no case_id, query by product (less precise)
                    if not case_id:
                        logger.info(f"⚠️ No case_id provided, querying by product_id={product_id}")
                        wh_res = execute_graphql(GET_WAREHOUSE_STOCK_QUERY, {'productId': product_id})
                        warehouse_list = wh_res.get('warehouseStocks', [])
                        
                        if not warehouse_list:
                            raise ValueError(f"Warehouse not found for product {product_id}")
                        
                        # Use the first warehouse stock entry (they're sorted by expiry date)
                        warehouse = warehouse_list[0]
                        current_units = int(warehouse.get('availableUnits', 0))
                        new_units = max(0, current_units - units_to_decrease)
                        
                        execute_graphql(UPDATE_WAREHOUSE_STOCK_AFTER_BATCH, {
                            'productId': product_id,
                            'newUnits': new_units
                        })
                        
                        results['processed'].append({
                            'type': 'warehouse',
                            'product': product_id,
                            'decreased': units_to_decrease,
                            'remaining': new_units,
                            'status': 'success'
                        })
                        logger.info(f"✅ Decreased {units_to_decrease} units from Warehouse for product {product_id}, remaining: {new_units}")
                
                
                elif source_type == 'purchased_product':
                    # Decrease from PurchasedProductStock
                    purchased_batch_id = source.get('purchasedProductBatchId')
                    product_id = source.get('product_id')
                    units_to_decrease = int(source.get('units', 0))
                    
                    if not purchased_batch_id or not product_id or units_to_decrease <= 0:
                        raise ValueError(f"Missing required fields for purchased_product source")
                    
                    # Get the purchased product stock
                    query = """
                    query GetPurchasedStock($batchId: UUID!, $productId: String!) {
                      purchasedProductStockList(where: {
                        AND: [
                          {purchasedProductBatchId: {eq: $batchId}}
                          {productId: {eq: $productId}}
                        ]
                      }) {
                        id
                        unitsAvailable
                      }
                    }
                    """
                    
                    res = execute_graphql(query, {
                        'batchId': purchased_batch_id,
                        'productId': product_id
                    })
                    stocks = res.get('purchasedProductStockList', [])
                    
                    if not stocks:
                        # Try with just the batch ID
                        query_simple = """
                        query GetPurchasedStockSimple($id: UUID!) {
                          purchasedProductStock(key: {id: $id}) {
                            id
                            unitsAvailable
                            productId
                          }
                        }
                        """
                        res = execute_graphql(query_simple, {'id': purchased_batch_id})
                        stock = res.get('purchasedProductStock')
                        if not stock:
                            raise ValueError(f"Purchased stock not found for batch {purchased_batch_id}")
                        stocks = [stock]
                    
                    stock = stocks[0]
                    current_units = int(stock.get('unitsAvailable', 0))
                    new_units = max(0, current_units - units_to_decrease)
                    
                    execute_graphql(UPDATE_PURCHASED_STOCK_UNITS_QUERY, {
                        'id': stock.get('id'),
                        'newUnits': new_units
                    })
                    
                    results['processed'].append({
                        'type': 'purchased_product',
                        'batch': purchased_batch_id,
                        'product': product_id,
                        'decreased': units_to_decrease,
                        'remaining': new_units,
                        'status': 'success'
                    })
                    logger.info(f"✅ Decreased {units_to_decrease} units from Purchased Product Batch, remaining: {new_units}")
                
                
                else:
                    raise ValueError(f"Unknown source type: {source_type}")
                    
            except Exception as e:
                logger.error(f"❌ Error processing source {source_type}: {str(e)}")
                results['failed'].append({
                    'source': source,
                    'error': str(e)
                })
        
        return jsonify({
            'success': len(results['failed']) == 0,
            'message': f"Processed {len(results['processed'])} sources, {len(results['failed'])} failed",
            'results': results
        }), 200 if len(results['failed']) == 0 else 207
        
    except Exception as e:
        logger.error(f"Error in decrease_from_sources: {str(e)}", exc_info=True)
        return jsonify({'error': str(e)}), 500

@stocks_batch_bp.route('/api/stocks/get-previous-patterns', methods=['GET'])
def get_previous_patterns():
    """
    Get previous batch patterns from the last few batches in each stock.
    Returns patterns grouped by stock to suggest cover/product combinations.
    """
    try:
        # Get last 10 batches
        query = """
        query GetPatterns {
          machineStockAssignmentList(orderBy: [{batch: DESC}], limit: 50) {
            batch
            stockLabel
            coverLabel
            productId
            units
            product {
              productName
            }
          }
        }
        """
        
        res = execute_graphql(query)
        assignments = res.get('machineStockAssignmentList', [])
        
        # Group by batch then stock
        patterns_by_batch = {}
        for assign in assignments:
            batch = assign.get('batch')
            stock = assign.get('stockLabel')
            cover = assign.get('coverLabel')
            product_id = assign.get('productId')
            units = assign.get('units')
            product_name = (assign.get('product') or {}).get('productName', '')
            
            key = f"{batch}-{stock}"
            if key not in patterns_by_batch:
                patterns_by_batch[key] = {
                    'batch': batch,
                    'stock': stock,
                    'covers': {}
                }
            
            if cover not in patterns_by_batch[key]['covers']:
                patterns_by_batch[key]['covers'][cover] = []
            
            patterns_by_batch[key]['covers'][cover].append({
                'product_id': product_id,
                'product_name': product_name,
                'units': units
            })
        
        # Return last 5 batches as patterns
        patterns = list(patterns_by_batch.values())[:5]
        
        return jsonify({'patterns': patterns}), 200
        
    except Exception as e:
        logger.error(f"Error in get_previous_patterns: {str(e)}")
        return jsonify({'patterns': []}), 200


@stocks_batch_bp.route('/api/stocks/get-batch-suggestions', methods=['GET'])
def get_batch_suggestions():
    """
    Get batch suggestions - all stock-cover-product combinations that exist
    with warehouse units available.
    """
    try:
        res = execute_graphql(GET_BATCH_SUGGESTIONS_QUERY)
        
        # Group assignments by stock-cover-product
        suggestions = {}
        
        for assign in res.get('machineStockAssignmentList', []):
            stock = assign.get('stockLabel')
            cover = assign.get('coverLabel')
            product_id = assign.get('productId')
            
            key = f"{stock}-{cover}-{product_id}"
            if key not in suggestions:
                suggestions[key] = {
                    'stock': stock,
                    'cover': cover,
                    'product_id': product_id,
                    'product_name': (assign.get('product') or {}).get('productName', ''),
                    'warehouse_units': 0
                }
        
        # Add warehouse units
        for wh in res.get('warehouseStocks', []):
            product_id = wh.get('productId')
            available = wh.get('availableUnits', 0)
            
            # Update any matching product suggestions
            for key, value in suggestions.items():
                if value['product_id'] == product_id:
                    value['warehouse_units'] = available
        
        return jsonify({'suggestions': suggestions}), 200
        
    except Exception as e:
        logger.error(f"Error in get_batch_suggestions: {str(e)}")
        return jsonify({'suggestions': {}}), 200

SUGGESTIONS_QUERY = """
query GetSuggestionsData($productId: String!) {
  warehouseStock(key: { productId: $productId }) {
    productId
    availableUnits
    unitsPerCase
    product {
      productName
    }
  }
  purchasedProductStockList(
    where: { 
      AND: [
        { productId: { eq: $productId } }
        { unitsAvailable: { gt: 0 } }
      ]
    }
  ) {
    id
    purchasedProductBatchId
    productId
    unitsAvailable
    unitsPerCase
    expiryDate
    product {
      productName
    }
  }
}
"""

@stocks_batch_bp.route('/api/stocks/get-suggestions-detailed', methods=['POST'])
def get_suggestions_detailed():
    """
    Get detailed suggestions for adding a product to a specific stock-cover.
    PRIMARY SOURCE: Warehouse stock (grouped by warehouse location, sorted by expiry date).
    REMOVED: Previous batches and purchased products - only warehouse stock now.
    """
    print(f"\n[ENDPOINT CALLED] get_suggestions_detailed")
    try:
        data = request.json
        product_id = str(data.get("product_id", "")).strip()
        
        print(f"[INPUT] product_id={product_id}")
        
        if not product_id:
            return jsonify({'error': 'product_id is required'}), 400
        
        # Get warehouse stock (PRIMARY SOURCE ONLY)
        # Returns all warehouses that have this product, sorted by expiry date (soonest first)
        warehouse_options = []
        error_msg = None
        
        try:
            print(f"[DEBUG] Fetching warehouse stock for product_id={product_id}")
            wh_res = execute_graphql(GET_WAREHOUSE_STOCK_QUERY, {'productId': product_id})
            warehouses = wh_res.get('warehouseStocks', [])
            
            print(f"[DEBUG] GET_WAREHOUSE_STOCK_QUERY returned: {len(warehouses)} items")
            if len(warehouses) == 0:
                print(f"[DEBUG] Full response: {wh_res}")
            
            # Group by warehouse, sort by expiry date
            warehouse_map = {}
            for wh in warehouses:
                units_avail = int(wh.get('availableUnits', 0))
                if units_avail <= 0:
                    print(f"[DEBUG]  Skipping {wh.get('stockId')} - availableUnits={units_avail}")
                    continue
                
                wh_id = wh.get('warehouseId', '')
                wh_location = (wh.get('warehouse') or {}).get('location', wh_id)
                wh_name = (wh.get('warehouse') or {}).get('name', 'Unknown')
                
                if wh_id not in warehouse_map:
                    warehouse_map[wh_id] = {
                        'warehouse_id': wh_id,
                        'warehouse_name': wh_name,
                        'warehouse_location': wh_location,
                        'product_id': wh.get('productId'),
                        'product_name': (wh.get('product') or {}).get('productName', ''),
                        'cases': []
                    }
                
                # Add this case/batch to warehouse options
                expiry_date = wh.get('expd', '9999-12-31')
                # Format timestamp to date string if needed
                if expiry_date and hasattr(expiry_date, 'isoformat'):
                    expiry_date = expiry_date.isoformat().split('T')[0]
                elif expiry_date and isinstance(expiry_date, str):
                    # If it's already a string, extract just the date part
                    expiry_date = expiry_date.split('T')[0] if 'T' in expiry_date else expiry_date
                else:
                    expiry_date = '9999-12-31'
                
                warehouse_map[wh_id]['cases'].append({
                    'case_id': wh.get('stockId'),
                    'case_label': wh.get('caseLabel', 'Unknown'),
                    'units_available': units_avail,
                    'units_per_case': wh.get('unitsPerCase', 1),
                    'expiry_date': expiry_date
                })
            
            # Convert to list and sort each warehouse's cases by expiry date (soonest first)
            for wh_id, wh_data in warehouse_map.items():
                # Sort cases by expiry date
                wh_data['cases'].sort(key=lambda c: c.get('expiry_date', '9999-12-31'))
                warehouse_options.append(wh_data)
            
            print(f"[DEBUG] Got {len(warehouse_options)} warehouses with product {product_id}")
            
        except Exception as e:
            print(f"[ERROR] Error fetching warehouse stock: {str(e)}")
            import traceback
            traceback.print_exc()
            error_msg = str(e)
            logger.error(f"Error fetching warehouse stock: {str(e)}")
        
        # Always return warehouse_options (empty list if no stock found)
        # Remove previous_batches entirely
        return jsonify({
            'success': True,
            'suggestions': {
                'warehouse_options': warehouse_options
            }
        }), 200
        
    except Exception as e:
        print(f"[ERROR] Exception in get_suggestions_detailed: {str(e)}")
        import traceback
        traceback.print_exc()
        logger.error(f"Error in get_suggestions_detailed: {str(e)}", exc_info=True)
        return jsonify({'error': str(e)}), 500


