from flask import Blueprint, request, jsonify
from datetime import datetime
from dataconnect_db import execute_graphql, format_timestamp

po_bp = Blueprint('po', __name__)

# Insert Header and Line mutations (separated)
INSERT_PO_HEADER_MUTATION = """
mutation InsertPOHeader(
  $poId: String!,
  $vendorId: String!,
  $createdDate: Timestamp!,
  $totalAmount: Float!,
  $status: String!
) {
  purchaseOrderHeader_insert(data: {
    poId: $poId,
    vendorId: $vendorId,
    createdDate: $createdDate,
    totalAmount: $totalAmount,
    status: $status
  })
}
"""

INSERT_PO_LINE_MUTATION = """
mutation InsertPOLine(
  $poId: String!,
  $productId: String!,
  $noOfCases: Int!,
  $unitsPerCase: Int!,
  $poPrice: Float!,
  $lineTotal: Float!
) {
  purchaseOrderLine_insert(data: {
    poId: $poId,
    productId: $productId,
    noOfCases: $noOfCases,
    unitsPerCase: $unitsPerCase,
    poPrice: $poPrice,
    lineTotal: $lineTotal
  })
}
"""

GET_PO_ITEMS_QUERY = """
query GetPOItems($poId: String!) {
  purchaseOrderHeaders(where: {poId: {eq: $poId}}) {
    poId
    vendorId
    createdDate
    totalAmount
    status
    purchaseOrderLines {
      poId
      productId
      noOfCases
      unitsPerCase
      poPrice
      lineTotal
      product {
        productName
      }
    }
  }
}
"""

@po_bp.route('/api/create-po', methods=['POST'])
def create_single_po():
    """Create a single PO with one product"""
    data = request.json
    try:
        po_id = str(data.get('po_id', '')).strip()
        vendor_id = str(data.get('vendor_id', '')).strip()
        product_id = str(data.get('product_id', '')).strip()
        no_of_cases = int(data.get('no_of_cases', 0))
        units_per_case = int(data.get('units_per_case', 1))
        po_price = float(data.get('po_price', 0))

        if not po_id or not vendor_id or not product_id or no_of_cases <= 0:
            return jsonify({'error': 'Missing required fields or invalid quantities'}), 400

        line_total = no_of_cases * units_per_case
        total_amount = line_total * po_price
        created_date = format_timestamp(datetime.now())

        # Insert PO Header
        header_vars = {
            "poId": po_id,
            "vendorId": vendor_id,
            "createdDate": created_date,
            "totalAmount": total_amount,
            "status": "Pending"
        }
        execute_graphql(INSERT_PO_HEADER_MUTATION, header_vars)

        # Insert PO Line
        line_vars = {
            "poId": po_id,
            "productId": product_id,
            "noOfCases": no_of_cases,
            "unitsPerCase": units_per_case,
            "poPrice": po_price,
            "lineTotal": float(line_total)
        }
        execute_graphql(INSERT_PO_LINE_MUTATION, line_vars)

        return jsonify({'message': f'PO {po_id} created successfully!'})

    except Exception as e:
        print(f"Error creating PO: {e}")
        return jsonify({'error': str(e)}), 500


@po_bp.route('/api/create-multi-po', methods=['POST'])
def create_multi_po():
    """Create multiple products in a PO or multiple POs"""
    data = request.json
    try:
        items = data.get('items', [])
        if not items:
            return jsonify({'error': 'No items provided'}), 400

        created_pos = set()
        created_items = []
        created_date = format_timestamp(datetime.now())

        # Track headers to avoid duplicate inserts
        headers_inserted = {}

        for item in items:
            po_id = str(item.get('po_id', '')).strip()
            vendor_id = str(item.get('vendor_id', '')).strip()
            product_id = str(item.get('product_id', '')).strip()
            no_of_cases = int(item.get('no_of_cases', 0))
            units_per_case = int(item.get('units_per_case', 1))
            po_price = float(item.get('po_price', 0))

            if not po_id or not vendor_id or not product_id:
                continue

            # Insert header only once per PO
            if po_id not in headers_inserted:
                line_total = no_of_cases * units_per_case
                total_amount = line_total * po_price

                header_vars = {
                    "poId": po_id,
                    "vendorId": vendor_id,
                    "createdDate": created_date,
                    "totalAmount": total_amount,
                    "status": "Pending"
                }
                execute_graphql(INSERT_PO_HEADER_MUTATION, header_vars)
                headers_inserted[po_id] = True
                created_pos.add(po_id)

            # Insert line item
            line_total = no_of_cases * units_per_case
            line_vars = {
                "poId": po_id,
                "productId": product_id,
                "noOfCases": no_of_cases,
                "unitsPerCase": units_per_case,
                "poPrice": po_price,
                "lineTotal": float(line_total)
            }
            execute_graphql(INSERT_PO_LINE_MUTATION, line_vars)
            created_items.append(f"{po_id}-{product_id}")

        return jsonify({
            'message': f'Successfully created {len(created_pos)} POs with {len(created_items)} line items!',
            'po_ids': list(created_pos),
            'po_count': len(created_pos),
            'line_count': len(created_items)
        })

    except Exception as e:
        import traceback
        traceback.print_exc()
        print(f"Error creating multi PO: {e}")
        return jsonify({'error': str(e)}), 500


@po_bp.route('/api/po-items/<po_id>', methods=['GET'])
def get_po_items(po_id):
    """Get all line items for a PO"""
    try:
        res = execute_graphql(GET_PO_ITEMS_QUERY, {"poId": po_id})
        po_headers = res.get("purchaseOrderHeaders", [])
        
        if not po_headers:
            return jsonify({'error': 'PO not found'}), 404
        
        po_header = po_headers[0]
        line_items = po_header.get('purchaseOrderLines', [])
        
        # Format items for frontend
        formatted_items = []
        for item in line_items:
            product = item.get('product', {})
            formatted_items.append({
                'Product_ID': item.get('productId'),
                'Product_Name': product.get('productName', ''),
                'No_of_Cases': item.get('noOfCases'),
                'Units_Per_Case': item.get('unitsPerCase'),
                'PO_Price': item.get('poPrice'),
                'Line_Total': item.get('lineTotal'),
                'Status': po_header.get('status')
            })
        
        return jsonify({
            'po_id': po_id,
            'vendor_id': po_header.get('vendorId'),
            'created_date': po_header.get('createdDate'),
            'total_amount': po_header.get('totalAmount'),
            'status': po_header.get('status'),
            'items': formatted_items
        })

    except Exception as e:
        print(f"Error fetching PO items: {e}")
        return jsonify({'error': str(e)}), 500