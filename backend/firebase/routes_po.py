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
  $lineId: String!,
  $poId: String!,
  $productId: String!,
  $noOfCases: Int!,
  $unitsPerCase: Int!,
  $poPrice: Float!,
  $lineTotal: Float!
) {
  purchaseOrderLine_insert(data: {
    lineId: $lineId,
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
  purchaseOrderLines(where: {poId: {eq: $poId}}) {
    lineId
    poId
    productId
    noOfCases
    unitsPerCase
    poPrice
    lineTotal
    purchaseOrderHeader {
      poId
      vendorId
      createdDate
      totalAmount
      status
    }
    product {
      productName
    }
  }
}
"""

GET_ALL_POS_QUERY = """
query GetAllPOs {
  purchaseOrderHeaders {
    poId
    vendorId
    createdDate
    totalAmount
    status
  }
}
"""

GET_ALL_POS_LINES_QUERY = """
query GetAllPOLines {
  purchaseOrderLines {
    lineId
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
"""

@po_bp.route('/api/po-list', methods=['GET'])
def get_all_pos():
    """Get all purchase orders in flattened format for table display"""
    try:
        # Get all headers
        headers_res = execute_graphql(GET_ALL_POS_QUERY, {})
        po_headers = headers_res.get("purchaseOrderHeaders", [])
        
        # Get all lines
        lines_res = execute_graphql(GET_ALL_POS_LINES_QUERY, {})
        po_lines = lines_res.get("purchaseOrderLines", [])
        
        # Group lines by PO ID
        lines_by_po = {}
        for line in po_lines:
            po_id = line.get('poId', '')
            if po_id not in lines_by_po:
                lines_by_po[po_id] = []
            lines_by_po[po_id].append(line)
        
        # Flatten: each line item becomes a row with header info
        flattened_rows = []
        for header in po_headers:
            po_id = header.get('poId', '')
            lines = lines_by_po.get(po_id, [])
            
            if not lines:
                # If no lines, still add header row (shouldn't happen normally)
                flattened_rows.append({
                    'PO_ID': po_id,
                    'Vendor_ID': header.get('vendorId', ''),
                    'Created_Date': header.get('createdDate', ''),
                    'Total_Amount': header.get('totalAmount', 0),
                    'Product_ID': '',
                    'Product_Name': '',
                    'No_of_Cases': 0,
                    'Units_Per_Case': 0,
                    'PO_Price': 0,
                    'Line_Total': 0,
                    'Status': header.get('status', 'Pending')
                })
            else:
                for line in lines:
                    product = line.get('product', {})
                    line_units = line.get('noOfCases', 0) * line.get('unitsPerCase', 0)
                    flattened_rows.append({
                        'PO_ID': po_id,
                        'Vendor_ID': header.get('vendorId', ''),
                        'Created_Date': header.get('createdDate', ''),
                        'Total_Amount': header.get('totalAmount', 0),
                        'Product_ID': line.get('productId', ''),
                        'Product_Name': product.get('productName', ''),
                        'No_of_Cases': line.get('noOfCases', 0),
                        'Units_Per_Case': line.get('unitsPerCase', 0),
                        'PO_Price': line.get('poPrice', 0),
                        'Line_Total': line_units,  # Total units for this line
                        'Status': header.get('status', 'Pending')
                    })
        
        return jsonify({'data': flattened_rows})
    
    except Exception as e:
        print(f"Error fetching all POs: {e}")
        return jsonify({'error': str(e)}), 500

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
        line_id = f"{po_id}-1"  # Generate unique lineId
        line_vars = {
            "lineId": line_id,
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

        created_date = format_timestamp(datetime.now())

        # First, group items by PO_ID to calculate correct total_amount
        po_groups = {}
        for item in items:
            po_id = str(item.get('po_id', '')).strip()
            vendor_id = str(item.get('vendor_id', '')).strip()
            product_id = str(item.get('product_id', '')).strip()
            no_of_cases = int(item.get('no_of_cases', 0))
            units_per_case = int(item.get('units_per_case', 1))
            po_price = float(item.get('po_price', 0))

            if not po_id or not vendor_id or not product_id:
                continue

            line_total = no_of_cases * units_per_case * po_price

            if po_id not in po_groups:
                po_groups[po_id] = {
                    'vendor_id': vendor_id,
                    'total_amount': 0,
                    'items': []
                }

            po_groups[po_id]['total_amount'] += line_total
            po_groups[po_id]['items'].append({
                'product_id': product_id,
                'no_of_cases': no_of_cases,
                'units_per_case': units_per_case,
                'po_price': po_price,
                'line_total': no_of_cases * units_per_case
            })

        created_pos = list(po_groups.keys())

        # Now insert headers with correct total_amount (sum of all line items)
        for po_id, po_data in po_groups.items():
            header_vars = {
                "poId": po_id,
                "vendorId": po_data['vendor_id'],
                "createdDate": created_date,
                "totalAmount": po_data['total_amount'],
                "status": "Pending"
            }
            execute_graphql(INSERT_PO_HEADER_MUTATION, header_vars)

            # Insert all line items for this PO
            for idx, item in enumerate(po_data['items'], start=1):
                line_id = f"{po_id}-{idx}"  # Generate unique lineId
                line_vars = {
                    "lineId": line_id,
                    "poId": po_id,
                    "productId": item['product_id'],
                    "noOfCases": item['no_of_cases'],
                    "unitsPerCase": item['units_per_case'],
                    "poPrice": item['po_price'],
                    "lineTotal": float(item['line_total'])
                }
                execute_graphql(INSERT_PO_LINE_MUTATION, line_vars)

        return jsonify({
            'message': f'Successfully created {len(created_pos)} POs with total {sum(len(po_data["items"]) for po_data in po_groups.values())} line items!',
            'po_ids': created_pos,
            'po_count': len(created_pos),
            'total_items': sum(len(po_data['items']) for po_data in po_groups.values())
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
        po_lines = res.get("purchaseOrderLines", [])
        
        if not po_lines:
            return jsonify({'error': 'PO not found'}), 404
        
        # Get header info from first line item
        first_line = po_lines[0]
        po_header = first_line.get('purchaseOrderHeader', {})
        
        # Format items for frontend
        formatted_items = []
        for item in po_lines:
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