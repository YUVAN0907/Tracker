from flask import Blueprint, request, jsonify
from datetime import datetime
from dataconnect_db import execute_graphql, format_timestamp

purchases_bp = Blueprint('purchases', __name__)

INSERT_VENDOR_PURCHASE_MUTATION = """
mutation InsertVendorPurchase(
  $poId: String!,
  $vendorId: String!,
  $productId: String!,
  $batch: Int,
  $unitsPerCase: Int,
  $caseCount: Int,
  $totalUnits: Int,
  $mrp: Float,
  $poPrice: Float,
  $paymentMode: String,
  $paymentStatus: String,
  $gstFiled: Boolean
) {
  vendorPurchase_insert(data: {
    poId: $poId,
    vendorId: $vendorId,
    productId: $productId,
    batch: $batch,
    unitsPerCase: $unitsPerCase,
    caseCount: $caseCount,
    totalUnits: $totalUnits,
    mrp: $mrp,
    poPrice: $poPrice,
    paymentMode: $paymentMode,
    paymentStatus: $paymentStatus,
    gstFiled: $gstFiled
  }) 
}
"""

INSERT_PURCHASED_PRODUCT_MUTATION = """
mutation InsertPurchasedProduct(
  $poId: String,
  $productId: String,
  $unitsPerCase: Int,
  $availableUnits: Int,
  $batch: Int,
  $receivedDate: Timestamp
) {
  purchasedProduct_insert(data: {
    poId: $poId,
    productId: $productId,
    unitsPerCase: $unitsPerCase,
    availableUnits: $availableUnits,
    batch: $batch,
    receivedDate: $receivedDate
  }) 
}
"""

GET_PO_QUERY = """
query GetPOStatus($poId: String!) {
  purchaseOrder(id: $poId) {
    status
  }
}
"""

UPDATE_PO_STATUS_MUTATION = """
mutation UpdatePOStatus($poId: String!, $status: String!) {
  purchaseOrder_update(id: $poId, data: { status: $status }) 
}
"""

@purchases_bp.route('/api/vendor-purchases', methods=['GET'])
def get_vendor_purchases():
    # Actually fetched via dashboard, so we bypass this or just return empty
    # In dashboard we already map VendorPurchases
    return jsonify({"purchases": []})

@purchases_bp.route('/api/record-delivery', methods=['POST'])
def record_delivery():
    data = request.json
    try:
        po_id = str(data.get('po_id', '')).strip()
        items = data.get('items', [])
        
        if not po_id or not items:
            return jsonify({'error': 'PO ID and items are required'}), 400

        # Create vendor purchase record AND purchased product for each item
        for item in items:
            product_id = str(item.get('product_id', '')).strip()
            vendor_id = str(item.get('vendor_id', '')).strip()
            cases_rec = int(item.get('cases_received', 0))
            units_per_case = int(item.get('units_per_case', 1))
            mrp = float(item.get('mrp', 0))
            po_price = float(item.get('po_price', 0))
            batch = item.get('batch')
            try: batch = int(batch)
            except: batch = 1

            total_units = cases_rec * units_per_case

            # 1. Insert into VendorPurchase
            vp_vars = {
                "poId": po_id,
                "vendorId": vendor_id,
                "productId": product_id,
                "batch": batch,
                "unitsPerCase": units_per_case,
                "caseCount": cases_rec,
                "totalUnits": total_units,
                "mrp": mrp,
                "poPrice": po_price,
                "paymentMode": "Pending",
                "paymentStatus": "Pending",
                "gstFiled": False
            }
            execute_graphql(INSERT_VENDOR_PURCHASE_MUTATION, vp_vars)

            # 2. Add to PurchasedProducts so warehouse can pull it
            if total_units > 0:
                pp_vars = {
                    "poId": po_id,
                    "productId": product_id,
                    "unitsPerCase": units_per_case,
                    "availableUnits": total_units,
                    "batch": batch,
                    "receivedDate": format_timestamp(datetime.now())
                }
                execute_graphql(INSERT_PURCHASED_PRODUCT_MUTATION, pp_vars)

        # 3. Update PO status to 'Delivered'
        execute_graphql(UPDATE_PO_STATUS_MUTATION, {"poId": po_id, "status": "Delivered"})

        return jsonify({'message': f'Delivery recorded for PO {po_id}'})

    except Exception as e:
        import traceback
        traceback.print_exc()
        return jsonify({'error': str(e)}), 500


@purchases_bp.route('/api/generate-vendor-po-ids', methods=['POST'])
def generate_vendor_po_ids():
    data = request.json
    try:
        vendor_ids = data.get('vendorIds', [])
        po_ids = {}
        time_str = datetime.now().strftime("%Y%m%d%A%B").upper() # Just a dummy unique string
        for vid in vendor_ids:
            po_ids[vid] = f"VP-{time_str}-{vid}"
        return jsonify({'po_ids': po_ids})
    except Exception as e:
        return jsonify({'error': str(e)}), 500
