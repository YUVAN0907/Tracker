from flask import Blueprint, request, jsonify
from datetime import datetime
from dataconnect_db import execute_graphql, format_timestamp

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

# ==========================================
# RECENT PRODUCTS MUTATIONS
# ==========================================
CREATE_RECENT_PRODUCT_MUTATION = """
mutation CreateRecentProduct(
  $productId: String!,
  $productName: String!,
  $category: String,
  $vendorId: String,
  $unitCost: Float,
  $mrp: Float,
  $quantity: String,
  $units: Int,
  $gst: Float,
  $eanNo: String,
  $selfLife: Int,
  $createdAt: Timestamp!,
  $updatedAt: Timestamp!
) {
  recentProduct_insert(data: {
    productId: $productId,
    productName: $productName,
    category: $category,
    vendorId: $vendorId,
    unitCost: $unitCost,
    mrp: $mrp,
    quantity: $quantity,
    units: $units,
    gst: $gst,
    eanNo: $eanNo,
    selfLife: $selfLife,
    unitsPurchased: 0,
    unitsSold: 0,
    rate: 0,
    createdAt: $createdAt,
    updatedAt: $updatedAt
  })
}
"""

MOVE_TO_PRODUCT_MASTER_MUTATION = """
mutation MoveToProductMaster(
  $productId: String!,
  $productName: String!,
  $category: String,
  $vendorId: String,
  $unitCost: Float,
  $mrp: Float,
  $quantity: String,
  $units: Int,
  $gst: Float,
  $eanNo: String,
  $selfLife: Int
) {
  product_upsert(data: {
    productId: $productId,
    productName: $productName,
    category: $category,
    vendorId: $vendorId,
    unitCost: $unitCost,
    mrp: $mrp,
    quantity: $quantity,
    units: $units,
    gst: $gst,
    eanNo: $eanNo,
    selfLife: $selfLife
  })
}
"""

DELETE_RECENT_PRODUCT_MUTATION = """
mutation DeleteRecentProduct($recentProductId: UUID!) {
  recentProduct_delete(key: { recentProductId: $recentProductId })
}
"""

UPDATE_RECENT_PRODUCT_MUTATION = """
mutation UpdateRecentProduct(
  $recentProductId: UUID!,
  $productName: String,
  $category: String,
  $vendorId: String,
  $unitCost: Float,
  $mrp: Float,
  $quantity: String,
  $units: Int,
  $gst: Float,
  $eanNo: String,
  $selfLife: Int,
  $updatedAt: Timestamp!
) {
  recentProduct_update(
    key: { recentProductId: $recentProductId },
    data: {
      productName: $productName,
      category: $category,
      vendorId: $vendorId,
      unitCost: $unitCost,
      mrp: $mrp,
      quantity: $quantity,
      units: $units,
      gst: $gst,
      eanNo: $eanNo,
      selfLife: $selfLife,
      updatedAt: $updatedAt
    }
  )
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

        if qty > 0:
            warehouse_vars = {
                "productId": product_id,
                "availableUnits": qty,
                "unitsPerCase": 1,
                "notes": "Initial Stock",
                "lastReceivedDate": format_timestamp(datetime.now())
            }
            execute_graphql(UPSERT_WAREHOUSE_MUTATION, warehouse_vars)

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
        
        # Get vendor_id - if not provided, fetch from existing product
        vendor_id_provided = updates.get('VENDOR ID', updates.get('vendorId', '')).strip()
        if not vendor_id_provided:
            existing_product = execute_graphql(GET_PRODUCT_QUERY, {"productId": product_id})
            if existing_product and existing_product.get('product'):
                vendor_id_provided = existing_product['product'].get('vendorId', '')
            if not vendor_id_provided:
                return jsonify({'error': 'Vendor ID is required and product has no existing vendor ID'}), 400
        
        # Extract field values with proper parsing
        product_name = str(updates.get('PRODUCT_NAME', updates.get('productName', '')))
        category = str(updates.get('CATEGORY', updates.get('category', '')))
        
        mrp = float(updates.get('MRP', updates.get('mrp', 0)) or 0)
        
        # Handle unitCost with multiple field name formats
        unit_cost_raw = updates.get('UNIT COST', updates.get('PO', updates.get('unitCost', 0)))
        unit_cost = float(unit_cost_raw or 0)
        
        gst_raw = updates.get('GST', updates.get('gst', 0)) or 0
        gst = float(gst_raw)
        # Normalize GST to decimal (0-1) if it's given as percentage (0-100)
        if gst > 1:
            gst = gst / 100
        
        # Handle units/Stocks (unitsPerCase in database)
        units_raw = updates.get('UNITS', updates.get('units', updates.get('STOCKS', 1)))
        units = int(units_raw or 1)
        
        # Handle selfLife (in months)
        self_life = int(updates.get('SELF LIFE', updates.get('selfLife', 0)) or 0)
        
        # Handle quantity (as string)
        quantity = str(updates.get('QUANTITY', updates.get('quantity', ''))).strip()
        
        # Calculate landed cost
        landed_cost = round(unit_cost * (1 + gst), 2) if unit_cost and gst else 0
        
        # DEBUG: Log extracted values
        print(f"[PRODUCTS] Update for {product_id}:", flush=True)
        print(f"  unitCost: {unit_cost} (from: UNIT COST={updates.get('UNIT COST')}, PO={updates.get('PO')}, unitCost={updates.get('unitCost')})", flush=True)
        print(f"  gst: {gst}", flush=True)
        print(f"  units: {units}", flush=True)
        print(f"  selfLife: {self_life}", flush=True)
        print(f"  quantity: {quantity}", flush=True)
        
        # Prepare mutation variables
        variables = {
            "productId": product_id,
            "productName": product_name,
            "category": category,
            "vendorId": vendor_id_provided,
            "mrp": mrp,
            "gst": gst,
            "units": units,
            "unitCost": unit_cost,
            "landedCost": landed_cost
        }
        
        # Use UPSERT_PRODUCT_MUTATION (same as add-product, works for both create and update)
        result = execute_graphql(UPSERT_PRODUCT_MUTATION, variables)
        
        print(f"[PRODUCTS] Upsert result: {result}", flush=True)
        
        if result and result.get('errors'):
            error_msg = result['errors'][0].get('message', 'Unknown error')
            print(f"[PRODUCTS] GraphQL error: {error_msg}", flush=True)
            return jsonify({'error': f'Failed to update product: {error_msg}'}), 400
        
        return jsonify({'message': 'Product updated successfully', 'success': True})

    except Exception as e:
        error_msg = str(e)
        print(f"[PRODUCTS] Error updating product: {error_msg}", flush=True)
        import traceback
        traceback.print_exc()
        return jsonify({'error': error_msg}), 500


@products_bp.route('/api/delete-product', methods=['POST'])
def delete_product_route():
    data = request.json
    try:
        product_id = str(data.get('product_id', data.get('PRODUCT_ID', ''))).strip()
        if not product_id:
            return jsonify({'error': 'Product ID is required'}), 400

        delete_mutation = f"""
        mutation {{
            product_delete(key: {{ productId: "{product_id}" }})
        }}
        """
        
        print(f"[PRODUCTS] Delete mutation:\n{delete_mutation}", flush=True)
        result = execute_graphql(delete_mutation)
        print(f"[PRODUCTS] Delete result: {result}", flush=True)
        
        return jsonify({'message': 'Product deleted successfully', 'success': True})

    except Exception as e:
        error_msg = str(e)
        print(f"[PRODUCTS] Error deleting product: {error_msg}", flush=True)
        import traceback
        traceback.print_exc()
        
        # Check for foreign key constraint errors
        if 'foreign key' in error_msg.lower() or 'constraint' in error_msg.lower():
            return jsonify({
                'error': 'Cannot delete product: This product is referenced by other records. Please check warehouse stock, purchase orders, or batch assignments.'
            }), 400
        
        return jsonify({'error': error_msg}), 500
        return jsonify({'error': str(e)}), 500


# ==========================================
# RECENT PRODUCTS ENDPOINTS
# ==========================================

@products_bp.route('/api/recent-products/add', methods=['POST'])
def add_recent_product():
    """Add a new product to the RecentProduct table for tracking"""
    data = request.json
    try:
        product_id = str(data.get('productId', '')).strip()
        product_name = str(data.get('productName', '')).strip()
        
        if not product_id or not product_name:
            return jsonify({'error': 'Product ID and Product Name are required'}), 400
        
        # Prepare variables
        gst_value = float(data.get('gst', 0) or 0)
        if gst_value > 1:
            gst_value = gst_value / 100
        
        now = format_timestamp(datetime.now())
        
        variables = {
            "productId": product_id,
            "productName": product_name,
            "category": str(data.get('category', '')),
            "vendorId": str(data.get('vendorId', '') or ''),
            "unitCost": float(data.get('unitCost', 0) or 0),
            "mrp": float(data.get('mrp', 0) or 0),
            "quantity": str(data.get('quantity', '')),
            "units": int(data.get('units', 1) or 1),
            "gst": gst_value,
            "eanNo": str(data.get('eanNo', '')),
            "selfLife": int(data.get('selfLife', 0) or 0),
            "createdAt": now,
            "updatedAt": now
        }
        
        result = execute_graphql(CREATE_RECENT_PRODUCT_MUTATION, variables)
        
        if result and not result.get('errors'):
            return jsonify({
                'message': 'Recent product added successfully!',
                'productId': product_id
            }), 201
        else:
            error_msg = 'Failed to create recent product'
            if result and result.get('errors'):
                error_msg = result['errors'][0].get('message', error_msg)
            return jsonify({'error': error_msg}), 400
    
    except Exception as e:
        print(f"Error adding recent product: {e}")
        return jsonify({'error': str(e)}), 500


@products_bp.route('/api/recent-products/move-to-master', methods=['POST'])
def move_recent_product_to_master():
    """Move a product from RecentProduct table to Product table"""
    data = request.json
    try:
        product_id = str(data.get('productId', '')).strip()
        product_name = str(data.get('productName', '')).strip()
        recent_product_id = str(data.get('recentProductId', '')).strip()
        
        if not product_id or not product_name or not recent_product_id:
            return jsonify({'error': 'Product ID, Product Name, and Recent Product ID are required'}), 400
        
        # Prepare variables for moving to Product Master
        gst_value = float(data.get('gst', 0) or 0)
        if gst_value > 1:
            gst_value = gst_value / 100
        
        variables = {
            "productId": product_id,
            "productName": product_name,
            "category": str(data.get('category', '')),
            "vendorId": str(data.get('vendorId', '') or ''),
            "unitCost": float(data.get('unitCost', 0) or 0),
            "mrp": float(data.get('mrp', 0) or 0),
            "quantity": str(data.get('quantity', '')),
            "units": int(data.get('units', 1) or 1),
            "gst": gst_value,
            "eanNo": str(data.get('eanNo', '')),
            "selfLife": int(data.get('selfLife', 0) or 0)
        }
        
        # Insert/upsert into Product table
        product_result = execute_graphql(MOVE_TO_PRODUCT_MASTER_MUTATION, variables)
        
        if product_result and not product_result.get('errors'):
            # Delete from RecentProduct table
            delete_vars = {"recentProductId": recent_product_id}
            execute_graphql(DELETE_RECENT_PRODUCT_MUTATION, delete_vars)
            
            return jsonify({
                'message': 'Product moved to Product Master successfully!',
                'productId': product_id
            }), 200
        else:
            error_msg = 'Failed to move product to Product Master'
            if product_result and product_result.get('errors'):
                error_msg = product_result['errors'][0].get('message', error_msg)
            return jsonify({'error': error_msg}), 400
    
    except Exception as e:
        print(f"Error moving recent product to master: {e}")
        return jsonify({'error': str(e)}), 500


@products_bp.route('/api/recent-products/delete', methods=['POST'])
def delete_recent_product():
    """Delete a product from RecentProduct table"""
    data = request.json
    try:
        recent_product_id = str(data.get('recentProductId', '')).strip()
        
        if not recent_product_id:
            return jsonify({'error': 'Recent Product ID is required'}), 400
        
        delete_vars = {"recentProductId": recent_product_id}
        execute_graphql(DELETE_RECENT_PRODUCT_MUTATION, delete_vars)
        
        return jsonify({'message': 'Recent product deleted successfully'}), 200
    
    except Exception as e:
        print(f"Error deleting recent product: {e}")
        return jsonify({'error': str(e)}), 500


@products_bp.route('/api/recent-products/update', methods=['POST'])
def update_recent_product():
    """Update a product in RecentProduct table"""
    data = request.json
    try:
        recent_product_id = str(data.get('recentProductId', '')).strip()
        
        if not recent_product_id:
            return jsonify({'error': 'Recent Product ID is required'}), 400
        
        # Generate current timestamp
        now = format_timestamp(datetime.now())
        
        # Build update variables
        update_vars = {
            "recentProductId": recent_product_id,
            "productName": str(data.get('productName', '')).strip(),
            "category": str(data.get('category', '')).strip(),
            "vendorId": str(data.get('vendorId', '')).strip(),
            "unitCost": float(data.get('unitCost', 0) or 0),
            "mrp": float(data.get('mrp', 0) or 0),
            "quantity": str(data.get('quantity', '0')).strip(),
            "units": int(data.get('units', 1) or 1),
            "gst": float(data.get('gst', 0) or 0),
            "eanNo": str(data.get('eanNo', '')).strip(),
            "selfLife": int(data.get('selfLife', 0) or 0),
            "updatedAt": now
        }
        
        # Log the update attempt
        print(f"Updating recent product {recent_product_id}")
        print(f"Update vars: {update_vars}")
        
        result = execute_graphql(UPDATE_RECENT_PRODUCT_MUTATION, update_vars)
        
        print(f"GraphQL result: {result}")
        
        # Check for GraphQL errors
        if result.get('errors'):
            error_msg = result['errors'][0].get('message', 'GraphQL error')
            print(f"GraphQL error updating recent product: {error_msg}")
            return jsonify({'error': error_msg}), 400
        
        # Return the updated data along with success message
        return jsonify({
            'message': 'Recent product updated successfully',
            'updatedData': update_vars
        }), 200
    
    except Exception as e:
        print(f"Error updating recent product: {e}")
        return jsonify({'error': str(e)}), 500


@products_bp.route('/api/products/ensure-from-recent', methods=['POST'])
def ensure_product_from_recent():
    """Ensure a Recent Product exists in Product Master table before creating PO
    
    This endpoint is called before creating a PO from Recent Products to prevent
    foreign key constraint violations. It checks if the product exists in Product Master,
    and if not, creates it from the Recent Product data.
    
    Returns:
        - If product already exists: success with existing product
        - If product doesn't exist: creates it and returns success
        - Error: returns error message
    """
    data = request.json
    try:
        product_id = str(data.get('productId', '')).strip()
        
        if not product_id:
            return jsonify({'error': 'Product ID is required'}), 400
        
        # Step 1: Check if product already exists in Product Master
        query_vars = {"productId": product_id}
        result = execute_graphql(GET_PRODUCT_QUERY, query_vars)
        
        if result.get('errors'):
            error_msg = result['errors'][0].get('message', 'GraphQL query error')
            print(f"GraphQL error checking product: {error_msg}")
            return jsonify({'error': error_msg}), 400
        
        existing_product = result.get('data', {}).get('product')
        
        # If product already exists, return success
        if existing_product:
            print(f"Product {product_id} already exists in Product Master")
            return jsonify({
                'message': 'Product already exists in Product Master',
                'productId': product_id,
                'isNew': False
            }), 200
        
        # Step 2: Product doesn't exist, so create it from Recent Product data
        print(f"Creating new product {product_id} in Product Master from Recent Product data")
        
        vendor_id = str(data.get('vendorId', '')).strip()
        if not vendor_id:
            return jsonify({'error': 'Vendor ID is required to create product'}), 400
        
        upsert_vars = {
            "productId": product_id,
            "productName": str(data.get('productName', '')).strip(),
            "category": str(data.get('category', '')).strip(),
            "vendorId": vendor_id,
            "unitCost": float(data.get('unitCost', 0) or 0),
            "mrp": float(data.get('mrp', 0) or 0),
            "gst": float(data.get('gst', 0) or 0),
            "units": int(data.get('units', 1) or 1),
            "landedCost": float(data.get('unitCost', 0) or 0)  # Use unitCost as landedCost
        }
        
        result = execute_graphql(UPSERT_PRODUCT_MUTATION, upsert_vars)
        
        if result.get('errors'):
            error_msg = result['errors'][0].get('message', 'GraphQL mutation error')
            print(f"GraphQL error creating product: {error_msg}")
            return jsonify({'error': error_msg}), 400
        
        return jsonify({
            'message': 'Product created successfully in Product Master',
            'productId': product_id,
            'isNew': True
        }), 200
    
    except Exception as e:
        print(f"Error ensuring product from recent: {e}")
        return jsonify({'error': str(e)}), 500

