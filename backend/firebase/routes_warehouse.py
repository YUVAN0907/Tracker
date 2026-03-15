from flask import Blueprint, request, jsonify
from datetime import datetime
from dataconnect_db import execute_graphql, format_timestamp

warehouse_bp = Blueprint('warehouse', __name__)

GET_WAREHOUSE_INV_QUERY = """
query GetWarehouse($productId: String!) {
  warehouseInventory(key: { productId: $productId }) {
    productId
    availableUnits
    unitsPerCase
  }
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
  }) 
}
"""

DELETE_WAREHOUSE_MUTATION = """
mutation DeleteWarehouse($productId: String!) {
  warehouseInventory_delete(key: { productId: $productId }) 
}
"""

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

        res = execute_graphql(GET_WAREHOUSE_INV_QUERY, {"productId": product_id})
        current_inv = res.get("warehouseInventory")

        if not current_inv:
            return jsonify({'error': f'Product {product_id} not found in warehouse'}), 404

        current_units = int(current_inv.get("availableUnits", 0))

        if current_units < units_to_transfer:
            return jsonify({'error': f'Insufficient stock in warehouse (Available: {current_units}, Requested: {units_to_transfer})'}), 400

        new_units = current_units - units_to_transfer

        vars = {
            "productId": product_id,
            "availableUnits": new_units,
            "unitsPerCase": int(current_inv.get("unitsPerCase", 1)),
            "lastReceivedDate": format_timestamp(datetime.now())
        }
        execute_graphql(UPSERT_WAREHOUSE_MUTATION, vars)

        return jsonify({
            'message': f'Successfully transferred {units_to_transfer} units.',
            'remaining': new_units
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

        execute_graphql(DELETE_WAREHOUSE_MUTATION, {"productId": product_id})
        return jsonify({'message': f'Product {product_id} successfully deleted from warehouse'})

    except Exception as e:
        return jsonify({'error': str(e)}), 500
