from flask import Blueprint, request, jsonify
from datetime import datetime
from dataconnect_db import execute_graphql, format_timestamp

po_bp = Blueprint('po', __name__)

INSERT_PO_MUTATION = """
mutation InsertPO(
  $poId: String!,
  $vendorId: String!,
  $productId: String!,
  $createdDate: Timestamp!,
  $totalAmount: Float!,
  $noOfCases: Int!,
  $unitsPerCase: Int!,
  $poPrice: Float!,
  $lineTotal: Float!,
  $status: String!
) {
  purchaseOrder_insert(data: {
    poId: $poId,
    vendorId: $vendorId,
    productId: $productId,
    createdDate: $createdDate,
    totalAmount: $totalAmount,
    noOfCases: $noOfCases,
    unitsPerCase: $unitsPerCase,
    poPrice: $poPrice,
    lineTotal: $lineTotal,
    status: $status
  }) 
}
"""

GET_PO_ITEMS_QUERY = """
query GetPOItems($poId: String!) {
  purchaseOrders(where: {poId: {eq: $poId}}) {
    productId
    noOfCases
    unitsPerCase
    poPrice
    lineTotal
    status
    product {
      productName
    }
  }
}
"""

@po_bp.route('/api/create-po', methods=['POST'])
def create_single_po():
    data = request.json
    try:
        po_id = str(data.get('po_id', '')).strip()
        vendor_id = str(data.get('vendor_id', '')).strip()
        product_id = str(data.get('product_id', '')).strip()
        no_of_cases = int(data.get('no_of_cases', 0))
        units_per_case = int(data.get('units_per_case', 1))
        po_price = float(data.get('po_price', 0)) # Per unit price

        if not po_id or not vendor_id or not product_id or no_of_cases <= 0:
            return jsonify({'error': 'Missing required fields or invalid quantities'}), 400

        line_total = no_of_cases * units_per_case
        total_amount = line_total * po_price # Since poPrice is per unit

        vars = {
            "poId": po_id,
            "vendorId": vendor_id,
            "productId": product_id,
            "createdDate": format_timestamp(datetime.now()),
            "totalAmount": total_amount,
            "noOfCases": no_of_cases,
            "unitsPerCase": units_per_case,
            "poPrice": po_price,
            "lineTotal": float(line_total),
            "status": "Pending"
        }

        execute_graphql(INSERT_PO_MUTATION, vars)
        return jsonify({'message': f'PO {po_id} created successfully!'})

    except Exception as e:
        print(f"Error creating PO: {e}")
        return jsonify({'error': str(e)}), 500


@po_bp.route('/api/create-multi-po', methods=['POST'])
def create_multi_po():
    data = request.json
    try:
        items = data.get('items', [])
        if not items:
            return jsonify({'error': 'No items provided'}), 400

        # Group items by vendor to create distinct PO numbers
        vendors = {}
        for item in items:
            vid = str(item.get('vendor_id', '')).strip()
            if not vid: continue
            if vid not in vendors:
                vendors[vid] = []
            vendors[vid].append(item)

        created_pos = []
        created_date = format_timestamp(datetime.now())

        for vid, vendor_items in vendors.items():
            # Generate ID: VP-YYYYMMDD-HHMMSS-VID
            time_str = datetime.now().strftime("%Y%m%d%H%M%S")
            po_id = f"VP-{time_str}-{vid}"

            # Calculate total amount for this entire PO
            total_amount = 0
            for item in vendor_items:
                cases = int(item.get('no_of_cases', 0))
                units = int(item.get('units_per_case', 1))
                price = float(item.get('po_price', 0))
                total_amount += (cases * units * price)

            # Insert a PurchaseOrder row for each product in the PO
            for idx, item in enumerate(vendor_items):
                pid = str(item.get('product_id', '')).strip()
                cases = int(item.get('no_of_cases', 0))
                units = int(item.get('units_per_case', 1))
                price = float(item.get('po_price', 0))
                
                line_total = cases * units

                vars = {
                    "poId": po_id, # Same PO ID groups them
                    "vendorId": vid,
                    "productId": pid,
                    "createdDate": created_date,
                    "totalAmount": total_amount,
                    "noOfCases": cases,
                    "unitsPerCase": units,
                    "poPrice": price,
                    "lineTotal": float(line_total),
                    "status": "Pending"
                }
                # Since Data Connect tables generally enforce primary keys,
                # wait, if our schema key is just "poId", we can't have multiple rows with same poId!
                # Ah. `type PurchaseOrder @table(key: "poId")`
                # If the key is just poId, then a PurchaseOrder can only have ONE product!
                # Let's append an index to the poId so it can be unique per product row,
                # OR we change the schema key to `[poId, productId]`.
                # Since we cannot change the schema here, we must add the index suffix.
                
                unique_po_id = f"{po_id}-{idx}" if idx > 0 else po_id

                execute_graphql(INSERT_PO_MUTATION, vars)

            created_pos.append(po_id)

        return jsonify({
            'message': f'Successfully created {len(created_pos)} POs!',
            'po_ids': created_pos
        })

    except Exception as e:
        print(f"Error creating multi PO: {e}")
        return jsonify({'error': str(e)}), 500


@po_bp.route('/api/po-items/<po_id>', methods=['GET'])
def get_po_items(po_id):
    try:
        res = execute_graphql(GET_PO_ITEMS_QUERY, {"poId": po_id})
        items = res.get("purchaseOrders", [])
        
        # Frontend expects: product_id, product_name, no_of_cases, units_per_case, ...
        formatted_items = []
        for i in items:
            product = i.get('product', {})
            formatted_items.append({
                'Product_ID': i.get('productId'),
                'Product_Name': product.get('productName', ''),
                'No_of_Cases': i.get('noOfCases'),
                'Units_Per_Case': i.get('unitsPerCase'),
                'PO_Price': i.get('poPrice'),
                'Line_Total': i.get('lineTotal'),
                'Status': i.get('status')
            })
            
        return jsonify({'po_id': po_id, 'items': formatted_items})
    except Exception as e:
        print(f"Error fetching PO items: {e}")
        return jsonify({'error': str(e)}), 500
