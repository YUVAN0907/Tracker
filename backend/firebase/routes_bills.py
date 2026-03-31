"""
Bill History Routes
Endpoints for managing bill history, filtering, sorting
"""

from flask import Blueprint, request, jsonify
from datetime import datetime
import uuid
from auth_middleware import token_required, admin_required
import dataconnect_config

bills_bp = Blueprint('bills', __name__, url_prefix='/api/bills')


@bills_bp.route('/history', methods=['GET'])
@token_required
def get_bill_history():
    """
    Get user's bill history
    Query params: sortBy, filterDate, limit, offset
    """
    try:
        session = dataconnect_config.get_session()
        
        query = """
        query {
          billHistories {
            billId
            userId
            billNumber
            billDate
            totalAmount
            totalProducts
            totalItems
            billData
            downloadedAt
            downloadCount
            status
            createdAt
            updatedAt
          }
        }
        """
        
        response = session.execute_graphql(query)
        all_bills = response.get('data', {}).get('billHistories', [])
        
        # Filter by current user (security)
        # Only return bills created by the current user
        user_bills = [b for b in all_bills if b.get('userId') == request.user_id]
        
        # Debug logging
        print(f"[DEBUG] Retrieved {len(all_bills)} total bills, {len(user_bills)} for user {request.user_id}")
        for bill in user_bills[:1]:  # Log first bill
            bill_data = bill.get('billData', '')
            print(f"[DEBUG] Sample bill billData length: {len(bill_data) if bill_data else 0}")
            print(f"[DEBUG] Sample bill billData: {bill_data[:100] if bill_data else 'EMPTY'}")
        
        return jsonify({
            'message': 'Bill history retrieved successfully',
            'bills': user_bills,
            'count': len(user_bills)
        }), 200
    
    except Exception as e:
        print(f"Get bill history error: {str(e)}")
        return jsonify({'message': f'Failed to get bill history: {str(e)}'}), 500


@bills_bp.route('/', methods=['POST'])
@token_required
def create_bill():
    """
    Create a new bill record
    Body: {billNumber, totalAmount, totalProducts, totalItems, billData}
    """
    try:
        data = request.json
        
        if not data:
            return jsonify({'message': 'Request body is empty'}), 400
        
        bill_number = data.get('billNumber', '')
        total_amount = data.get('totalAmount', 0)
        total_products = data.get('totalProducts', 0)
        total_items = data.get('totalItems', 0)
        bill_data = data.get('billData', '')
        
        print(f"[DEBUG] Creating bill: {bill_number}")
        print(f"[DEBUG] billData length: {len(bill_data) if bill_data else 0}")
        print(f"[DEBUG] billData first 100 chars: {bill_data[:100] if bill_data else 'EMPTY'}")
        
        if not bill_number or total_amount <= 0:
            return jsonify({'message': 'Invalid bill data'}), 400
        
        session = dataconnect_config.get_session()
        
        # Create bill
        create_mutation = """
        mutation createBill(
          $billId: String!,
          $userId: String!,
          $billNumber: String!,
          $billDate: Timestamp!,
          $totalAmount: Float!,
          $totalProducts: Int!,
          $totalItems: Int!,
          $billData: String,
          $status: String!,
          $createdAt: Timestamp!,
          $updatedAt: Timestamp!
        ) {
          billHistory_insert(data: {
            billId: $billId,
            userId: $userId,
            billNumber: $billNumber,
            billDate: $billDate,
            totalAmount: $totalAmount,
            totalProducts: $totalProducts,
            totalItems: $totalItems,
            billData: $billData,
            downloadCount: 0,
            status: $status,
            createdAt: $createdAt,
            updatedAt: $updatedAt
          })
        }
        """
        
        bill_id = f"BILL_{uuid.uuid4().hex[:12].upper()}"
        now = datetime.now().isoformat() + "Z"
        
        variables = {
            "billId": bill_id,
            "userId": request.user_id,
            "billNumber": bill_number,
            "billDate": now,
            "totalAmount": float(total_amount),
            "totalProducts": int(total_products),
            "totalItems": int(total_items),
            "billData": bill_data,
            "status": "generated",
            "createdAt": now,
            "updatedAt": now
        }
        
        session.execute_graphql(create_mutation, variables)
        
        return jsonify({
            'message': 'Bill created successfully',
            'billId': bill_id,
            'billNumber': bill_number
        }), 201
    
    except Exception as e:
        print(f"Create bill error: {str(e)}")
        return jsonify({'message': f'Failed to create bill: {str(e)}'}), 500


@bills_bp.route('/<bill_id>/download', methods=['PUT'])
@token_required
def update_bill_download(bill_id):
    """
    Update bill download count and timestamp
    """
    try:
        session = dataconnect_config.get_session()
        
        # First, fetch the current download count
        query = """
        query {
          billHistories {
            billId
            downloadCount
            userId
          }
        }
        """
        
        response = session.execute_graphql(query)
        all_bills = response.get('data', {}).get('billHistories', [])
        bill = next((b for b in all_bills if b.get('billId') == bill_id), None)
        
        if not bill:
            return jsonify({'message': 'Bill not found'}), 404
        
        # Verify ownership
        if bill.get('userId') != request.user_id:
            return jsonify({'message': 'Unauthorized'}), 403
        
        current_count = bill.get('downloadCount', 0)
        new_count = current_count + 1
        now = datetime.now().isoformat() + "Z"
        
        # Update bill
        update_mutation = """
        mutation updateBillDownload(
          $billId: String!,
          $downloadedAt: Timestamp!,
          $downloadCount: Int!,
          $status: String!,
          $updatedAt: Timestamp!
        ) {
          billHistory_update(
            key: {billId: $billId},
            data: {
              downloadedAt: $downloadedAt,
              downloadCount: $downloadCount,
              status: $status,
              updatedAt: $updatedAt
            }
          )
        }
        """
        
        variables = {
            "billId": bill_id,
            "downloadedAt": now,
            "downloadCount": new_count,
            "status": "downloaded",
            "updatedAt": now
        }
        
        session.execute_graphql(update_mutation, variables)
        
        return jsonify({
            'message': 'Bill download recorded successfully',
            'downloadCount': new_count
        }), 200
    
    except Exception as e:
        print(f"Update bill download error: {str(e)}")
        return jsonify({'message': f'Failed to update bill: {str(e)}'}), 500


@bills_bp.route('/<bill_id>', methods=['DELETE'])
@token_required
def delete_bill(bill_id):
    """
    Delete a bill (only owner can delete)
    """
    try:
        session = dataconnect_config.get_session()
        
        # Verify ownership first
        query = """
        query {
          billHistories {
            billId
            userId
          }
        }
        """
        
        response = session.execute_graphql(query)
        all_bills = response.get('data', {}).get('billHistories', [])
        bill = next((b for b in all_bills if b.get('billId') == bill_id), None)
        
        if not bill:
            return jsonify({'message': 'Bill not found'}), 404
        
        if bill.get('userId') != request.user_id:
            return jsonify({'message': 'Unauthorized'}), 403
        
        # Delete bill
        delete_mutation = """
        mutation deleteBill($billId: String!) {
          billHistory_delete(key: {billId: $billId})
        }
        """
        
        variables = {"billId": bill_id}
        session.execute_graphql(delete_mutation, variables)
        
        return jsonify({
            'message': 'Bill deleted successfully'
        }), 200
    
    except Exception as e:
        print(f"Delete bill error: {str(e)}")
        return jsonify({'message': f'Failed to delete bill: {str(e)}'}), 500
