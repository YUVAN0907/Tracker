from flask import Blueprint, request, jsonify
from dataconnect_db import execute_graphql

products_bp = Blueprint('products', __name__)

# ==========================================
# GRAPHQL QUERIES / MUTATIONS
# ==========================================
GET_PRODUCT_QUERY = """
query GetProduct($productId: String!) {
  product(id: $productId) {
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
  $units: Int
) {
  product_upsert(data: {
    productId: $productId,
    productName: $productName,
    category: $category,
    vendorId: $vendorId,
    mrp: $mrp,
    gst: $gst,
    units: $units
  }) 
}
"""

DELETE_PRODUCT_MUTATION = """
mutation DeleteProduct($productId: String!) {
  product_delete(id: $productId) 
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

        # Assuming 'PO' cost maps to something else, or we just use mrp
        mrp = float(data.get('MRP', 0) or 0)
        gst = float(data.get('GST', 0) or 0)
        qty = int(float(data.get('QUANTITY', 0) or 0))
        vendor_id = str(data.get('VENDOR ID', data.get('Vendor_ID', 'UNKNOWN')))

        variables = {
            "productId": product_id,
            "productName": str(data.get('PRODUCT_NAME', '')),
            "category": str(data.get('CATEGORY', '')),
            "vendorId": vendor_id,
            "mrp": mrp,
            "gst": gst,
            "units": qty
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
        product_id = str(data.get('product_id', '')).strip()
        if not product_id:
            return jsonify({'error': 'Product ID is required'}), 400

        updates = data.get('updates', {})
        
        # In Data Connect, _upsert will patch. We need to send full existing data or patch properly if supported.
        # Actually in Data Connect `_update` is generated if patching is preferred:
        update_mutation = """
        mutation UpdateProduct($productId: String!, $productName: String, $category: String, $mrp: Float, $vendorId: String) {
          product_update(id: $productId, data: {
            productName: $productName,
            category: $category,
            mrp: $mrp,
            vendorId: $vendorId
          }) 
        }
        """

        vars = {"productId": product_id}
        if 'PRODUCT_NAME' in updates: vars['productName'] = str(updates['PRODUCT_NAME'])
        if 'CATEGORY' in updates: vars['category'] = str(updates['CATEGORY'])
        if 'MRP' in updates: vars['mrp'] = float(updates['MRP'])
        if 'VENDOR ID' in updates: vars['vendorId'] = str(updates['VENDOR ID'])

        execute_graphql(update_mutation, vars)
        return jsonify({'message': 'Product updated successfully'})

    except Exception as e:
        print(f"Error updating product: {e}")
        return jsonify({'error': str(e)}), 500


@products_bp.route('/api/delete-product', methods=['POST'])
def delete_product_route():
    data = request.json
    try:
        product_id = str(data.get('product_id', '')).strip()
        if not product_id:
            return jsonify({'error': 'Product ID is required'}), 400

        execute_graphql(DELETE_PRODUCT_MUTATION, {"productId": product_id})
        return jsonify({'message': 'Product deleted successfully'})

    except Exception as e:
        print(f"Error deleting product: {e}")
        return jsonify({'error': str(e)}), 500
