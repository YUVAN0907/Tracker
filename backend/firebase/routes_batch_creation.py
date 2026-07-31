"""
Batch Creation Routes
Endpoints for batch creation and normalization
Uses normalized three-table structure: BatchAssignment -> StockCoverAssignment -> StockCoverProductAssignment
"""

from flask import Blueprint, request, jsonify
from datetime import datetime
from dataconnect_db import execute_graphql, format_timestamp
import logging
import uuid
import json

from qr_utils import create_batch_qr_history

batch_creation_bp = Blueprint('batch_creation', __name__)
logger = logging.getLogger(__name__)

# ==============================
# NORMALIZED MUTATIONS
# ==============================

# Insert into batch_assignment (creates or updates the batch)
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

# Insert into stock_cover_assignment (creates a stock-cover combination)
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

# Insert into stock_cover_product_assignment (creates a product in a stock-cover)
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

# Mutation to create QR code history record (used to automatically record QR sets for a batch)
CREATE_QR_HISTORY_MUTATION = """
mutation CreateQrCodeHistory($qrId: UUID!, $batchDateKey: String!, $machineIds: [String!]!, $qrData: String!, $notes: String, $createdAt: Timestamp!, $updatedAt: Timestamp!) {
    qrCodeHistory_insert(data: {
        qrId: $qrId,
        batchDateKey: $batchDateKey,
        machineIds: $machineIds,
        qrData: $qrData,
        notes: $notes,
        createdAt: $createdAt,
        updatedAt: $updatedAt
    })
}
"""

# Removed: PurchasedProductCase queries - now using WarehouseStock directly


# Query to get or create batch assignment
GET_BATCH_ASSIGNMENT_QUERY = """
query GetBatchAssignment($batch: Int!) {
  batchAssignment(key: {batch: $batch}) {
    batch
    assignedDate
    status
  }
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


@batch_creation_bp.route('/api/batch-assignment/normalize', methods=['POST'])
def normalize_batch_assignment():
    """
    Normalize hierarchical batch_assignment structure into normalized three-table structure:
    - BatchAssignment (batch-level)
    - StockCoverAssignment (stock-cover combinations)
    - StockCoverProductAssignment (products within stock-covers)
    
    Also decrements availableUnits in WarehouseStock table when products are assigned.
    
    Expected input format:
    {
      "batch": 1,
      "assignedDate": "2026-04-21",
      "status": "Active",
      "stock_cover_assignments": [
        {
          "machine": "VM001",
          "stock": "S1",
          "cover": "C",
          "coverStatus": "covered",
          "products": [
            {"productId": "RUBY002", "units": 6, "caseLabel": "ABC123"},
            {"productId": "HERS006", "units": 6, "caseLabel": "XYZ789"}
          ]
        },
        ...
      ]
    }
    """
    try:
        data = request.json
        
        # Validate required fields
        batch_number = data.get('batch')
        assigned_date = data.get('assignedDate')
        batch_status = data.get('status', 'Active')
        stock_cover_assignments = data.get('stock_cover_assignments', [])
        
        if not batch_number or batch_number <= 0:
            return jsonify({'error': 'batch number is required and must be > 0'}), 400
        
        if not assigned_date:
            return jsonify({'error': 'assignedDate is required (format: YYYY-MM-DD)'}), 400
        
        if not stock_cover_assignments:
            return jsonify({'error': 'stock_cover_assignments is required and must be non-empty'}), 400
        
        # Format timestamp for GraphQL
        try:
            formatted_date = format_timestamp(datetime.strptime(assigned_date, '%Y-%m-%d'))
        except ValueError:
            return jsonify({'error': 'assignedDate must be in format YYYY-MM-DD'}), 400
        
        # Track created records
        created_records = []
        failed_records = []
        
        # STEP 1: Create BatchAssignment (one entry per batch)
        logger.info(f"📦 Creating BatchAssignment: Batch {batch_number}, Date {assigned_date}, Status {batch_status}")
        batch_result = execute_graphql(INSERT_BATCH_ASSIGNMENT_MUTATION, {
            "batch": batch_number,
            "assignedDate": formatted_date,
            "status": batch_status
        })
        
        if 'errors' in batch_result:
            logger.error(f"❌ Failed to create BatchAssignment: {batch_result['errors']}")
            failed_records.append({
                'step': 'batch_creation',
                'error': batch_result['errors'][0]['message'] if batch_result['errors'] else 'Unknown error'
            })
            # Still proceed to try creating stock-covers
        else:
            logger.info(f"✅ Created BatchAssignment: Batch {batch_number}")
        
        # Cache for stock-cover assignments to avoid duplicate creation
        stock_cover_cache = {}
        
        # STEP 2 & 3: Process each stock-cover assignment
        for assignment_idx, sca in enumerate(stock_cover_assignments):
            machine_id = str(sca.get('machine', '')).strip()
            stock_label = str(sca.get('stock', '')).strip()
            cover_label = str(sca.get('cover', '')).strip()
            cover_status = str(sca.get('coverStatus', 'covered')).strip()
            products = sca.get('products', [])
            
            # Validate assignment fields
            if not machine_id:
                failed_records.append({
                    'assignment_index': assignment_idx,
                    'error': 'machine field is required'
                })
                continue
            
            if not stock_label:
                failed_records.append({
                    'assignment_index': assignment_idx,
                    'error': 'stock field is required'
                })
                continue
            
            if not cover_label:
                failed_records.append({
                    'assignment_index': assignment_idx,
                    'error': 'cover field is required'
                })
                continue
            
            if not products or not isinstance(products, list):
                failed_records.append({
                    'assignment_index': assignment_idx,
                    'error': 'products must be a non-empty list'
                })
                continue
            
            # STEP 2: Create StockCoverAssignment (if not already cached)
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
                    failed_records.append({
                        'assignment_index': assignment_idx,
                        'error': f"StockCoverAssignment creation failed: {sca_result['errors'][0]['message'] if sca_result['errors'] else 'Unknown error'}"
                    })
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
                        failed_records.append({
                            'assignment_index': assignment_idx,
                            'error': 'Failed to retrieve StockCoverAssignment ID'
                        })
                        continue
                    
                    scas = get_sca.get('stockCoverAssignments', [])
                    if scas and len(scas) > 0:
                        stock_cover_id = scas[0].get('id')
                        stock_cover_cache[stock_cover_key] = stock_cover_id
                        logger.info(f"    ✅ Created StockCoverAssignment: ID {stock_cover_id}")
                    else:
                        logger.error(f"    ❌ Could not find created StockCoverAssignment")
                        failed_records.append({
                            'assignment_index': assignment_idx,
                            'error': 'StockCoverAssignment not found after creation'
                        })
                        continue
            else:
                stock_cover_id = stock_cover_cache[stock_cover_key]
                logger.info(f"  📍 Using cached StockCoverAssignment: {stock_cover_key}")
            
            # STEP 3: Create StockCoverProductAssignment for each product
            for product_idx, product in enumerate(products):
                try:
                    product_id = str(product.get('productId', product.get('product_id', ''))).strip()
                    units = int(product.get('units', 0))
                    case_label = str(product.get('caseLabel', product.get('case_label', ''))).strip()
                    
                    if not product_id:
                        failed_records.append({
                            'assignment_index': assignment_idx,
                            'product_index': product_idx,
                            'error': 'productId is required'
                        })
                        continue
                    
                    if units <= 0:
                        failed_records.append({
                            'assignment_index': assignment_idx,
                            'product_index': product_idx,
                            'product_id': product_id,
                            'error': 'units must be > 0'
                        })
                        continue
                    
                    # Insert into StockCoverProductAssignment
                    logger.info(f"    📦 Creating StockCoverProductAssignment: Product {product_id}, Units {units}")
                    scpa_result = execute_graphql(INSERT_STOCK_COVER_PRODUCT_ASSIGNMENT_MUTATION, {
                        "stockCoverAssignmentId": stock_cover_id,
                        "productId": product_id,
                        "units": units,
                        "caseLabel": case_label if case_label else None
                    })
                    
                    if 'errors' in scpa_result:
                        failed_records.append({
                            'assignment_index': assignment_idx,
                            'product_index': product_idx,
                            'product_id': product_id,
                            'error': scpa_result['errors'][0]['message'] if scpa_result['errors'] else 'Unknown GraphQL error'
                        })
                        logger.error(f"      ❌ GraphQL error: {scpa_result['errors']}")
                    else:
                        # Update WarehouseStock availableUnits when batch is created
                        case_units_updated = False
                        if case_label:
                            logger.info(f"    📥 Updating warehouse stock units for case label: {case_label}")
                            # Query WarehouseStock by caseLabel to find the warehouse case
                            get_warehouse_result = execute_graphql("""
                            query GetWarehouseCase($caseLabel: String!) {
                              warehouseStocks(where: {caseLabel: {eq: $caseLabel}}, limit: 1) {
                                stockId
                                caseLabel
                                availableUnits
                              }
                            }
                            """, {
                                "caseLabel": case_label
                            })
                            
                            if 'errors' not in get_warehouse_result:
                                warehouse_cases = get_warehouse_result.get('warehouseStocks', [])
                                if warehouse_cases and len(warehouse_cases) > 0:
                                    warehouse_case = warehouse_cases[0]
                                    current_units = warehouse_case.get('availableUnits', 0)
                                    new_units = max(0, current_units - units)  # Prevent negative units
                                    stock_id = warehouse_case.get('stockId')
                                    
                                    # Update the warehouse stock with new units
                                    update_result = execute_graphql("""
                                    mutation UpdateWarehouseUnits($stockId: UUID!, $newAvailableUnits: Int!) {
                                      warehouseStock_update(key: {stockId: $stockId}, data: {
                                        availableUnits: $newAvailableUnits
                                      })
                                    }
                                    """, {
                                        "stockId": stock_id,
                                        "newAvailableUnits": new_units
                                    })
                                    
                                    if 'errors' not in update_result:
                                        case_units_updated = True
                                        logger.info(f"      ✅ Updated WarehouseStock {case_label}: {current_units} → {new_units} units")
                                    else:
                                        logger.warning(f"      ⚠️  Failed to update warehouse stock units: {update_result['errors']}")
                        
                        created_records.append({
                            'batch': batch_number,
                            'machine': machine_id,
                            'stock': stock_label,
                            'cover': cover_label,
                            'product': product_id,
                            'units': units,
                            'caseLabel': case_label if case_label else None,
                            'stock_cover_assignment_id': stock_cover_id,
                            'case_units_updated': case_units_updated,
                            'status': 'success'
                        })
                        logger.info(
                            f"      ✅ Created StockCoverProductAssignment{' and updated case units' if case_units_updated else ''}"
                        )
                
                except ValueError as e:
                    failed_records.append({
                        'assignment_index': assignment_idx,
                        'product_index': product_idx,
                        'error': f'Value error: {str(e)}'
                    })
                except Exception as e:
                    failed_records.append({
                        'assignment_index': assignment_idx,
                        'product_index': product_idx,
                        'error': str(e)
                    })
                    logger.error(f"Error processing product: {str(e)}", exc_info=True)
        
        # === Auto-generate QR history for this batch ===
        try:
            user_id = data.get('userId') if isinstance(data, dict) else None
            machine_ids = []
            if isinstance(data, dict) and isinstance(data.get('machine_ids'), list):
                machine_ids.extend([str(mid).strip() for mid in data.get('machine_ids') if str(mid).strip()])
            for sca in stock_cover_assignments:
                mid = sca.get('machine') if isinstance(sca, dict) else None
                if mid:
                    machine_ids.append(str(mid).strip())

            machine_ids = list(dict.fromkeys(machine_ids))
            logger.info(f"📌 Auto QR history generation for batch {batch_number}: machine_ids={machine_ids}")

            if machine_ids:
                qr_result = create_batch_qr_history(batch_number, assigned_date, machine_ids, user_id)
                if qr_result and 'errors' in qr_result:
                    logger.warning(f"Auto QR history creation failed for batch {batch_number}: {qr_result['errors']}")
            else:
                logger.warning(f"No machine IDs found for auto QR history for batch {batch_number}")
        except Exception as e:
            logger.error(f"Error creating QR history for batch {batch_number}: {str(e)}", exc_info=True)

        # Prepare response
        response = {
            'success': len(failed_records) == 0,
            'batch': batch_number,
            'total_processed': len(created_records) + len(failed_records),
            'total_created': len(created_records),
            'total_failed': len(failed_records),
            'created_records': created_records,
            'storage': {
                'batchAssignment': 'Created',
                'stockCoverAssignments': len(stock_cover_cache),
                'stockCoverProductAssignments': len(created_records),
                'purchasedProductCasesUpdated': sum(1 for r in created_records if r.get('case_units_updated'))
            }
        }
        
        if failed_records:
            response['failed_records'] = failed_records
        
        status_code = 200 if response['success'] else 207  # 207 Multi-Status for partial success
        
        return jsonify(response), status_code
        
    except Exception as e:
        logger.error(f"Error in normalize_batch_assignment: {str(e)}", exc_info=True)
        return jsonify({'error': str(e)}), 500


@batch_creation_bp.route('/api/batch-assignment/normalize-from-tree', methods=['POST'])
def normalize_from_tree():
    """
    Normalize flat record-structured batch assignment.
    Records are transformed into normalized three-table structure.
    Also updates WarehouseStock availableUnits when batch is created.
    
    Expected input format:
    {
      "batch": 1,
      "assignedDate": "2026-04-21",
      "status": "Active",
      "records": [
        {
          "machine": "VM001",
          "stock": "S1",
          "cover": "C",
          "coverStatus": "covered",
          "productId": "RUBY002",
          "units": 6,
          "caseLabel": "ABC123"
        },
        ...
      ]
    }
    """
    try:
        data = request.json
        
        # Validate required fields
        batch_number = data.get('batch')
        assigned_date = data.get('assignedDate')
        batch_status = data.get('status', 'Active')
        records = data.get('records', [])
        
        if not batch_number or batch_number <= 0:
            return jsonify({'error': 'batch number is required and must be > 0'}), 400
        
        if not assigned_date:
            return jsonify({'error': 'assignedDate is required (format: YYYY-MM-DD)'}), 400
        
        if not records:
            return jsonify({'error': 'records is required and must be non-empty'}), 400
        
        # Format timestamp for GraphQL
        try:
            formatted_date = format_timestamp(datetime.strptime(assigned_date, '%Y-%m-%d'))
        except ValueError:
            return jsonify({'error': 'assignedDate must be in format YYYY-MM-DD'}), 400
        
        # Track created records
        created_records = []
        failed_records = []
        
        # STEP 1: Create BatchAssignment
        logger.info(f"📦 Creating BatchAssignment: Batch {batch_number}, Date {assigned_date}, Status {batch_status}")
        batch_result = execute_graphql(INSERT_BATCH_ASSIGNMENT_MUTATION, {
            "batch": batch_number,
            "assignedDate": formatted_date,
            "status": batch_status
        })
        
        if 'errors' in batch_result:
            logger.error(f"❌ Failed to create BatchAssignment: {batch_result['errors']}")
            failed_records.append({
                'step': 'batch_creation',
                'error': batch_result['errors'][0]['message'] if batch_result['errors'] else 'Unknown error'
            })
        else:
            logger.info(f"✅ Created BatchAssignment: Batch {batch_number}")
        
        # STEP 2: Group records by machine/stock/cover for stock-cover assignments
        stock_cover_groups = {}
        stock_cover_cache = {}
        
        for record in records:
            machine_id = str(record.get('machine', '')).strip()
            stock_label = str(record.get('stock', '')).strip()
            cover_label = str(record.get('cover', '')).strip()
            cover_status = str(record.get('coverStatus', 'covered')).strip()
            
            key = f"{machine_id}_{stock_label}_{cover_label}"
            if key not in stock_cover_groups:
                stock_cover_groups[key] = {
                    'machine': machine_id,
                    'stock': stock_label,
                    'cover': cover_label,
                    'coverStatus': cover_status,
                    'products': []
                }
        
        # STEP 3: Create stock-cover assignments and collect products
        for group_key, group_data in stock_cover_groups.items():
            machine_id = group_data['machine']
            stock_label = group_data['stock']
            cover_label = group_data['cover']
            cover_status = group_data['coverStatus']
            
            logger.info(f"  📍 Creating StockCoverAssignment: {group_key}")
            sca_result = execute_graphql(INSERT_STOCK_COVER_ASSIGNMENT_MUTATION, {
                "batch": batch_number,
                "machineId": machine_id,
                "stockLabel": stock_label,
                "coverLabel": cover_label,
                "coverStatus": cover_status
            })
            
            if 'errors' in sca_result:
                logger.error(f"    ❌ Failed to create StockCoverAssignment: {sca_result['errors']}")
                failed_records.append({
                    'group_key': group_key,
                    'error': f"StockCoverAssignment creation failed: {sca_result['errors'][0]['message'] if sca_result['errors'] else 'Unknown error'}"
                })
                continue
            
            # Get the created StockCoverAssignment ID
            get_sca = execute_graphql(GET_STOCK_COVER_ASSIGNMENT_QUERY, {
                "batch": batch_number,
                "machineId": machine_id,
                "stockLabel": stock_label,
                "coverLabel": cover_label
            })
            
            if 'errors' in get_sca:
                logger.error(f"    ❌ Failed to retrieve StockCoverAssignment ID: {get_sca['errors']}")
                failed_records.append({
                    'group_key': group_key,
                    'error': 'Failed to retrieve StockCoverAssignment ID'
                })
                continue
            
            scas = get_sca.get('stockCoverAssignments', [])
            if scas and len(scas) > 0:
                stock_cover_id = scas[0].get('id')
                stock_cover_cache[group_key] = stock_cover_id
                logger.info(f"    ✅ Created StockCoverAssignment: ID {stock_cover_id}")
            else:
                logger.error(f"    ❌ Could not find created StockCoverAssignment")
                failed_records.append({
                    'group_key': group_key,
                    'error': 'StockCoverAssignment not found after creation'
                })
                continue
        
        # STEP 4: Process each record to create products and update case units
        for record_idx, record in enumerate(records):
            try:
                machine_id = str(record.get('machine', '')).strip()
                stock_label = str(record.get('stock', '')).strip()
                cover_label = str(record.get('cover', '')).strip()
                product_id = str(record.get('productId', record.get('product_id', ''))).strip()
                units = int(record.get('units', 0))
                case_label = str(record.get('caseLabel', record.get('case_label', ''))).strip()
                
                # Validate record fields
                if not machine_id:
                    raise ValueError('machine field is required')
                if not stock_label:
                    raise ValueError('stock field is required')
                if not cover_label:
                    raise ValueError('cover field is required')
                if not product_id:
                    raise ValueError('productId is required')
                if units <= 0:
                    raise ValueError('units must be > 0')
                
                # Get the stock-cover assignment ID
                group_key = f"{machine_id}_{stock_label}_{cover_label}"
                if group_key not in stock_cover_cache:
                    failed_records.append({
                        'record_index': record_idx,
                        'product_id': product_id,
                        'error': f'StockCoverAssignment not created for group {group_key}'
                    })
                    continue
                
                stock_cover_id = stock_cover_cache[group_key]
                
                # Create StockCoverProductAssignment
                logger.info(f"    📦 Creating StockCoverProductAssignment: Product {product_id}, Units {units}")
                scpa_result = execute_graphql(INSERT_STOCK_COVER_PRODUCT_ASSIGNMENT_MUTATION, {
                    "stockCoverAssignmentId": stock_cover_id,
                    "productId": product_id,
                    "units": units,
                    "caseLabel": case_label if case_label else None
                })
                
                if 'errors' in scpa_result:
                    failed_records.append({
                        'record_index': record_idx,
                        'product_id': product_id,
                        'error': scpa_result['errors'][0]['message'] if scpa_result['errors'] else 'Unknown GraphQL error'
                    })
                    logger.error(f"      ❌ GraphQL error: {scpa_result['errors']}")
                else:
                    # Update WarehouseStock availableUnits when batch is created
                    case_units_updated = False
                    if case_label:
                        logger.info(f"    📥 Updating warehouse stock units for case label: {case_label}")
                        # Query WarehouseStock by caseLabel to find the warehouse case
                        get_warehouse_result = execute_graphql("""
                        query GetWarehouseCase($caseLabel: String!) {
                          warehouseStocks(where: {caseLabel: {eq: $caseLabel}}, limit: 1) {
                            stockId
                            caseLabel
                            availableUnits
                          }
                        }
                        """, {
                            "caseLabel": case_label
                        })
                        
                        if 'errors' not in get_warehouse_result:
                            warehouse_cases = get_warehouse_result.get('warehouseStocks', [])
                            if warehouse_cases and len(warehouse_cases) > 0:
                                warehouse_case = warehouse_cases[0]
                                current_units = warehouse_case.get('availableUnits', 0)
                                new_units = max(0, current_units - units)  # Prevent negative units
                                stock_id = warehouse_case.get('stockId')
                                
                                # Update the warehouse stock with new units
                                update_result = execute_graphql("""
                                mutation UpdateWarehouseUnits($stockId: UUID!, $newAvailableUnits: Int!) {
                                  warehouseStock_update(key: {stockId: $stockId}, data: {
                                    availableUnits: $newAvailableUnits
                                  })
                                }
                                """, {
                                    "stockId": stock_id,
                                    "newAvailableUnits": new_units
                                })
                                
                                if 'errors' not in update_result:
                                    case_units_updated = True
                                    logger.info(f"      ✅ Updated WarehouseStock {case_label}: {current_units} → {new_units} units")
                                else:
                                    logger.warning(f"      ⚠️  Failed to update warehouse stock units: {update_result['errors']}")
                    
                    created_records.append({
                        'batch': batch_number,
                        'machine': machine_id,
                        'stock': stock_label,
                        'cover': cover_label,
                        'product': product_id,
                        'units': units,
                        'caseLabel': case_label if case_label else None,
                        'stock_cover_assignment_id': stock_cover_id,
                        'case_units_updated': case_units_updated,
                        'status': 'success'
                    })
                    logger.info(
                        f"      ✅ Created StockCoverProductAssignment{' and updated case units' if case_units_updated else ''}"
                    )
            
            except ValueError as e:
                failed_records.append({
                    'record_index': record_idx,
                    'error': f'Value error: {str(e)}'
                })
            except Exception as e:
                failed_records.append({
                    'record_index': record_idx,
                    'error': str(e)
                })
                logger.error(f"Error processing record: {str(e)}", exc_info=True)
        
        # Prepare response
        response = {
            'success': len(failed_records) == 0,
            'batch': batch_number,
            'total_processed': len(created_records) + len(failed_records),
            'total_created': len(created_records),
            'total_failed': len(failed_records),
            'created_records': created_records,
            'storage': {
                'batchAssignment': 'Created',
                'stockCoverAssignments': len(stock_cover_cache),
                'stockCoverProductAssignments': len(created_records),
                'purchasedProductCasesUpdated': sum(1 for r in created_records if r.get('case_units_updated'))
            }
        }
        
        if failed_records:
            response['failed_records'] = failed_records
        
        status_code = 200 if response['success'] else 207  # 207 Multi-Status for partial success
        
        return jsonify(response), status_code
        
    except Exception as e:
        logger.error(f"Error in normalize_from_tree: {str(e)}", exc_info=True)
        return jsonify({'error': str(e)}), 500
