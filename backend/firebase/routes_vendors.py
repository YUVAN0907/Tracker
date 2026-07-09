from flask import Blueprint, request, jsonify
from dataconnect_db import execute_graphql
import sys
import traceback

vendors_bp = Blueprint('vendors', __name__)

# ==========================================
# GRAPHQL QUERIES / MUTATIONS
# ==========================================

GET_VENDORS_QUERY = """
query GetVendors {
  vendors(limit: 100) {
    vendorId
    vendorName
    address
    mobileNumber
    secondaryNumber
    email
    gstNo
  }
}
"""

DELETE_VENDOR_MUTATION = """
mutation DeleteVendor($vendorId: String!) {
  vendor_delete(key: { vendorId: $vendorId })
}
"""

# ==========================================
# ENDPOINTS
# ==========================================

@vendors_bp.route('/api/vendors', methods=['GET'])
def get_vendors():
    """Fetch all vendors"""
    try:
        result = execute_graphql(GET_VENDORS_QUERY)
        vendors = result.get('vendors', []) or []
        return jsonify({
            'success': True,
            'vendors': vendors,
            'count': len(vendors)
        })
    except Exception as e:
        print(f"[VENDORS] Error fetching vendors: {str(e)}", file=sys.stderr, flush=True)
        traceback.print_exc(file=sys.stderr)
        return jsonify({'error': str(e)}), 500


@vendors_bp.route('/api/vendors/delete', methods=['POST'])
def delete_vendor():
    """Delete a vendor by ID"""
    try:
        data = request.get_json()
        vendor_id = data.get('vendorId')
        
        if not vendor_id:
            return jsonify({'error': 'Vendor ID is required'}), 400
        
        # Build the GraphQL mutation
        DELETE_MUTATION = f"""mutation {{ 
            vendor_delete(key: {{ vendorId: "{vendor_id}" }})
        }}"""
        
        result = execute_graphql(DELETE_MUTATION)
        
        return jsonify({
            'success': True,
            'message': f'Vendor {vendor_id} deleted successfully',
            'vendorId': vendor_id
        })
    except Exception as e:
        error_msg = str(e)
        print(f"[VENDORS] Error deleting vendor: {error_msg}", file=sys.stderr, flush=True)
        traceback.print_exc(file=sys.stderr)
        
        # Check for foreign key constraint errors
        if 'foreign key' in error_msg.lower() or 'constraint' in error_msg.lower():
            return jsonify({
                'error': 'Cannot delete vendor: Products are still linked to this vendor. Please update or delete those products first.'
            }), 400
        
        return jsonify({'error': error_msg}), 500


@vendors_bp.route('/api/vendors/update', methods=['POST'])
def update_vendor():
    """Update vendor details"""
    try:
        data = request.get_json()
        vendor_id = data.get('vendorId')
        
        if not vendor_id:
            return jsonify({'error': 'Vendor ID is required'}), 400
        
        print(f"[VENDORS] UPDATE request data: {data}", file=sys.stderr, flush=True)
        
        # Helper function to escape strings for GraphQL (handle newlines, tabs, quotes, backslashes)
        def escape_graphql_string(s):
            s = str(s)
            # Escape backslashes first
            s = s.replace('\\', '\\\\')
            # Escape quotes
            s = s.replace('"', '\\"')
            # Escape newlines
            s = s.replace('\n', '\\n')
            # Escape carriage returns
            s = s.replace('\r', '\\r')
            # Escape tabs
            s = s.replace('\t', '\\t')
            return s
        
        vendor_name = escape_graphql_string(data.get('vendorName', ''))
        address = escape_graphql_string(data.get('address', ''))
        mobile = escape_graphql_string(data.get('mobileNumber', ''))
        secondary = escape_graphql_string(data.get('secondaryNumber', ''))
        email = escape_graphql_string(data.get('email', ''))
        gst = escape_graphql_string(data.get('gstNo', ''))
        
        mutation = f"""
        mutation {{
            vendor_update(key: {{ vendorId: "{vendor_id}" }},
            data: {{
                vendorName: "{vendor_name}",
                address: "{address}",
                mobileNumber: "{mobile}",
                secondaryNumber: "{secondary}",
                email: "{email}",
                gstNo: "{gst}"
            }})
        }}
        """
        
        print(f"[VENDORS] GraphQL mutation:\n{mutation}", file=sys.stderr, flush=True)
        
        result = execute_graphql(mutation)
        
        print(f"[VENDORS] GraphQL result: {result}", file=sys.stderr, flush=True)
        
        return jsonify({
            'success': True,
            'message': f'Vendor {vendor_id} updated successfully',
            'vendorId': vendor_id
        })
    except Exception as e:
        error_msg = str(e)
        print(f"[VENDORS] Error updating vendor: {error_msg}", file=sys.stderr, flush=True)
        traceback.print_exc(file=sys.stderr)
        return jsonify({'error': error_msg}), 500
