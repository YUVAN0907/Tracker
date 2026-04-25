from flask import Blueprint, request, jsonify
from dataconnect_db import execute_graphql
import logging

stock_batch_update_bp = Blueprint('stock_batch_update', __name__)
logger = logging.getLogger(__name__)

# Mutation to update StockCoverProductAssignment units
UPDATE_STOCK_COVER_PRODUCT_UNITS_MUTATION = """
mutation UpdateStockCoverProductUnits($id: UUID!, $newUnits: Int!) {
  stockCoverProductAssignment_update(key: {id: $id}, data: {units: $newUnits})
}
"""

# Query to get StockCoverProductAssignment by ID
GET_STOCK_COVER_PRODUCT_BY_ID_QUERY = """
query GetStockCoverProduct($id: UUID!) {
  stockCoverProductAssignment(key: {id: $id}) {
    id
    stockCoverAssignmentId
    productId
    units
    caseLabel
  }
}
"""

# Query to get all products in a batch
GET_ALL_PRODUCTS_IN_BATCH_QUERY = """
query GetAllProductsInBatch($batch: Int!) {
  stockCoverProductAssignments(where: {stockCoverAssignment: {batch: {eq: $batch}}}) {
    id
    units
  }
}
"""

# Mutation to update batch status
UPDATE_BATCH_STATUS_MUTATION = """
mutation UpdateBatchStatus($batch: Int!, $status: String!) {
  batchAssignment_update(key: {batch: $batch}, data: {status: $status})
}
"""

def check_and_update_batch_status(product_assignment_id):
    """
    Check if all products in the batch have 0 units.
    If so, update the batch status to 'Inactive'.
    """
    try:
        # First, get the product assignment to find the batch
        product_result = execute_graphql(GET_STOCK_COVER_PRODUCT_BY_ID_QUERY, {
            "id": product_assignment_id
        })
        
        if "errors" in product_result:
            logger.error(f"Failed to get product assignment: {product_result['errors']}")
            return
        
        product_assignment = product_result.get('stockCoverProductAssignment')
        if not product_assignment:
            logger.error(f"Product assignment {product_assignment_id} not found")
            return
        
        stock_cover_assignment_id = product_assignment.get('stockCoverAssignmentId')
        
        # Get the batch number from the stock cover assignment
        batch_query = """
        query GetBatchFromStockCover($scaId: UUID!) {
          stockCoverAssignment(key: {id: $scaId}) {
            batch
          }
        }
        """
        
        batch_result = execute_graphql(batch_query, {"scaId": stock_cover_assignment_id})
        if "errors" in batch_result:
            logger.error(f"Failed to get batch: {batch_result['errors']}")
            return
        
        batch_assignment = batch_result.get('stockCoverAssignment')
        if not batch_assignment:
            logger.error(f"Stock cover assignment {stock_cover_assignment_id} not found")
            return
        
        batch_number = batch_assignment.get('batch')
        
        # Now check all products in this batch
        all_products_result = execute_graphql(GET_ALL_PRODUCTS_IN_BATCH_QUERY, {
            "batch": batch_number
        })
        
        if "errors" in all_products_result:
            logger.error(f"Failed to get all products in batch: {all_products_result['errors']}")
            return
        
        products_in_batch = all_products_result.get('stockCoverProductAssignments', [])
        
        # Determine the correct batch status based on current units
        has_positive_units = any(product.get('units', 0) > 0 for product in products_in_batch)
        new_status = "Active" if has_positive_units else "Inactive"
        
        logger.info(f"[BATCH STATUS] Batch {batch_number} has_positive_units={has_positive_units}, setting status to {new_status}")
        status_result = execute_graphql(UPDATE_BATCH_STATUS_MUTATION, {
            "batch": batch_number,
            "status": new_status
        })
        
        if "errors" in status_result:
            logger.error(f"Failed to update batch status: {status_result['errors']}")
        else:
            logger.info(f"[BATCH STATUS] Successfully updated batch {batch_number} to {new_status}")
            
    except Exception as e:
        logger.error(f"Error in check_and_update_batch_status: {str(e)}", exc_info=True)

@stock_batch_update_bp.route('/api/stock-batch/update-units', methods=['POST'])
def update_stock_batch_units():
    """
    Update units for a specific Stock-Cover-Product combination.
    
    Request JSON:
    {
      "id": "UUID of StockCoverProductAssignment record",
      "newUnits": 5
    }
    
    Response: { success: true, updated: {...} } or error
    """
    try:
        data = request.json
        product_id = data.get("id")
        new_units = data.get("newUnits")
        
        # Validation
        if not product_id:
            return jsonify({"error": "id (StockCoverProductAssignment ID) is required"}), 400
        
        if new_units is None or new_units < 0:
            return jsonify({"error": "newUnits must be a non-negative number"}), 400
        
        new_units = int(new_units)
        
        logger.info(f"[UPDATE UNITS] Updating StockCoverProductAssignment {product_id} to {new_units} units")
        
        # Update the record
        result = execute_graphql(
            UPDATE_STOCK_COVER_PRODUCT_UNITS_MUTATION,
            {
                "id": product_id,
                "newUnits": new_units
            }
        )
        
        # Check for GraphQL errors
        if "errors" in result:
            logger.error(f"[UPDATE ERROR] GraphQL errors: {result['errors']}")
            return jsonify({
                "error": "Failed to update units",
                "details": result.get("errors", [])
            }), 500
        
        logger.info(f"[UPDATE SUCCESS] Updated StockCoverProductAssignment {product_id}")
        
        # ✅ NEW: Check if all products in this batch have 0 units, if so, mark batch as Inactive
        check_and_update_batch_status(product_id)
        
        return jsonify({
            "success": True,
            "message": f"Updated units to {new_units}",
            "id": product_id,
            "newUnits": new_units
        }), 200
        
    except Exception as e:
        logger.error(f"[UPDATE EXCEPTION] Error updating stock batch units: {str(e)}", exc_info=True)
        return jsonify({"error": str(e)}), 500
