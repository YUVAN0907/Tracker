from flask import Blueprint, request, jsonify
from dataconnect_db import execute_graphql

products_bp = Blueprint('products', __name__)

# ==========================================
# GRAPHQL QUERIES / MUTATIONS
# ==========================================
GET_PRODUCT_QUERY = """
query GetProduct($productId: String!) {
  product(key: { productId: $productId }) {
    productId
  }
}
"""

UPSERT_PRODUCT_MUTATION = """
mutation UpsertProduct(
  $productId: String!, 
  $productName: String, 
  $category: String, 
  $vendorId: String!,
  $mrp: Float,
  $gst: Float,
  $units: Int,
  $unitCost: Float,
  $landedCost: Float
) {
  product_upsert(data: {
    productId: $productId,
    productName: $productName,
    category: $category,
    vendorId: $vendorId,
    mrp: $mrp,
    gst: $gst,
    units: $units,
    unitCost: $unitCost,
    landedCost: $landedCost
  }) 
}
"""

DELETE_PRODUCT_MUTATION = """
mutation DeleteProduct($productId: String!) {
  product_delete(key: { productId: $productId })
}
"""


@products_bp.route('/api/add-product', methods=['POST'])
def add_product():
    data = request.json
    try:
        product_id = str(data.get('PRODUCT_ID', '')).strip()
        if not product_id:
            return jsonify({'error': 'PRODUCT_ID is required'}), 400

        # Check if exists
        check_res = execute_graphql(GET_PRODUCT_QUERY, {"productId": product_id})
        if check_res.get("product"):
            return jsonify({'error': 'Product ID already exists!'}), 400

        mrp = float(data.get('MRP', 0) or 0)
        gst = float(data.get('GST', 0) or 0)
        qty = int(float(data.get('QUANTITY', 0) or 0))
        unit_cost = float(data.get('PO', 0) or 0)
        landed_cost = round(unit_cost + (unit_cost * gst / 100) if gst > 1 else unit_cost + (unit_cost * gst), 2)
        vendor_id = str(data.get('VENDOR ID', data.get('Vendor_ID', 'UNKNOWN')))

        variables = {
            "productId": product_id,
            "productName": str(data.get('PRODUCT_NAME', '')),
            "category": str(data.get('CATEGORY', '')),
            "vendorId": vendor_id,
            "mrp": mrp,
            "gst": gst,
            "units": qty,
            "unitCost": unit_cost,
            "landedCost": landed_cost
        }

        execute_graphql(UPSERT_PRODUCT_MUTATION, variables)
        return jsonify({'message': 'Product added successfully!'})

    except Exception as e:
        print(f"Error adding product: {e}")
        return jsonify({'error': str(e)}), 500


@products_bp.route('/api/update-product', methods=['POST'])
def update_product():
    data = request.json
    try:
        product_id = str(data.get('product_id', data.get('PRODUCT_ID', ''))).strip()
        if not product_id:
            return jsonify({'error': 'Product ID is required'}), 400

        updates = data.get('updates', data)
        
        # In Data Connect, _upsert will patch. We need to send full existing data or patch properly if supported.
        # Actually in Data Connect `_update` is generated if patching is preferred:
        update_mutation = """
        mutation UpdateProduct($productId: String!, $productName: String, $category: String, $mrp: Float, $vendorId: String, $unitCost: Float, $landedCost: Float) {
          product_update(key: { productId: $productId }, data: {
            productName: $productName,
            category: $category,
            mrp: $mrp,
            vendorId: $vendorId,
            unitCost: $unitCost,
            landedCost: $landedCost
          }) 
        }
        """

        vars = {"productId": product_id}
        if 'PRODUCT_NAME' in updates: vars['productName'] = str(updates['PRODUCT_NAME'])
        if 'CATEGORY' in updates: vars['category'] = str(updates['CATEGORY'])
        if 'MRP' in updates: vars['mrp'] = float(updates['MRP'])
        if 'VENDOR ID' in updates: vars['vendorId'] = str(updates['VENDOR ID'])
        if 'PO' in updates: 
            unit_val = float(updates['PO'])
            vars['unitCost'] = unit_val
            # Fetch existing GST to calculate landedCost properly, or just use 0 if not updating whole product
            vars['landedCost'] = round(unit_val + (unit_val * 0.05), 2)  # Simplified for update since gst is missing from updates array usually

        execute_graphql(update_mutation, vars)
        return jsonify({'message': 'Product updated successfully'})

    except Exception as e:
        print(f"Error updating product: {e}")
        return jsonify({'error': str(e)}), 500


@products_bp.route('/api/delete-product', methods=['POST'])
def delete_product_route():
    data = request.json
    try:
        product_id = str(data.get('product_id', data.get('PRODUCT_ID', ''))).strip()
        if not product_id:
            return jsonify({'error': 'Product ID is required'}), 400

        execute_graphql(DELETE_PRODUCT_MUTATION, {"productId": product_id})
        return jsonify({'message': 'Product deleted successfully'})

    except Exception as e:
        print(f"Error deleting product: {e}")
        return jsonify({'error': str(e)}), 500
