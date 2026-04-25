"""
Batch Assignment Query Helper
Provides functions to query normalized batch tables and return flat format for backward compatibility
"""

from dataconnect_db import execute_graphql
import logging

logger = logging.getLogger(__name__)

# ==============================
# QUERY HELPERS FOR NORMALIZED TABLES
# ==============================

GET_ALL_BATCHES_NORMALIZED_QUERY = """
query GetAllBatchesNormalized {
  batchAssignments(orderBy: [{batch: DESC}]) {
    batch
    assignedDate
    status
  }
}
"""

GET_STOCK_COVER_ASSIGNMENTS_BY_BATCH_QUERY = """
query GetStockCoverAssignmentsByBatch($batch: Int!) {
  stockCoverAssignments(
    where: {batch: {eq: $batch}}
    orderBy: [{stockLabel: ASC}, {coverLabel: ASC}]
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

GET_PRODUCTS_IN_STOCK_COVER_QUERY = """
query GetProductsInStockCover($stockCoverAssignmentId: UUID!) {
  stockCoverProductAssignments(
    where: {stockCoverAssignmentId: {eq: $stockCoverAssignmentId}}
  ) {
    id
    stockCoverAssignmentId
    productId
    units
    caseLabel
    product {
      productName
    }
  }
}
"""

# ==============================
# FLAT QUERY HELPERS (for backward compatibility)
# ==============================

def get_batch_assignments_flat():
    """
    Query normalized three-table structure and return flattened results (one record per product).
    This provides backward-compatible output format.
    """
    try:
        # Step 1: Get all batches
        batch_result = execute_graphql(GET_ALL_BATCHES_NORMALIZED_QUERY, {})
        batches = batch_result.get('batchAssignments', [])
        
        flat_records = []
        
        for batch in batches:
            batch_num = batch.get('batch')
            assigned_date = batch.get('assignedDate')
            status = batch.get('status')
            
            # Step 2: Get stock-cover assignments for this batch
            sca_result = execute_graphql(GET_STOCK_COVER_ASSIGNMENTS_BY_BATCH_QUERY, {
                'batch': batch_num
            })
            stock_covers = sca_result.get('stockCoverAssignments', [])
            
            for sca in stock_covers:
                sca_id = sca.get('id')
                machine_id = sca.get('machineId')
                stock_label = sca.get('stockLabel')
                cover_label = sca.get('coverLabel')
                cover_status = sca.get('coverStatus')
                
                # Step 3: Get products in this stock-cover
                scpa_result = execute_graphql(GET_PRODUCTS_IN_STOCK_COVER_QUERY, {
                    'stockCoverAssignmentId': sca_id
                })
                products = scpa_result.get('stockCoverProductAssignments', [])
                
                for product in products:
                    flat_records.append({
                        'id': product.get('id'),  # Use product assignment ID
                        'batch': batch_num,
                        'assignedDate': assigned_date,
                        'machineId': machine_id,
                        'stockLabel': stock_label,
                        'coverLabel': cover_label,
                        'coverStatus': cover_status,
                        'productId': product.get('productId'),
                        'units': product.get('units'),
                        'caseLabel': product.get('caseLabel'),
                        'stockCoverAssignmentId': product.get('stockCoverAssignmentId'),
                        'product': product.get('product', {})
                    })
        
        return flat_records
    
    except Exception as e:
        logger.error(f"Error in get_batch_assignments_flat: {str(e)}", exc_info=True)
        return []


def get_batch_details_flat(batch_num):
    """
    Get flattened results for a specific batch
    """
    try:
        # Step 1: Get batch
        batch_result = execute_graphql(
            "query GetBatch($batch: Int!) { batchAssignment(key: {batch: $batch}) { batch assignedDate status } }",
            {'batch': batch_num}
        )
        batch = batch_result.get('batchAssignment')
        
        if not batch:
            return []
        
        assigned_date = batch.get('assignedDate')
        status = batch.get('status')
        
        # Step 2: Get stock-cover assignments for this batch
        sca_result = execute_graphql(GET_STOCK_COVER_ASSIGNMENTS_BY_BATCH_QUERY, {
            'batch': batch_num
        })
        stock_covers = sca_result.get('stockCoverAssignments', [])
        
        flat_records = []
        
        for sca in stock_covers:
            sca_id = sca.get('id')
            machine_id = sca.get('machineId')
            stock_label = sca.get('stockLabel')
            cover_label = sca.get('coverLabel')
            cover_status = sca.get('coverStatus')
            
            # Step 3: Get products in this stock-cover
            scpa_result = execute_graphql(GET_PRODUCTS_IN_STOCK_COVER_QUERY, {
                'stockCoverAssignmentId': sca_id
            })
            products = scpa_result.get('stockCoverProductAssignments', [])
            
            for product in products:
                flat_records.append({
                    'id': product.get('id'),
                    'batch': batch_num,
                    'assignedDate': assigned_date,
                    'machineId': machine_id,
                    'stockLabel': stock_label,
                    'coverLabel': cover_label,
                    'coverStatus': cover_status,
                    'productId': product.get('productId'),
                    'units': product.get('units'),
                    'caseLabel': product.get('caseLabel'),
                    'status': status,
                    'product': product.get('product', {})
                })
        
        return flat_records
    
    except Exception as e:
        logger.error(f"Error in get_batch_details_flat: {str(e)}", exc_info=True)
        return []


def get_stock_cover_products_flat(batch_num, stock_label, cover_label):
    """
    Get all products in a specific stock-cover combination
    """
    try:
        # Get stock-cover assignment
        query = """
        query GetStockCover($batch: Int!, $stock: String!, $cover: String!) {
          stockCoverAssignments(
            where: {
              _and: [
                {batch: {eq: $batch}}
                {stockLabel: {eq: $stock}}
                {coverLabel: {eq: $cover}}
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
        
        result = execute_graphql(query, {
            'batch': batch_num,
            'stock': stock_label,
            'cover': cover_label
        })
        
        stock_covers = result.get('stockCoverAssignments', [])
        
        if not stock_covers:
            return []
        
        sca = stock_covers[0]
        sca_id = sca.get('id')
        
        # Get products in this stock-cover
        products_result = execute_graphql(GET_PRODUCTS_IN_STOCK_COVER_QUERY, {
            'stockCoverAssignmentId': sca_id
        })
        
        products = products_result.get('stockCoverProductAssignments', [])
        
        flat_records = []
        for product in products:
            flat_records.append({
                'id': product.get('id'),
                'stockCoverAssignmentId': sca_id,
                'productId': product.get('productId'),
                'units': product.get('units'),
                'caseLabel': product.get('caseLabel'),
                'productName': product.get('product', {}).get('productName')
            })
        
        return flat_records
    
    except Exception as e:
        logger.error(f"Error in get_stock_cover_products_flat: {str(e)}", exc_info=True)
        return []


def get_stock_cover_by_id(stock_cover_assignment_id):
    """
    Get a specific stock-cover assignment with all its products
    """
    try:
        query = """
        query GetStockCoverById($id: UUID!) {
          stockCoverAssignment(key: {id: $id}) {
            id
            batch
            machineId
            stockLabel
            coverLabel
            coverStatus
            batchAssignment {
              assignedDate
              status
            }
          }
        }
        """
        
        result = execute_graphql(query, {'id': stock_cover_assignment_id})
        sca = result.get('stockCoverAssignment')
        
        if not sca:
            return None
        
        # Get products
        products_result = execute_graphql(GET_PRODUCTS_IN_STOCK_COVER_QUERY, {
            'stock_cover_assignment_id': stock_cover_assignment_id
        })
        
        products = products_result.get('stockCoverProductAssignments', [])
        
        return {
            'id': sca.get('id'),
            'batch': sca.get('batch'),
            'machineId': sca.get('machineId'),
            'stockLabel': sca.get('stockLabel'),
            'coverLabel': sca.get('coverLabel'),
            'coverStatus': sca.get('coverStatus'),
            'assignedDate': sca.get('batchAssignment', {}).get('assignedDate'),
            'status': sca.get('batchAssignment', {}).get('status'),
            'products': products
        }
    
    except Exception as e:
        logger.error(f"Error in get_stock_cover_by_id: {str(e)}", exc_info=True)
        return None


def get_batch_assignments_hierarchical():
    """
    Query normalized three-table structure and return hierarchical results.
    Groups data by batch > machine > stock > cover > products
    Eliminates redundant display of common items
    
    Returns: List of batches with hierarchical structure
    """
    try:
        # Step 1: Get all batches
        batch_result = execute_graphql(GET_ALL_BATCHES_NORMALIZED_QUERY, {})
        batches = batch_result.get('batchAssignments', [])
        
        hierarchical_data = []
        
        for batch in batches:
            batch_num = batch.get('batch')
            assigned_date = batch.get('assignedDate')
            batch_status = batch.get('status')
            
            # Step 2: Get stock-cover assignments for this batch
            sca_result = execute_graphql(GET_STOCK_COVER_ASSIGNMENTS_BY_BATCH_QUERY, {
                'batch': batch_num
            })
            stock_covers = sca_result.get('stockCoverAssignments', [])
            
            # Group by machine
            machines_dict = {}
            for sca in stock_covers:
                sca_id = sca.get('id')
                machine_id = sca.get('machineId')
                stock_label = sca.get('stockLabel')
                cover_label = sca.get('coverLabel')
                cover_status = sca.get('coverStatus')
                
                if machine_id not in machines_dict:
                    machines_dict[machine_id] = {'stocks': {}}
                
                if stock_label not in machines_dict[machine_id]['stocks']:
                    machines_dict[machine_id]['stocks'][stock_label] = {'covers': {}}
                
                # Get products in this stock-cover
                scpa_result = execute_graphql(GET_PRODUCTS_IN_STOCK_COVER_QUERY, {
                    'stockCoverAssignmentId': sca_id
                })
                products = scpa_result.get('stockCoverProductAssignments', [])
                
                # Format products with all details including caseLabel
                products_list = []
                for product in products:
                    products_list.append({
                        'id': product.get('id'),
                        'productId': product.get('productId'),
                        'productName': product.get('product', {}).get('productName', ''),
                        'units': product.get('units'),
                        'caseLabel': product.get('caseLabel')
                    })
                
                machines_dict[machine_id]['stocks'][stock_label]['covers'][cover_label] = {
                    'id': sca_id,
                    'coverStatus': cover_status,
                    'products': products_list
                }
            
            # Build hierarchical batch object
            batch_obj = {
                'batch': batch_num,
                'assignedDate': assigned_date,
                'status': batch_status,
                'machines': []
            }
            
            for machine_id, machine_data in machines_dict.items():
                machine_obj = {
                    'machineId': machine_id,
                    'stocks': []
                }
                
                for stock_label, stock_data in machine_data['stocks'].items():
                    stock_obj = {
                        'stockLabel': stock_label,
                        'covers': []
                    }
                    
                    for cover_label, cover_data in stock_data['covers'].items():
                        cover_obj = {
                            'coverLabel': cover_label,
                            'coverStatus': cover_data['coverStatus'],
                            'stockCoverAssignmentId': cover_data['id'],
                            'products': cover_data['products']
                        }
                        stock_obj['covers'].append(cover_obj)
                    
                    machine_obj['stocks'].append(stock_obj)
                
                batch_obj['machines'].append(machine_obj)
            
            hierarchical_data.append(batch_obj)
        
        return hierarchical_data
    
    except Exception as e:
        logger.error(f"Error in get_batch_assignments_hierarchical: {str(e)}", exc_info=True)
        return []


def get_batch_details_hierarchical(batch_num):
    """
    Get hierarchical results for a specific batch
    Groups data by machine > stock > cover > products
    """
    try:
        # Step 1: Get batch
        batch_result = execute_graphql(
            "query GetBatch($batch: Int!) { batchAssignment(key: {batch: $batch}) { batch assignedDate status } }",
            {'batch': batch_num}
        )
        batch = batch_result.get('batchAssignment')
        
        if not batch:
            return None
        
        assigned_date = batch.get('assignedDate')
        batch_status = batch.get('status')
        
        # Step 2: Get stock-cover assignments for this batch
        sca_result = execute_graphql(GET_STOCK_COVER_ASSIGNMENTS_BY_BATCH_QUERY, {
            'batch': batch_num
        })
        stock_covers = sca_result.get('stockCoverAssignments', [])
        
        # Group by machine
        machines_dict = {}
        for sca in stock_covers:
            sca_id = sca.get('id')
            machine_id = sca.get('machineId')
            stock_label = sca.get('stockLabel')
            cover_label = sca.get('coverLabel')
            cover_status = sca.get('coverStatus')
            
            if machine_id not in machines_dict:
                machines_dict[machine_id] = {'stocks': {}}
            
            if stock_label not in machines_dict[machine_id]['stocks']:
                machines_dict[machine_id]['stocks'][stock_label] = {'covers': {}}
            
            # Get products in this stock-cover
            scpa_result = execute_graphql(GET_PRODUCTS_IN_STOCK_COVER_QUERY, {
                'stockCoverAssignmentId': sca_id
            })
            products = scpa_result.get('stockCoverProductAssignments', [])
            
            # Format products with all details
            products_list = []
            for product in products:
                products_list.append({
                    'id': product.get('id'),
                    'productId': product.get('productId'),
                    'productName': product.get('product', {}).get('productName', ''),
                    'units': product.get('units'),
                    'caseLabel': product.get('caseLabel')
                })
            
            machines_dict[machine_id]['stocks'][stock_label]['covers'][cover_label] = {
                'id': sca_id,
                'coverStatus': cover_status,
                'products': products_list
            }
        
        # Build hierarchical batch object
        batch_obj = {
            'batch': batch_num,
            'assignedDate': assigned_date,
            'status': batch_status,
            'machines': []
        }
        
        for machine_id, machine_data in machines_dict.items():
            machine_obj = {
                'machineId': machine_id,
                'stocks': []
            }
            
            for stock_label, stock_data in machine_data['stocks'].items():
                stock_obj = {
                    'stockLabel': stock_label,
                    'covers': []
                }
                
                for cover_label, cover_data in stock_data['covers'].items():
                    cover_obj = {
                        'coverLabel': cover_label,
                        'coverStatus': cover_data['coverStatus'],
                        'stockCoverAssignmentId': cover_data['id'],
                        'products': cover_data['products']
                    }
                    stock_obj['covers'].append(cover_obj)
                
                machine_obj['stocks'].append(stock_obj)
            
            batch_obj['machines'].append(machine_obj)
        
        return batch_obj
    
    except Exception as e:
        logger.error(f"Error in get_batch_details_hierarchical: {str(e)}", exc_info=True)
        return None
