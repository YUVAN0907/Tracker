from flask import Blueprint, request, jsonify
from dataconnect_db import execute_graphql
import logging

batch_assignment_query_bp = Blueprint('batch_query', __name__)
logger = logging.getLogger(__name__)

# GraphQL Queries for normalized batch structure
GET_BATCH_ASSIGNMENTS = """
query GetBatchAssignments($batch: Int!) {
  batchAssignmentList(where: { batch: { eq: $batch } }) {
    id
    batch
    assignedDate
    status
    createdAt
  }
}
"""

GET_STOCK_COVER_ASSIGNMENTS = """
query GetStockCoverAssignments($batch: Int!) {
  stockCoverAssignmentList(where: { batch: { eq: $batch } }, orderBy: [{stockLabel: ASC}, {coverLabel: ASC}]) {
    id
    batch
    machineId
    stockLabel
    coverLabel
    coverStatus
    createdAt
    machine {
      id
      name
      location
    }
  }
}
"""

GET_STOCK_COVER_PRODUCT_ASSIGNMENTS = """
query GetStockCoverProductAssignments($stockCoverId: UUID!) {
  stockCoverProductAssignmentList(where: { stock_cover_assignment_id: { eq: $stockCoverId } }) {
    id
    stock_cover_assignment_id
    productId
    units
    caseLabel
    createdAt
    product {
      productName
      productSku
    }
  }
}
"""

GET_BATCH_DETAILS_NORMALIZED = """
query GetBatchDetailsNormalized($batch: Int!) {
  batchAssignmentList(where: { batch: { eq: $batch } }) {
    id
    batch
    assignedDate
    status
  }
  stockCoverAssignmentList(where: { batch: { eq: $batch } }) {
    id
    batch
    machineId
    stockLabel
    coverLabel
    coverStatus
    machine {
      name
      location
    }
  }
  stockCoverProductAssignmentList(limit: 1000) {
    id
    stock_cover_assignment_id
    productId
    units
    caseLabel
    product {
      productName
    }
  }
}
"""

GET_ALL_BATCHES_SUMMARY = """
query GetAllBatchesSummary {
  batchAssignmentList(orderBy: [{batch: DESC}]) {
    batch
    assignedDate
    status
    createdAt
  }
}
"""

COMPARE_BATCHES = """
query CompareBatches($batch1: Int!, $batch2: Int!) {
  batch1StockCovers: stockCoverAssignmentList(where: { batch: { eq: $batch1 } }) {
    id
    batch
    machineId
    stockLabel
    coverLabel
    coverStatus
  }
  batch2StockCovers: stockCoverAssignmentList(where: { batch: { eq: $batch2 } }) {
    id
    batch
    machineId
    stockLabel
    coverLabel
    coverStatus
  }
}
"""

@batch_assignment_query_bp.route('/api/batch-query/details/<int:batch_number>', methods=['GET'])
def get_batch_details(batch_number):
    """
    Get complete batch details using normalized tables.
    Returns batch info, stock-cover assignments, and products.
    """
    try:
        if batch_number <= 0:
            return jsonify({'error': 'batch_number must be > 0'}), 400
        
        # Get batch details with all nested data
        result = execute_graphql(GET_BATCH_DETAILS_NORMALIZED, {'batch': batch_number})
        
        batch_data = result.get('batchAssignmentList', [])
        stock_covers = result.get('stockCoverAssignmentList', [])
        products = result.get('stockCoverProductAssignmentList', [])
        
        if not batch_data:
            return jsonify({'error': f'Batch {batch_number} not found'}), 404
        
        # Organize products by stock_cover_assignment_id
        products_by_cover = {}
        for product in products:
            cover_id = product.get('stock_cover_assignment_id')
            if cover_id not in products_by_cover:
                products_by_cover[cover_id] = []
            products_by_cover[cover_id].append({
                'id': product.get('id'),
                'productId': product.get('productId'),
                'productName': (product.get('product') or {}).get('productName', ''),
                'units': product.get('units'),
                'caseLabel': product.get('caseLabel')
            })
        
        # Organize stock covers with their products
        covers_with_products = []
        for cover in stock_covers:
            cover_id = cover.get('id')
            covers_with_products.append({
                'id': cover_id,
                'batch': cover.get('batch'),
                'machineId': cover.get('machineId'),
                'machineName': (cover.get('machine') or {}).get('name', ''),
                'machineLocation': (cover.get('machine') or {}).get('location', ''),
                'stockLabel': cover.get('stockLabel'),
                'coverLabel': cover.get('coverLabel'),
                'coverStatus': cover.get('coverStatus'),
                'products': products_by_cover.get(cover_id, [])
            })
        
        logger.info(f"✅ Retrieved details for Batch {batch_number}")
        
        return jsonify({
            'success': True,
            'batch': {
                'batch': batch_data[0].get('batch'),
                'assignedDate': batch_data[0].get('assignedDate'),
                'status': batch_data[0].get('status'),
                'createdAt': batch_data[0].get('createdAt')
            },
            'stockCovers': covers_with_products,
            'summary': {
                'totalStockCovers': len(stock_covers),
                'totalProducts': len(products),
                'totalUnits': sum(p.get('units', 0) for p in products)
            }
        }), 200
        
    except Exception as e:
        logger.error(f"Error in get_batch_details: {str(e)}", exc_info=True)
        return jsonify({'error': str(e)}), 500


@batch_assignment_query_bp.route('/api/batch-query/all-batches', methods=['GET'])
def get_all_batches_summary():
    """
    Get summary of all batches using normalized tables.
    """
    try:
        result = execute_graphql(GET_ALL_BATCHES_SUMMARY)
        batches = result.get('batchAssignmentList', [])
        
        summary = []
        for batch in batches:
            summary.append({
                'batch': batch.get('batch'),
                'assignedDate': batch.get('assignedDate'),
                'status': batch.get('status'),
                'createdAt': batch.get('createdAt')
            })
        
        logger.info(f"✅ Retrieved summary for {len(summary)} batches")
        
        return jsonify({
            'success': True,
            'batches': summary,
            'count': len(summary)
        }), 200
        
    except Exception as e:
        logger.error(f"Error in get_all_batches_summary: {str(e)}", exc_info=True)
        return jsonify({'error': str(e)}), 500


@batch_assignment_query_bp.route('/api/batch-query/compare', methods=['POST'])
def compare_batches():
    """
    Compare two batches to show differences in stock-cover-product structure.
    Uses normalized tables for comparison.
    """
    try:
        data = request.json
        batch1 = int(data.get('batch1', 0))
        batch2 = int(data.get('batch2', 0))
        
        if batch1 <= 0 or batch2 <= 0:
            return jsonify({'error': 'Both batch numbers must be > 0'}), 400
        
        if batch1 == batch2:
            return jsonify({'error': 'Cannot compare a batch with itself'}), 400
        
        result = execute_graphql(COMPARE_BATCHES, {'batch1': batch1, 'batch2': batch2})
        
        batch1_covers = result.get('batch1StockCovers', [])
        batch2_covers = result.get('batch2StockCovers', [])
        
        # Organize by stock-cover key for comparison
        batch1_dict = {}
        for cover in batch1_covers:
            key = f"{cover.get('stockLabel')}-{cover.get('coverLabel')}"
            batch1_dict[key] = cover
        
        batch2_dict = {}
        for cover in batch2_covers:
            key = f"{cover.get('stockLabel')}-{cover.get('coverLabel')}"
            batch2_dict[key] = cover
        
        # Find differences
        all_keys = set(batch1_dict.keys()) | set(batch2_dict.keys())
        
        comparison = {
            'batch1': batch1,
            'batch2': batch2,
            'inBatch1Only': [],
            'inBatch2Only': [],
            'inBoth': [],
            'totalCoversBatch1': len(batch1_covers),
            'totalCoversBatch2': len(batch2_covers)
        }
        
        for key in sorted(all_keys):
            if key in batch1_dict and key in batch2_dict:
                comparison['inBoth'].append({
                    'stock_cover': key,
                    'batch1': {
                        'stockLabel': batch1_dict[key].get('stockLabel'),
                        'coverStatus': batch1_dict[key].get('coverStatus')
                    },
                    'batch2': {
                        'stockLabel': batch2_dict[key].get('stockLabel'),
                        'coverStatus': batch2_dict[key].get('coverStatus')
                    }
                })
            elif key in batch1_dict:
                comparison['inBatch1Only'].append(key)
            else:
                comparison['inBatch2Only'].append(key)
        
        logger.info(f"✅ Compared Batch {batch1} and {batch2}")
        
        return jsonify({
            'success': True,
            'comparison': comparison
        }), 200
        
    except Exception as e:
        logger.error(f"Error in compare_batches: {str(e)}", exc_info=True)
        return jsonify({'error': str(e)}), 500


@batch_assignment_query_bp.route('/api/batch-query/stock-cover/<stock_cover_id>', methods=['GET'])
def get_stock_cover_details(stock_cover_id):
    """
    Get all products in a specific stock-cover assignment.
    """
    try:
        if not stock_cover_id:
            return jsonify({'error': 'stock_cover_id is required'}), 400
        
        result = execute_graphql(GET_STOCK_COVER_PRODUCT_ASSIGNMENTS, {'stockCoverId': stock_cover_id})
        products = result.get('stockCoverProductAssignmentList', [])
        
        product_list = []
        total_units = 0
        for product in products:
            product_list.append({
                'id': product.get('id'),
                'productId': product.get('productId'),
                'productName': (product.get('product') or {}).get('productName', ''),
                'productSku': (product.get('product') or {}).get('productSku', ''),
                'units': product.get('units'),
                'caseLabel': product.get('caseLabel'),
                'createdAt': product.get('createdAt')
            })
            total_units += product.get('units', 0)
        
        logger.info(f"✅ Retrieved {len(product_list)} products for stock-cover {stock_cover_id}")
        
        return jsonify({
            'success': True,
            'products': product_list,
            'summary': {
                'totalProducts': len(product_list),
                'totalUnits': total_units
            }
        }), 200
        
    except Exception as e:
        logger.error(f"Error in get_stock_cover_details: {str(e)}", exc_info=True)
        return jsonify({'error': str(e)}), 500