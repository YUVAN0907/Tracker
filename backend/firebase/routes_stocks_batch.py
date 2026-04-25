from flask import Blueprint, request, jsonify
from datetime import datetime
from dataconnect_db import execute_graphql, format_timestamp
import logging

stocks_batch_bp = Blueprint('stocks_batch', __name__)
logger = logging.getLogger(__name__)

# ✅ REMOVED: INSERT_MACHINE_ASSIGNMENT - No longer using legacy MachineStockAssignment table
# ✅ REMOVED: UPDATE_ASSIGNMENT_STATUS - No longer using legacy MachineStockAssignment table

GET_MAX_BATCH_QUERY = """
query GetMaxBatch {
  batchAssignments(orderBy: [{batch: DESC}], limit: 1) {
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

# ✅ Get all batch suggestions (stock-cover-product combinations from normalized tables)
GET_BATCH_SUGGESTIONS_QUERY = """
query GetBatchSuggestions {
  batchAssignments(limit: 100, orderBy: [{batch: DESC}]) {
    batch
    assignedDate
    status
  }
  stockCoverAssignments(limit: 1000, orderBy: [{batch: DESC}]) {
    id
    batch
    stockLabel
    coverLabel
    machineId
    coverStatus
  }
  stockCoverProductAssignments(limit: 1000, orderBy: [{stockCoverAssignmentId: ASC}]) {
    id
    stockCoverAssignmentId
    productId
    units
    caseLabel
    status
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

# ✅ Get previous batches for a specific stock-cover-product from normalized tables
GET_PREVIOUS_BATCHES_QUERY = """
query GetPreviousBatches(
  $stockLabel: String!, 
  $coverLabel: String!, 
  $productId: String!,
  $maxBatch: Int
) {
  stockCoverAssignments(
    where: {
      _and: [
        { stockLabel: { eq: $stockLabel } }
        { coverLabel: { eq: $coverLabel } }
        { batch: { lt: $maxBatch } }
      ]
    }
    orderBy: [{batch: DESC}]
    limit: 20
  ) {
    id
    batch
    stockLabel
    coverLabel
    machineId
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
      _and: [
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

# Update purchased product stock units
UPDATE_PURCHASED_STOCK_UNITS_QUERY = """
mutation UpdatePurchasedStock($id: UUID!, $newUnits: Int!) {
  purchasedProductStock_update(key: { id: $id }, data: { unitsAvailable: $newUnits })
}
"""

# =============== NORMALIZED TABLE MUTATIONS ===============

# Insert into BatchAssignment (batch-level record)
# Note: batch is the key field in DataConnect, so we only query the key in response
INSERT_BATCH_ASSIGNMENT_MUTATION = """
mutation InsertBatchAssignment(
  $batch: Int!,
  $assignedDate: Timestamp!,
  $status: String!
) {
  batchAssignment_insert(data: {
    batch: $batch,
    assignedDate: $assignedDate,
    status: $status
  })
}
"""

# Insert into StockCoverAssignment (stock-cover combinations)
# Note: id is the key field, so we query it in response along with related fields
INSERT_STOCK_COVER_ASSIGNMENT_MUTATION = """
mutation InsertStockCoverAssignment(
  $batch: Int!,
  $machineId: String!,
  $stockLabel: String!,
  $coverLabel: String!,
  $coverStatus: String!
) {
  stockCoverAssignment_insert(data: {
    batch: $batch,
    machineId: $machineId,
    stockLabel: $stockLabel,
    coverLabel: $coverLabel,
    coverStatus: $coverStatus
  })
}
"""

# Insert into StockCoverProductAssignment (products within stock-covers)
# Note: id is the key field
INSERT_STOCK_COVER_PRODUCT_ASSIGNMENT_MUTATION = """
mutation InsertStockCoverProductAssignment(
  $stockCoverAssignmentId: UUID!,
  $productId: String!,
  $units: Int!,
  $caseLabel: String
) {
  stockCoverProductAssignment_insert(data: {
    stockCoverAssignmentId: $stockCoverAssignmentId,
    productId: $productId,
    units: $units,
    caseLabel: $caseLabel
  })
}
"""

# Query to get existing stock-cover assignment
GET_STOCK_COVER_ASSIGNMENT_QUERY = """
query GetStockCoverAssignment(
  $batch: Int!,
  $machineId: String!,
  $stockLabel: String!,
  $coverLabel: String!
) {
  stockCoverAssignments(
    where: {
      _and: [
        {batch: {eq: $batch}}
        {machineId: {eq: $machineId}}
        {stockLabel: {eq: $stockLabel}}
        {coverLabel: {eq: $coverLabel}}
      ]
    }
  ) {
    id
    batch
    machineId
    stockLabel
    coverLabel
    coverStatus
  }
}
"""

# Much of the existing batch creation logic involves mapping nested structures into the flat
# MachineStockAssignment Postgres table defined in the user's Data Connect schema.
@stocks_batch_bp.route('/api/stocks/create-batch-full', methods=['POST'])
def create_batch_full():
    """
    Create batch using NORMALIZED three-table structure:
    1. BatchAssignment (batch-level)
    2. StockCoverAssignment (stock-cover combinations per machine)
    3. StockCoverProductAssignment (products within stock-covers)
    
    Also writes to legacy MachineStockAssignment for backward compatibility.
    
    Also DECREASES warehouse stock automatically for selected cases.
    """
    data = request.json
    try:
        # Expected structure (now with 7 machines per batch):
        # {'batch_number': 1, 'created_date': '2026-03-05',
        #  'stocks': {'S1': {'machine': 'VM001', 'covers': {'C': [...products...], 'C2': [...]}},
        #            'S2': {'machine': 'VM002', 'covers': {'C': [...]}},
        #            ... for all 7 machines}}
        
        batch_number = int(data.get('batch_number', 0))
        created_date = data.get('created_date', datetime.now().isoformat().split('T')[0])
        stocks_dict = data.get('stocks', {})
        sources = data.get('sources', [])  # ✅ NEW: Get pending sources for warehouse deduction
        
        if not batch_number:
            return jsonify({'error': 'batch_number is required and must be > 0'}), 400
        
        if not stocks_dict:
            return jsonify({'error': 'stocks data is required'}), 400
        
        assigned_date = format_timestamp(datetime.strptime(created_date, '%Y-%m-%d'))
        
        # Track what we're creating for logging
        created_records = []
        product_usage = {}
        stock_cover_cache = {}  # Cache to avoid duplicate StockCoverAssignment creation
        warehouse_decreases = []  # Track warehouse decreases to apply after batch creation
        
        # ✅ STEP 1: Create BatchAssignment (one entry per batch)
        logger.info(f"📦 Creating BatchAssignment: Batch {batch_number}, Date {created_date}, Status Active")
        batch_result = execute_graphql(INSERT_BATCH_ASSIGNMENT_MUTATION, {
            "batch": batch_number,
            "assignedDate": assigned_date,
            "status": "Active"
        })
        
        if 'errors' in batch_result:
            logger.error(f"❌ Failed to create BatchAssignment: {batch_result['errors']}")
            return jsonify({'error': 'Failed to create batch assignment'}), 500
        
        logger.info(f"✅ Created BatchAssignment: Batch {batch_number}")
        
        # ✅ STEP 2 & 3: Process each stock-cover-product assignment
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
                
                # ✅ STEP 2: Create StockCoverAssignment (if not already cached)
                stock_cover_key = f"{batch_number}_{machine_id}_{stock_label}_{cover_label}"
                stock_cover_id = None
                
                if stock_cover_key not in stock_cover_cache:
                    logger.info(f"  📍 Creating StockCoverAssignment: {stock_cover_key}")
                    sca_result = execute_graphql(INSERT_STOCK_COVER_ASSIGNMENT_MUTATION, {
                        "batch": batch_number,
                        "machineId": machine_id,
                        "stockLabel": stock_label,
                        "coverLabel": cover_label,
                        "coverStatus": cover_status
                    })
                    
                    if 'errors' in sca_result:
                        logger.error(f"    ❌ Failed to create StockCoverAssignment: {sca_result['errors']}")
                        continue
                    else:
                        # Query for the created StockCoverAssignment to get its ID
                        get_sca = execute_graphql(GET_STOCK_COVER_ASSIGNMENT_QUERY, {
                            "batch": batch_number,
                            "machineId": machine_id,
                            "stockLabel": stock_label,
                            "coverLabel": cover_label
                        })
                        
                        if 'errors' in get_sca:
                            logger.error(f"    ❌ Failed to retrieve StockCoverAssignment ID: {get_sca['errors']}")
                            continue
                        
                        scas = get_sca.get('stockCoverAssignments', [])
                        if scas and len(scas) > 0:
                            stock_cover_id = scas[0].get('id')
                            stock_cover_cache[stock_cover_key] = stock_cover_id
                            logger.info(f"    ✅ Created StockCoverAssignment: ID {stock_cover_id}")
                        else:
                            logger.error(f"    ❌ Could not find created StockCoverAssignment")
                            continue
                else:
                    stock_cover_id = stock_cover_cache[stock_cover_key]
                    logger.info(f"  📍 Using cached StockCoverAssignment: {stock_cover_key}")
                
                # ✅ STEP 3: Create StockCoverProductAssignment for each product
                # Iterate over products in this cover
                for product in products:
                    product_id = str(product.get("product_id", product.get("productId", ""))).strip()
                    units = int(product.get("units", 0))
                    case_label = str(product.get("caseLabel", product.get("case_label", ""))).strip()
                    
                    if not product_id or units <= 0:
                        continue
                    
                    # Track product usage for source tracking
                    product_usage[product_id] = product_usage.get(product_id, 0) + units
                    
                    # Insert into StockCoverProductAssignment
                    logger.info(f"    📦 Creating StockCoverProductAssignment: Product {product_id}, Units {units}")
                    scpa_result = execute_graphql(INSERT_STOCK_COVER_PRODUCT_ASSIGNMENT_MUTATION, {
                        "stockCoverAssignmentId": stock_cover_id,
                        "productId": product_id,
                        "units": units,
                        "caseLabel": case_label if case_label else None
                    })
                    
                    if 'errors' in scpa_result:
                        logger.error(f"      ❌ GraphQL error: {scpa_result['errors']}")
                        continue
                    
                    # ✅ ONLY normalized tables - no legacy MachineStockAssignment
                    created_records.append({
                        'batch': batch_number,
                        'machine': machine_id,
                        'stock': stock_label,
                        'cover': cover_label,
                        'product': product_id,
                        'units': units,
                        'caseLabel': case_label if case_label else None,
                        'stock_cover_assignment_id': stock_cover_id,
                        'status': 'success'
                    })
                    logger.info(
                        f"      ✅ Created StockCoverProductAssignment: {product_id} ({units} units)"
                    )
        
        # ✅ STEP 4: Automatically DECREASE units from selected sources
        # This prevents inconsistency - units must be deducted when batch is created
        source_decrease_results = {'processed': [], 'failed': []}
        if sources and len(sources) > 0:
            logger.info(f"📉 Processing {len(sources)} sources for unit deduction...")
            print(f"[DEBUG] Processing {len(sources)} sources")
            source_decrease_results = apply_warehouse_sources(sources)
            if not source_decrease_results['success']:
                logger.warning(f"⚠️  Some source decreases failed: {source_decrease_results['failed']}")
                print(f"[WARNING] Failed source decreases: {source_decrease_results['failed']}")
            logger.info(f"✅ Source deductions complete: {len(source_decrease_results['processed'])} processed, {len(source_decrease_results['failed'])} failed")
            print(f"[DEBUG] Source deductions: {len(source_decrease_results['processed'])} processed, {len(source_decrease_results['failed'])} failed")
        
        # Prepare response
        response = {
            'success': True,
            'message': f'Batch {batch_number} created successfully with normalized three-table structure',
            'batch_number': batch_number,
            'total_created': len(created_records),
            'created_records': created_records,
            'source_decreases': source_decrease_results,  # ✅ NEW: Include source decrease info
            'storage': {
                'batchAssignment': 'Created',
                'stockCoverAssignments': len(stock_cover_cache),
                'stockCoverProductAssignments': len(created_records)
            }
        }
        
        return jsonify(response), 200
        
    except Exception as e:
        logger.error(f"Error in create_batch_full: {str(e)}", exc_info=True)
        return jsonify({'error': str(e)}), 500


def apply_warehouse_sources(sources):
    """
    ✅ UPDATED: Helper function to decrease units from ANY source type:
    - warehouse: Decrease from WarehouseStock
    - previous_batch: Decrease from StockCoverProductAssignment of previous batches

    Called automatically during batch creation to prevent inconsistency.
    """
    results = {'processed': [], 'failed': []}

    for source in sources:
        try:
            source_type = source.get('type')

            if source_type == 'previous_batch':
                print(f"[DEBUG] Processing PREVIOUS BATCH source: {source}")
                # ✅ Decrease from normalized StockCoverProductAssignment
                batch_num = source.get('batch_number')
                stock_label = source.get('stock_name')
                cover_label = source.get('cover_name')
                product_id = source.get('product_id')
                units_to_decrease = int(source.get('units', 0))

                if not all([batch_num, stock_label, cover_label, product_id, units_to_decrease > 0]):
                    raise ValueError(f"Missing required fields for previous_batch source: batch_num={batch_num}, stock={stock_label}, cover={cover_label}, product={product_id}, units={units_to_decrease}")

                # Step 1: Get the StockCoverAssignment
                sca_query = """
                query GetStockCover($batch: Int!, $stockLabel: String!, $coverLabel: String!) {
                  stockCoverAssignments(where: {
                    _and: [
                      {batch: {eq: $batch}}
                      {stockLabel: {eq: $stockLabel}}
                      {coverLabel: {eq: $coverLabel}}
                    ]
                  }) {
                    id
                  }
                }
                """

                print(f"[DEBUG] Querying SCA for batch={batch_num}, stock={stock_label}, cover={cover_label}")
                sca_res = execute_graphql(sca_query, {
                    'batch': batch_num,
                    'stockLabel': stock_label,
                    'coverLabel': cover_label
                })

                if 'errors' in sca_res:
                    raise ValueError(f"GraphQL error getting SCA: {sca_res['errors']}")

                stock_covers = sca_res.get('stockCoverAssignments', [])
                print(f"[DEBUG] Found {len(stock_covers)} stock-cover assignments")

                if not stock_covers:
                    raise ValueError(f"Stock-cover assignment not found: Batch {batch_num}, Stock {stock_label}, Cover {cover_label}")

                sca_id = stock_covers[0].get('id')
                print(f"[DEBUG] Using SCA ID: {sca_id}")

                # Step 2: Get the StockCoverProductAssignment
                scpa_query = """
                query GetProduct($scaId: UUID!, $productId: String!) {
                  stockCoverProductAssignments(where: {
                    _and: [
                      {stockCoverAssignmentId: {eq: $scaId}}
                      {productId: {eq: $productId}}
                    ]
                  }) {
                    id
                    units
                  }
                }
                """

                print(f"[DEBUG] Querying SCPA for sca_id={sca_id}, product={product_id}")
                scpa_res = execute_graphql(scpa_query, {
                    'scaId': sca_id,
                    'productId': product_id
                })

                if 'errors' in scpa_res:
                    raise ValueError(f"GraphQL error getting SCPA: {scpa_res['errors']}")

                products = scpa_res.get('stockCoverProductAssignments', [])
                print(f"[DEBUG] Found {len(products)} products in SCPA")

                if not products:
                    raise ValueError(f"Product {product_id} not found in batch {batch_num} stock {stock_label} cover {cover_label}")

                product = products[0]
                current_units = int(product.get('units', 0))
                new_units = max(0, current_units - units_to_decrease)

                print(f"[DEBUG] Current units: {current_units}, Decreasing by: {units_to_decrease}, New units: {new_units}")

                # Step 3: Update the StockCoverProductAssignment
                update_query = """
                mutation UpdateProduct($id: UUID!, $newUnits: Int!) {
                  stockCoverProductAssignment_update(key: {id: $id}, data: {units: $newUnits})
                }
                """

                execute_graphql(update_query, {
                    'id': product.get('id'),
                    'newUnits': new_units
                })

                results['processed'].append({
                    'type': 'previous_batch',
                    'batch': batch_num,
                    'stock': stock_label,
                    'cover': cover_label,
                    'product': product_id,
                    'decreased': units_to_decrease,
                    'remaining': new_units,
                    'status': 'success'
                })
                logger.info(f"✅ Decreased {units_to_decrease} units from Batch {batch_num}-{stock_label}-{cover_label}-{product_id}, remaining: {new_units}")
                print(f"[SUCCESS] Decreased {units_to_decrease} units from previous batch {batch_num}")

            elif source_type == 'warehouse':
                print(f"[DEBUG] Processing WAREHOUSE source: {source}")
                product_id = source.get('product_id')
                case_id = source.get('case_id') or source.get('caseId')
                case_label = source.get('case_label') or source.get('caseLabel')
                units_to_decrease = int(source.get('units', 0))

                if not product_id or units_to_decrease <= 0:
                    raise ValueError(f"Missing required fields for warehouse source")

                warehouse = None
                target_case_id = case_id

                if case_id:
                    print(f"[DEBUG] Using case_id={case_id} for targeted warehouse decrease")
                    logger.info(f"💡 Using case_id={case_id} for targeted warehouse decrease")
                    case_query = """
                    query GetCase($caseId: UUID!) {
                      warehouseStock(key: { stockId: $caseId }) {
                        stockId
                        caseLabel
                        availableUnits
                        productId
                      }
                    }
                    """
                    case_res = execute_graphql(case_query, {'caseId': case_id})
                    warehouse = case_res.get('warehouseStock')

                    if not warehouse:
                        logger.warning(f"⚠️ Warehouse case {case_id} not found")
                        if not case_label:
                            raise ValueError(f"Warehouse case {case_id} not found and no case_label provided")
                        target_case_id = None
                    else:
                        current_units = int(warehouse.get('availableUnits', 0))
                        new_units = max(0, current_units - units_to_decrease)
                        warehouse_case_label = warehouse.get('caseLabel')

                        print(f"[DEBUG] Warehouse case {case_id}: {current_units} → {new_units} units")

                        update_warehouse_query = """
                        mutation UpdateCase($caseId: UUID!, $newUnits: Int!) {
                          warehouseStock_update(key: { stockId: $caseId }, data: { availableUnits: $newUnits })
                        }
                        """
                        execute_graphql(update_warehouse_query, {'caseId': case_id, 'newUnits': new_units})
                        logger.info(f"✅ Updated WarehouseStock {case_id}: {current_units} → {new_units} units")

                        results['processed'].append({
                            'type': 'warehouse',
                            'product': product_id,
                            'case_id': case_id,
                            'case_label': warehouse_case_label,
                            'decreased': units_to_decrease,
                            'warehouse_remaining': new_units,
                            'status': 'success'
                        })
                        logger.info(f"✅ Decreased {units_to_decrease} units from Warehouse Case {case_id}")
                        print(f"[SUCCESS] Decreased {units_to_decrease} units from warehouse case {case_id}")
                        continue

                if not warehouse and case_label:
                    logger.info(f"💡 Falling back to case_label={case_label} for warehouse decrease")
                    case_label_query = """
                    query GetCaseByLabel($caseLabel: String!) {
                      warehouseStocks(where: { caseLabel: { eq: $caseLabel } }, limit: 1) {
                        stockId
                        caseLabel
                        availableUnits
                        productId
                      }
                    }
                    """
                    case_res = execute_graphql(case_label_query, {'caseLabel': case_label})
                    warehouse_list = case_res.get('warehouseStocks', [])
                    if warehouse_list:
                        warehouse = warehouse_list[0]
                        target_case_id = warehouse.get('stockId')
                        logger.info(f"💡 Found warehouse case by label: {target_case_id}")
                    elif case_id:
                        raise ValueError(f"Warehouse case not found for case_id={case_id} and case_label={case_label}")

                if not warehouse:
                    logger.info(f"⚠️ No targeted warehouse case available, querying by product_id={product_id}")
                    wh_res = execute_graphql(GET_WAREHOUSE_STOCK_QUERY, {'productId': product_id})
                    warehouse_list = wh_res.get('warehouseStocks', [])

                    if not warehouse_list:
                        raise ValueError(f"Warehouse not found for product {product_id}")

                    warehouse = warehouse_list[0]
                    target_case_id = warehouse.get('stockId')
                    current_units = int(warehouse.get('availableUnits', 0))
                    new_units = max(0, current_units - units_to_decrease)

                    execute_graphql(UPDATE_WAREHOUSE_STOCK_AFTER_BATCH, {
                        'productId': product_id,
                        'newUnits': new_units
                    })

                    results['processed'].append({
                        'type': 'warehouse',
                        'product': product_id,
                        'case_id': target_case_id,
                        'case_label': warehouse.get('caseLabel'),
                        'decreased': units_to_decrease,
                        'remaining': new_units,
                        'status': 'success'
                    })
                    logger.info(f"✅ Decreased {units_to_decrease} units from Warehouse for product {product_id}, remaining: {new_units}")

            else:
                raise ValueError(f"Unknown source type: {source_type}")

        except Exception as e:
            logger.error(f"❌ Error processing source {source_type}: {str(e)}")
            results['failed'].append({
                'source_type': source_type,
                'source': source,
                'error': str(e)
            })

    results['success'] = len(results['failed']) == 0
    return results


@stocks_batch_bp.route('/api/stocks/update-status', methods=['POST'])
def update_stock_status():
    """
    Update batch status in normalized BatchAssignment table.
    ✅ Updated to use normalized three-table structure
    """
    data = request.json
    try:
        batch_number = int(data.get('batch', 0))
        new_status = str(data.get('status', '')).strip()

        if not batch_number or batch_number <= 0:
            return jsonify({'error': 'batch is required and must be > 0'}), 400
        
        if not new_status:
            return jsonify({'error': 'status is required'}), 400

        # Update BatchAssignment status
        update_query = """
        mutation UpdateBatchStatus($batch: Int!, $newStatus: String!) {
          batchAssignment_update(key: {batch: $batch}, data: {status: $newStatus})
        }
        """
        
        execute_graphql(update_query, {
            'batch': batch_number,
            'newStatus': new_status
        })

        return jsonify({'message': f'Batch {batch_number} status updated to {new_status}'})

    except Exception as e:
        logger.error(f"Error in update_stock_status: {str(e)}")
        return jsonify({'error': str(e)}), 500

@stocks_batch_bp.route('/api/stocks/decrease-from-sources', methods=['POST'])
def decrease_from_sources():
    """
    Decrease units from various sources after batch creation.
    ✅ Updated to use normalized three-table structure for all sources
    Handles three types of sources:
    1. previous_batch: Decrease from StockCoverProductAssignment (existing batches)
    2. warehouse: Decrease from WarehouseStock
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
                    # ✅ Decrease from normalized StockCoverProductAssignment
                    batch_num = source.get('batch_number')
                    stock_label = source.get('stock_name')
                    cover_label = source.get('cover_name')
                    product_id = source.get('product_id')
                    units_to_decrease = int(source.get('units', 0))
                    
                    if not all([batch_num, stock_label, cover_label, product_id, units_to_decrease > 0]):
                        raise ValueError(f"Missing required fields for previous_batch source")
                    
                    # Step 1: Get the StockCoverAssignment
                    sca_query = """
                    query GetStockCover($batch: Int!, $stockLabel: String!, $coverLabel: String!) {
                      stockCoverAssignments(where: {
                        _and: [
                          {batch: {eq: $batch}}
                          {stockLabel: {eq: $stockLabel}}
                          {coverLabel: {eq: $coverLabel}}
                        ]
                      }) {
                        id
                      }
                    }
                    """
                    
                    sca_res = execute_graphql(sca_query, {
                        'batch': batch_num,
                        'stockLabel': stock_label,
                        'coverLabel': cover_label
                    })
                    stock_covers = sca_res.get('stockCoverAssignments', [])
                    
                    if not stock_covers:
                        raise ValueError(f"Stock-cover assignment not found: Batch {batch_num}, Stock {stock_label}, Cover {cover_label}")
                    
                    sca_id = stock_covers[0].get('id')
                    
                    # Step 2: Get the StockCoverProductAssignment
                    scpa_query = """
                    query GetProduct($scaId: UUID!, $productId: String!) {
                      stockCoverProductAssignments(where: {
                        _and: [
                          {stockCoverAssignmentId: {eq: $scaId}}
                          {productId: {eq: $productId}}
                        ]
                      }) {
                        id
                        units
                      }
                    }
                    """
                    
                    scpa_res = execute_graphql(scpa_query, {
                        'scaId': sca_id,
                        'productId': product_id
                    })
                    products = scpa_res.get('stockCoverProductAssignments', [])
                    
                    if not products:
                        raise ValueError(f"Product not found in batch: Batch {batch_num}, Stock {stock_label}, Product {product_id}")
                    
                    product = products[0]
                    current_units = int(product.get('units', 0))
                    new_units = max(0, current_units - units_to_decrease)
                    
                    # Step 3: Update the StockCoverProductAssignment
                    update_query = """
                    mutation UpdateProduct($id: UUID!, $newUnits: Int!) {
                      stockCoverProductAssignment_update(key: {id: $id}, data: {units: $newUnits})
                    }
                    """
                    
                    execute_graphql(update_query, {
                        'id': product.get('id'),
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
                    case_id = source.get('case_id') or source.get('caseId')
                    case_label = source.get('case_label') or source.get('caseLabel')
                    units_to_decrease = int(source.get('units', 0))
                    
                    if not product_id or units_to_decrease <= 0:
                        raise ValueError(f"Missing required fields for warehouse source")
                    
                    warehouse = None
                    target_case_id = case_id
                    
                    if case_id:
                        logger.info(f"💡 Using case_id={case_id} for targeted warehouse decrease")
                        case_query = """
                        query GetCase($caseId: UUID!) {
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
                            logger.warning(f"⚠️ Warehouse case {case_id} not found")
                            if not case_label:
                                raise ValueError(f"Warehouse case {case_id} not found and no case_label provided")
                            target_case_id = None
                        else:
                            current_units = int(warehouse.get('availableUnits', 0))
                            new_units = max(0, current_units - units_to_decrease)
                            
                            update_query = """
                            mutation UpdateCase($caseId: UUID!, $newUnits: Int!) {
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
                    
                    if not warehouse and case_label:
                        logger.info(f"💡 Falling back to case_label={case_label} for warehouse decrease")
                        case_label_query = """
                        query GetCaseByLabel($caseLabel: String!) {
                          warehouseStocks(where: { caseLabel: { eq: $caseLabel } }, limit: 1) {
                            stockId
                            availableUnits
                            productId
                          }
                        }
                        """
                        case_res = execute_graphql(case_label_query, {'caseLabel': case_label})
                        warehouse_list = case_res.get('warehouseStocks', [])
                        if warehouse_list:
                            warehouse = warehouse_list[0]
                            target_case_id = warehouse.get('stockId')
                        elif case_id:
                            raise ValueError(f"Warehouse case not found for case_id={case_id} and case_label={case_label}")
                    
                    if not warehouse:
                        logger.info(f"⚠️ No targeted warehouse case available, querying by product_id={product_id}")
                        wh_res = execute_graphql(GET_WAREHOUSE_STOCK_QUERY, {'productId': product_id})
                        warehouse_list = wh_res.get('warehouseStocks', [])
                        
                        if not warehouse_list:
                            raise ValueError(f"Warehouse not found for product {product_id}")
                        
                        warehouse = warehouse_list[0]
                        target_case_id = warehouse.get('stockId')
                        current_units = int(warehouse.get('availableUnits', 0))
                        new_units = max(0, current_units - units_to_decrease)
                        
                        execute_graphql(UPDATE_WAREHOUSE_STOCK_AFTER_BATCH, {
                            'productId': product_id,
                            'newUnits': new_units
                        })
                        
                        results['processed'].append({
                            'type': 'warehouse',
                            'product': product_id,
                            'case_id': target_case_id,
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
                        _and: [
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
    Uses normalized three-table structure.
    """
    try:
        # Get last 10 batches from normalized tables
        query = """
        query GetPatterns {
          batchAssignments(orderBy: [{batch: DESC}], limit: 10) {
            batch
            assignedDate
            status
          }
        }
        """
        
        res = execute_graphql(query)
        batches = res.get('batchAssignments', [])
        
        # Group by batch then stock
        patterns_by_batch = {}
        for batch_record in batches:
            batch = batch_record.get('batch')
            
            # Get stock-cover assignments for this batch
            sca_query = """
            query GetStockCovers($batch: Int!) {
              stockCoverAssignments(
                where: {batch: {eq: $batch}}
                orderBy: [{stockLabel: ASC}, {coverLabel: ASC}]
              ) {
                id
                batch
                stockLabel
                coverLabel
                machineId
              }
            }
            """
            
            sca_res = execute_graphql(sca_query, {'batch': batch})
            stock_covers = sca_res.get('stockCoverAssignments', [])
            
            for sca in stock_covers:
                stock = sca.get('stockLabel')
                cover = sca.get('coverLabel')
                sca_id = sca.get('id')
                
                key = f"{batch}-{stock}"
                if key not in patterns_by_batch:
                    patterns_by_batch[key] = {
                        'batch': batch,
                        'stock': stock,
                        'covers': {}
                    }
                
                if cover not in patterns_by_batch[key]['covers']:
                    patterns_by_batch[key]['covers'][cover] = []
                
                # Get products in this stock-cover
                product_query = """
                query GetProducts($scaId: UUID!) {
                  stockCoverProductAssignments(
                    where: {stockCoverAssignmentId: {eq: $scaId}}
                  ) {
                    productId
                    units
                    product {
                      productName
                    }
                  }
                }
                """
                
                product_res = execute_graphql(product_query, {'scaId': sca_id})
                products = product_res.get('stockCoverProductAssignments', [])
                
                for product in products:
                    product_name = (product.get('product') or {}).get('productName', '')
                    patterns_by_batch[key]['covers'][cover].append({
                        'product_id': product.get('productId'),
                        'product_name': product_name,
                        'units': product.get('units')
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
    with warehouse units available. Uses normalized three-table structure.
    """
    try:
        # Get all stock-cover assignments
        sca_query = """
        query GetStockCovers {
          stockCoverAssignments(orderBy: [{batch: DESC}], limit: 1000) {
            id
            batch
            stockLabel
            coverLabel
          }
        }
        """
        
        sca_res = execute_graphql(sca_query)
        stock_covers = sca_res.get('stockCoverAssignments', [])
        # Group assignments by stock-cover-product
        suggestions = {}
        
        for sca in stock_covers:
            sca_id = sca.get('id')
            stock = sca.get('stockLabel')
            cover = sca.get('coverLabel')
            
            # Get products in this stock-cover
            product_query = """
            query GetProducts($scaId: UUID!) {
              stockCoverProductAssignments(
                where: {stockCoverAssignmentId: {eq: $scaId}}
              ) {
                productId
                units
                product {
                  productName
                }
              }
            }
            """
            
            product_res = execute_graphql(product_query, {'scaId': sca_id})
            products = product_res.get('stockCoverProductAssignments', [])
            
            for product in products:
                product_id = product.get('productId')
                product_name = (product.get('product') or {}).get('productName', '')
                
                key = f"{stock}-{cover}-{product_id}"
                if key not in suggestions:
                    suggestions[key] = {
                        'stock': stock,
                        'cover': cover,
                        'product_id': product_id,
                        'product_name': product_name,
                        'warehouse_units': 0
                    }
        
        # Add warehouse units
        wh_query = """
        query GetWarehouses {
          warehouseStocks(where: { availableUnits: { gt: 0 }}, limit: 1000) {
            productId
            availableUnits
            product {
              productName
            }
          }
        }
        """
        
        wh_res = execute_graphql(wh_query)
        warehouses = wh_res.get('warehouseStocks', [])
        
        for wh in warehouses:
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
      _and: [
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


@stocks_batch_bp.route('/api/stocks/get-previous-batch-suggestions', methods=['POST'])
def get_previous_batch_suggestions():
    """
    Get suggestions from previous batches based on Stock-Cover-Product combination.
    Filters batches by even/odd grouping:
    - Odd current batch (1, 3, 5...) → suggests from odd batches only
    - Even current batch (2, 4, 6...) → suggests from even batches only
    
    Returns available units from previous batches with the same Stock-Cover-Product.
    """
    print(f"\n[ENDPOINT CALLED] get_previous_batch_suggestions - START")
    try:
        data = request.json
        stock_name = str(data.get("stock_name", "")).strip()
        cover_name = str(data.get("cover_name", "")).strip()
        product_id = str(data.get("product_id", "")).strip()
        current_batch_number = int(data.get("current_batch_number", 0))
        
        print(f"[INPUT] stock={stock_name}, cover={cover_name}, product={product_id}, current_batch={current_batch_number}")
        
        if not stock_name or not cover_name or not product_id or current_batch_number <= 0:
            return jsonify({'error': 'stock_name, cover_name, product_id, and current_batch_number (> 0) are required'}), 400
        
        # Determine if current batch is odd or even
        is_current_odd = current_batch_number % 2 == 1
        
        print(f"[DEBUG] Current batch {current_batch_number} is {'ODD' if is_current_odd else 'EVEN'}")
        
        # Get all stock-cover assignments for this stock-cover combination
        query = """
        query GetPreviousBatchesForStockCover(
          $stockLabel: String!,
          $coverLabel: String!,
          $maxBatch: Int!
        ) {
          stockCoverAssignments(
            where: {
              _and: [
                { stockLabel: { eq: $stockLabel } }
                { coverLabel: { eq: $coverLabel } }
                { batch: { lt: $maxBatch } }
              ]
            }
            orderBy: [{batch: DESC}]
            limit: 100
          ) {
            id
            batch
            stockLabel
            coverLabel
            machineId
            coverStatus
          }
        }
        """
        
        print(f"[DEBUG] Executing GraphQL query for stock={stock_name}, cover={cover_name}, maxBatch={current_batch_number}")
        res = execute_graphql(query, {
            'stockLabel': stock_name,
            'coverLabel': cover_name,
            'maxBatch': current_batch_number
        })
        
        print(f"[DEBUG] GraphQL response: {res}")
        
        stock_covers = res.get('stockCoverAssignments', [])
        print(f"[DEBUG] Found {len(stock_covers)} stock-cover assignments for {stock_name}-{cover_name}")
        
        if 'errors' in res:
            print(f"[ERROR] GraphQL errors in stockCoverAssignments query: {res['errors']}")
        
        if len(stock_covers) == 0:
            print(f"[DEBUG] No stock-cover assignments found. Full response: {res}")
            # Let's try a simpler query to see if the table has any data
            test_query = """
            query TestStockCoverAssignments {
              stockCoverAssignments(limit: 10) {
                id
                batch
                stockLabel
                coverLabel
                machineId
                coverStatus
              }
            }
            """
            test_res = execute_graphql(test_query)
            print(f"[DEBUG] Test query result: {test_res}")
            
            # Also try to find any S1-C combinations
            s1c_query = """
            query FindS1C {
              stockCoverAssignments(
                where: {
                  _and: [
                    { stockLabel: { eq: "S1" } }
                    { coverLabel: { eq: "C" } }
                  ]
                }
                limit: 10
              ) {
                id
                batch
                stockLabel
                coverLabel
                machineId
                coverStatus
              }
            }
            """
            s1c_res = execute_graphql(s1c_query)
            print(f"[DEBUG] S1-C query result: {s1c_res}")
        
        previous_batches = []
        
        for sca in stock_covers:
            sca_id = sca.get('id')
            batch_num = sca.get('batch')
            machine_id = sca.get('machineId')
            
            print(f"[DEBUG] Processing batch {batch_num}, SCA ID: {sca_id}, Machine: {machine_id}")
            
            # Filter by even/odd grouping (batch < current_batch is already filtered in GraphQL)
            is_batch_odd = batch_num % 2 == 1
            
            # Only include batches from same group
            if is_current_odd != is_batch_odd:
                print(f"  Skipping batch {batch_num} - different group (current is {'ODD' if is_current_odd else 'EVEN'}, batch is {'ODD' if is_batch_odd else 'EVEN'})")
                continue

            print(f"  Including batch {batch_num} (same group, earlier)")
            # Get products in this stock-cover
            product_query = """
            query GetProducts($scaId: UUID!) {
              stockCoverProductAssignments(
                where: {stockCoverAssignmentId: {eq: $scaId}}
              ) {
                productId
                units
                caseLabel
                product {
                  productName
                }
              }
            }
            """
            
            print(f"[DEBUG] Querying products for SCA ID: {sca_id}")
            product_res = execute_graphql(product_query, {'scaId': sca_id})
            
            if 'errors' in product_res:
                print(f"[ERROR] GraphQL errors in stockCoverProductAssignments query: {product_res['errors']}")
                continue
            
            products = product_res.get('stockCoverProductAssignments', [])
            print(f"[DEBUG] Found {len(products)} products in SCA {sca_id}")
            
            if len(products) == 0:
                print(f"[DEBUG] Full product response: {product_res}")
            
            # Find the specific product we're looking for
            for product in products:
                prod_id = product.get('productId')
                print(f"[DEBUG] Comparing product ID '{prod_id}' with requested '{product_id}' (match: {prod_id == product_id})")
                
                if prod_id == product_id:
                    units = product.get('units', 0)
                    case_label = product.get('caseLabel', '')
                    product_name = (product.get('product') or {}).get('productName', '')
                    
                    print(f"[DEBUG] Found matching product! Units: {units}, Case: {case_label}")
                    
                    if units > 0:
                        previous_batches.append({
                            'batch_number': batch_num,
                            'stock_name': stock_name,
                            'cover_name': cover_name,
                            'product_id': product_id,
                            'product_name': product_name,
                            'units_available': units,
                            'case_label': case_label or 'Not tracked',
                            'batch_group': 'ODD' if is_batch_odd else 'EVEN'
                        })
                        print(f"    Product {product_id}: {units} units (case: {case_label or 'N/A'})")
        
        print(f"[DEBUG] Found {len(previous_batches)} previous batches with this product")
        print(f"[DEBUG] Returning: {previous_batches}")
        
        return jsonify({
            'success': True,
            'TEST_DEBUG': 'This should appear in response',
            'debug': {
                'stock_covers_found': len(stock_covers),
                'graphql_response': res
            },
            'suggestions': {
                'previous_batches': previous_batches
            }
        }), 200
        
    except Exception as e:
        print(f"[ERROR] Exception in get_previous_batch_suggestions: {str(e)}")
        import traceback
        traceback.print_exc()
        logger.error(f"Error in get_previous_batch_suggestions: {str(e)}", exc_info=True)
        return jsonify({'error': str(e), 'EXCEPTION_OCCURRED': True}), 500


