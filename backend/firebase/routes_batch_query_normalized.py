"""
Normalized Batch Assignment Query Endpoints
Endpoints for querying normalized three-table structure with backward-compatible flat output
"""

from flask import Blueprint, jsonify, request
from batch_assignment_queries import (
    get_batch_assignments_flat,
    get_batch_details_flat,
    get_stock_cover_products_flat,
    get_stock_cover_by_id,
    get_batch_assignments_hierarchical,
    get_batch_details_hierarchical
)
import logging

batch_assignment_query_bp = Blueprint('batch_assignment_query', __name__)
logger = logging.getLogger(__name__)

@batch_assignment_query_bp.route('/api/batch-assignments/normalized/all', methods=['GET'])
def get_all_batch_assignments_normalized():
    """
    Get all batch assignments from normalized tables (BatchAssignment -> StockCoverAssignment -> StockCoverProductAssignment)
    Returns: Flat list of records for display purposes
    """
    try:
        records = get_batch_assignments_flat()
        return jsonify({
            'success': True,
            'total': len(records),
            'records': records
        }), 200
    except Exception as e:
        logger.error(f"Error in get_all_batch_assignments_normalized: {str(e)}")
        return jsonify({'error': str(e)}), 500


@batch_assignment_query_bp.route('/api/batch-assignments/normalized/<int:batch>', methods=['GET'])
def get_batch_assignment_details_normalized(batch):
    """
    Get specific batch details from normalized tables
    Returns: Flat list of records for that batch (backward compatible)
    """
    try:
        if batch <= 0:
            return jsonify({'error': 'batch must be > 0'}), 400
        
        records = get_batch_details_flat(batch)
        return jsonify({
            'success': True,
            'batch': batch,
            'total': len(records),
            'records': records
        }), 200
    except Exception as e:
        logger.error(f"Error in get_batch_assignment_details_normalized: {str(e)}")
        return jsonify({'error': str(e)}), 500


@batch_assignment_query_bp.route('/api/batch-assignments/normalized/<int:batch>/stock/<stock>/cover/<cover>', methods=['GET'])
def get_stock_cover_products_normalized(batch, stock, cover):
    """
    Get all products in a specific stock-cover combination
    Returns: List of products with units and case labels
    """
    try:
        if batch <= 0:
            return jsonify({'error': 'batch must be > 0'}), 400
        
        if not stock or not cover:
            return jsonify({'error': 'stock and cover are required'}), 400
        
        records = get_stock_cover_products_flat(batch, stock, cover)
        return jsonify({
            'success': True,
            'batch': batch,
            'stock': stock,
            'cover': cover,
            'total': len(records),
            'products': records
        }), 200
    except Exception as e:
        logger.error(f"Error in get_stock_cover_products_normalized: {str(e)}")
        return jsonify({'error': str(e)}), 500


@batch_assignment_query_bp.route('/api/batch-assignments/normalized/stock-cover/<stock_cover_id>', methods=['GET'])
def get_stock_cover_by_id_endpoint(stock_cover_id):
    """
    Get a specific stock-cover assignment with all its details
    Returns: Stock-cover with all associated products
    """
    try:
        result = get_stock_cover_by_id(stock_cover_id)
        
        if not result:
            return jsonify({'error': 'Stock-cover assignment not found'}), 404
        
        return jsonify({
            'success': True,
            'stock_cover': result
        }), 200
    except Exception as e:
        logger.error(f"Error in get_stock_cover_by_id_endpoint: {str(e)}")
        return jsonify({'error': str(e)}), 500


@batch_assignment_query_bp.route('/api/batch-assignments/normalized/compare', methods=['GET'])
def compare_flat_vs_normalized():
    """
    DEPRECATED: This endpoint is no longer needed as we only use normalized tables.
    Kept for backward compatibility - returns normalized data only.
    """
    try:
        # Query normalized tables only
        normalized_records = get_batch_assignments_flat()[:10]
        
        return jsonify({
            'success': True,
            'total': len(normalized_records),
            'records': normalized_records,
            'note': 'Using normalized three-table structure (BatchAssignment -> StockCoverAssignment -> StockCoverProductAssignment)'
        }), 200
    except Exception as e:
        logger.error(f"Error in compare_flat_vs_normalized: {str(e)}")
        return jsonify({'error': str(e)}), 500


# ===== HIERARCHICAL ENDPOINTS (NO REDUNDANT DISPLAY) =====

@batch_assignment_query_bp.route('/api/batch-assignments/hierarchical/all', methods=['GET'])
def get_all_batch_assignments_hierarchical():
    """
    Get all batch assignments in hierarchical format (grouped by batch > machine > stock > cover)
    Eliminates redundant display - common items shown only once
    Includes case labels for each product
    
    Response format:
    {
      "batches": [
        {
          "batch": 1,
          "assignedDate": "2026-03-05T...",
          "status": "Active",
          "machines": [
            {
              "machineId": "VM001",
              "stocks": [
                {
                  "stockLabel": "S1",
                  "covers": [
                    {
                      "coverLabel": "C",
                      "coverStatus": "covered",
                      "stockCoverAssignmentId": "uuid",
                      "products": [
                        {
                          "productId": "PROD001",
                          "productName": "Product Name",
                          "units": 10,
                          "caseLabel": "CASE1"
                        }
                      ]
                    }
                  ]
                }
              ]
            }
          ]
        }
      ]
    }
    """
    try:
        batches = get_batch_assignments_hierarchical()
        return jsonify({
            'success': True,
            'total': len(batches),
            'batches': batches
        }), 200
    except Exception as e:
        logger.error(f"Error in get_all_batch_assignments_hierarchical: {str(e)}")
        return jsonify({'error': str(e)}), 500


@batch_assignment_query_bp.route('/api/batch-assignments/hierarchical/<int:batch>', methods=['GET'])
def get_batch_assignment_details_hierarchical(batch):
    """
    Get specific batch details in hierarchical format (grouped by machine > stock > cover)
    Eliminates redundant display of common items
    Includes case labels for each product
    """
    try:
        if batch <= 0:
            return jsonify({'error': 'batch must be > 0'}), 400
        
        batch_data = get_batch_details_hierarchical(batch)
        
        if not batch_data:
            return jsonify({'error': f'Batch {batch} not found'}), 404
        
        return jsonify({
            'success': True,
            'batch': batch_data
        }), 200
    except Exception as e:
        logger.error(f"Error in get_batch_assignment_details_hierarchical: {str(e)}")
        return jsonify({'error': str(e)}), 500
