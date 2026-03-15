from flask import Blueprint, request, jsonify
from datetime import datetime
from dataconnect_db import execute_graphql, format_timestamp, generate_uuid

stock_ops_bp = Blueprint('stock_ops', __name__)

GET_INVENTORY_QUERY = """
query GetMachineInv($machineId: String!, $productId: String!) {
  machineInventory(machineId: $machineId, productId: $productId) {
    machineId
    productId
    currentStock
  }
}
"""

UPSERT_INVENTORY_MUTATION = """
mutation UpsertInv($machineId: String!, $productId: String!, $currentStock: Int!) {
  machineInventory_upsert(data: {
    machineId: $machineId,
    productId: $productId,
    currentStock: $currentStock
  }) 
}
"""

INSERT_SALE_MUTATION = """
mutation InsertSale(
  $machineId: String!, 
  $productId: String!, 
  $quantitySold: Int!, 
  $mrp: Float!, 
  $status: SaleStatus!,
  $transactionAt: Timestamp!
) {
  sale_insert(data: {
    machineId: $machineId,
    productId: $productId,
    quantitySold: $quantitySold,
    mrp: $mrp,
    status: $status,
    transactionAt: $transactionAt
  }) 
}
"""

INSERT_REFILL_MUTATION = """
mutation InsertRefill(
  $date: Timestamp!,
  $refillerId: String,
  $machineId: String!,
  $productId: String!,
  $quantity: Int!
) {
  refillLog_insert(data: {
    date: $date,
    refillerId: $refillerId,
    machineId: $machineId,
    productId: $productId,
    quantity: $quantity
  }) 
}
"""


@stock_ops_bp.route('/api/sell', methods=['POST'])
def sell_product():
    data = request.json
    try:
        machine_id = str(data.get('machineId', '')).strip()
        product_id = str(data.get('productId', '')).strip()
        qty_sold = int(data.get('qty', 1))
        selling_price = float(data.get('price', 0))

        if not machine_id or not product_id:
            return jsonify({'error': 'Machine ID and Product ID are required'}), 400

        # 1. Fetch current stock
        inv_res = execute_graphql(GET_INVENTORY_QUERY, {"machineId": machine_id, "productId": product_id})
        current_inv = inv_res.get("machineInventory")
        
        current_stock = 0
        if current_inv:
            current_stock = int(current_inv.get("currentStock", 0))
            
        new_stock = max(0, current_stock - qty_sold)

        # 2. Add Sale record
        sale_vars = {
            "machineId": machine_id,
            "productId": product_id,
            "quantitySold": qty_sold,
            "mrp": selling_price,
            "status": "SUCCESS", # Must match Enum SaleStatus format
            "transactionAt": format_timestamp(datetime.now())
        }
        execute_graphql(INSERT_SALE_MUTATION, sale_vars)

        # 3. Upsert new stock
        execute_graphql(UPSERT_INVENTORY_MUTATION, {
            "machineId": machine_id,
            "productId": product_id,
            "currentStock": new_stock
        })

        return jsonify({
            'message': f'Sold {qty_sold} {product_id} from {machine_id}',
            'new_stock': new_stock
        })

    except Exception as e:
        print(f"Error in sell_product: {e}")
        return jsonify({'error': str(e)}), 500


@stock_ops_bp.route('/api/refill', methods=['POST'])
def refill_product():
    data = request.json
    try:
        machine_id = str(data.get('machineId', '')).strip()
        product_id = str(data.get('productId', '')).strip()
        qty = int(data.get('qty', 0))
        refiller_id = str(data.get('refillerId', 'SYSTEM')).strip()

        if not machine_id or not product_id:
            return jsonify({'error': 'Machine ID and Product ID are required'}), 400

        # 1. Fetch current stock
        inv_res = execute_graphql(GET_INVENTORY_QUERY, {"machineId": machine_id, "productId": product_id})
        current_inv = inv_res.get("machineInventory")
        
        current_stock = 0
        if current_inv:
            current_stock = int(current_inv.get("currentStock", 0))
            
        new_stock = current_stock + qty

        # 2. Create Refill Log
        refill_vars = {
            "date": format_timestamp(datetime.now()),
            "refillerId": refiller_id,
            "machineId": machine_id,
            "productId": product_id,
            "quantity": qty
        }
        execute_graphql(INSERT_REFILL_MUTATION, refill_vars)

        # 3. Upsert new stock
        execute_graphql(UPSERT_INVENTORY_MUTATION, {
            "machineId": machine_id,
            "productId": product_id,
            "currentStock": new_stock
        })

        return jsonify({
            'message': f'Refilled {qty} {product_id} to {machine_id}',
            'new_stock': new_stock
        })

    except Exception as e:
        print(f"Error in refill_product: {e}")
        return jsonify({'error': str(e)}), 500


@stock_ops_bp.route('/api/update-stock', methods=['POST'])
def update_stock():
    data = request.json
    try:
        machine_id = str(data.get('machineId', '')).strip()
        product_id = str(data.get('productId', '')).strip()
        new_qty = int(data.get('qty', 0))

        if not machine_id or not product_id:
            return jsonify({'error': 'Machine ID and Product ID are required'}), 400

        execute_graphql(UPSERT_INVENTORY_MUTATION, {
            "machineId": machine_id,
            "productId": product_id,
            "currentStock": new_qty
        })

        return jsonify({'message': f'Stock updated for {machine_id}/{product_id}', 'new_qty': new_qty})

    except Exception as e:
        print(f"Error in update_stock: {e}")
        return jsonify({'error': str(e)}), 500
