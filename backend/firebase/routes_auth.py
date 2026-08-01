"""
Authentication Routes
Endpoints for login, register, user management, and token verification
"""

from flask import Blueprint, request, jsonify
from datetime import datetime
import uuid
from auth_service import AuthService
from auth_middleware import token_required, admin_required
import dataconnect_config

auth_bp = Blueprint('auth', __name__, url_prefix='/api/auth')


# ==============================
# LOGIN & LOGOUT
# ==============================

@auth_bp.route('/login', methods=['POST'])
def login():
    """
    User login endpoint
    Body: {email, password}
    Returns: {token, user}
    """
    try:
        data = request.json
        
        if not data:
            return jsonify({'message': 'Request body is empty'}), 400
        
        email = data.get('email', '').strip()
        password = data.get('password', '')
        
        if not email or not password:
            return jsonify({'message': 'Email and password are required'}), 400
        
        # Call auth service
        result = AuthService.login(email, password)
        
        return jsonify(result), result.get('status', 500)
    
    except Exception as e:
        print(f"Login endpoint error: {str(e)}")
        return jsonify({'message': f'Login error: {str(e)}'}), 500


@auth_bp.route('/logout', methods=['POST'])
@token_required
def logout():
    """
    User logout endpoint
    Logs the logout action
    """
    try:
        AuthService.log_audit(
            user_id=request.user_id,
            action='LOGOUT',
            resource_type='user',
            resource_id=request.user_id
        )
        
        return jsonify({
            'message': 'Logged out successfully'
        }), 200
    
    except Exception as e:
        print(f"Logout error: {str(e)}")
        return jsonify({'message': f'Logout error: {str(e)}'}), 500


# ==============================
# USER MANAGEMENT (ADMIN ONLY)
# ==============================

@auth_bp.route('/register', methods=['POST'])
@admin_required
def register():
    """
    Register a new user (ADMIN ONLY)
    Body: {email, password, fullName, role}
    Returns: {userId}
    """
    try:
        data = request.json
        
        if not data:
            return jsonify({'message': 'Request body is empty'}), 400
        
        email = data.get('email', '').strip()
        password = data.get('password', '')
        full_name = data.get('fullName', '').strip()
        role = data.get('role', 'user').strip()
        permissions = data.get('permissions', [])
        
        if not email or not password or not full_name:
            return jsonify({'message': 'Email, password, and fullName are required'}), 400
        
        if role not in ['admin', 'manager', 'user']:
            return jsonify({'message': 'Invalid role'}), 400
        
        # Register user
        result = AuthService.register(email, password, full_name, request.user_id, role, permissions=permissions)
        
        return jsonify(result), result.get('status', 500)
    
    except Exception as e:
        print(f"Register endpoint error: {str(e)}")
        return jsonify({'message': f'Registration error: {str(e)}'}), 500


@auth_bp.route('/users', methods=['GET'])
@admin_required
def get_users():
    """
    Get all users (ADMIN ONLY)
    Returns: [users]
    """
    try:
        session = dataconnect_config.get_session()
        
        query = """
        query {
          users {
            userId
            email
            fullName
            role
            status
            createdAt
            lastLogin
            permissions
          }
        }
        """
        
        response = session.execute_graphql(query)
        raw_users = response.get('data', {}).get('users', [])
        
        users = []
        for user in raw_users:
            normalized_user = dict(user)
            normalized_user['permissions'] = AuthService.normalize_permissions(user.get('permissions'))
            users.append(normalized_user)
        
        return jsonify({
            'message': 'Users retrieved successfully',
            'users': users
        }), 200
    
    except Exception as e:
        print(f"Get users error: {str(e)}")
        return jsonify({'message': f'Failed to get users: {str(e)}'}), 500


@auth_bp.route('/users/<user_id>', methods=['GET'])
@token_required
def get_user(user_id):
    """
    Get user details (ADMIN or own profile)
    Returns: {user}
    """
    try:
        # Users can only view their own profile or admins can view anyone
        if request.user_role != 'admin' and request.user_id != user_id:
            return jsonify({'message': 'Unauthorized'}), 403
        
        session = dataconnect_config.get_session()
        
        query = """
        query {
          users {
            userId
            email
            fullName
            role
            status
            createdAt
            lastLogin
            permissions
          }
        }
        """
        
        response = session.execute_graphql(query)
        
        # Filter users by userId in Python
        all_users = response.get('data', {}).get('users', [])
        users = [u for u in all_users if u.get('userId') == user_id]
        
        if not users:
            return jsonify({'message': 'User not found'}), 404
        
        user_data = dict(users[0])
        user_data['permissions'] = AuthService.normalize_permissions(user_data.get('permissions'))

        return jsonify({
            'message': 'User retrieved successfully',
            'user': user_data
        }), 200
    
    except Exception as e:
        print(f"Get user error: {str(e)}")
        return jsonify({'message': f'Failed to get user: {str(e)}'}), 500


@auth_bp.route('/users/<user_id>', methods=['PUT'])
@admin_required
def update_user(user_id):
    """
    Update user (ADMIN ONLY)
    Body: {fullName, role, status}
    Returns: {message}
    """
    try:
        data = request.json
        
        if not data:
            return jsonify({'message': 'Request body is empty'}), 400
        
        session = dataconnect_config.get_session()
        
        # Check if user exists
        check_query = """
        query {
          users {
            userId
          }
        }
        """
        
        check_response = session.execute_graphql(check_query)
        all_users = check_response.get('data', {}).get('users', [])
        user_exists = any(u.get('userId') == user_id for u in all_users)
        if not user_exists:
            return jsonify({'message': 'User not found'}), 404
        
        # Build update data
        update_data = {'updatedAt': datetime.now().isoformat() + 'Z'}
        
        if 'fullName' in data:
            update_data['fullName'] = data['fullName']
        
        if 'role' in data:
            if data['role'] not in ['admin', 'manager', 'user']:
                return jsonify({'message': 'Invalid role'}), 400
            update_data['role'] = data['role']
        
        if 'status' in data:
            if data['status'] not in ['active', 'inactive']:
                return jsonify({'message': 'Invalid status'}), 400
            update_data['status'] = data['status']

        if 'permissions' in data:
            permissions = AuthService.normalize_permissions(data.get('permissions'))
            update_data['permissions'] = AuthService.serialize_permissions(permissions)
        
        mutation = """
        mutation updateUser($userId: String!, $data: User_Data!) {
          user_update(key: {userId: $userId}, data: $data)
        }
        """
        
        variables = {
            "userId": user_id,
            "data": update_data
        }
        response = session.execute_graphql(mutation, variables)

        if 'errors' in response:
            print(f"GraphQL error updating user: {response['errors']}")
            return jsonify({'message': 'Failed to update user permissions', 'errors': response['errors']}), 500

        if not response.get('data', {}).get('user_update'):
            print(f"GraphQL update returned no user_update data: {response}")
            return jsonify({'message': 'Failed to update user permissions'}), 500
        
        # Log the update
        AuthService.log_audit(
            user_id=request.user_id,
            action='UPDATE_USER',
            resource_type='user',
            resource_id=user_id,
            details=update_data
        )
        
        return jsonify({'message': 'User updated successfully'}), 200
    
    except Exception as e:
        print(f"Update user error: {str(e)}")
        return jsonify({'message': f'Failed to update user: {str(e)}'}), 500


@auth_bp.route('/users/<user_id>', methods=['DELETE'])
@admin_required
def delete_user(user_id):
    """
    Delete user (ADMIN ONLY)
    Returns: {message}
    """
    try:
        # Prevent admin from deleting themselves
        if request.user_id == user_id:
            return jsonify({'message': 'Cannot delete your own account'}), 400
        
        session = dataconnect_config.get_session()
        
        # Check if user exists
        check_query = """
        query {
          users {
            userId
          }
        }
        """
        
        check_response = session.execute_graphql(check_query)
        all_users = check_response.get('data', {}).get('users', [])
        user_exists = any(u.get('userId') == user_id for u in all_users)
        if not user_exists:
            return jsonify({'message': 'User not found'}), 404
        
        # Delete user
        delete_mutation = """
        mutation deleteUser($userId: String!) {
          user_delete(key: {userId: $userId})
        }
        """
        
        session.execute_graphql(delete_mutation, {"userId": user_id})
        
        # Log the deletion
        AuthService.log_audit(
            user_id=request.user_id,
            action='DELETE_USER',
            resource_type='user',
            resource_id=user_id
        )
        
        return jsonify({'message': 'User deleted successfully'}), 200
    
    except Exception as e:
        print(f"Delete user error: {str(e)}")
        return jsonify({'message': f'Failed to delete user: {str(e)}'}), 500


@auth_bp.route('/change-password', methods=['POST'])
@token_required
def change_password():
    """
    Change user's own password
    Body: {currentPassword, newPassword}
    Returns: {message}
    """
    try:
        data = request.json
        
        if not data:
            return jsonify({'message': 'Request body is empty'}), 400
        
        current_password = data.get('currentPassword', '')
        new_password = data.get('newPassword', '')
        
        if not current_password or not new_password:
            return jsonify({'message': 'Current and new password are required'}), 400
        
        if len(new_password) < 6:
            return jsonify({'message': 'New password must be at least 6 characters'}), 400
        
        session = dataconnect_config.get_session()
        
        # Get current user
        query = """
        query {
          users {
            userId
            passwordHash
          }
        }
        """
        
        response = session.execute_graphql(query)
        all_users = response.get('data', {}).get('users', [])
        users = [u for u in all_users if u.get('userId') == request.user_id]
        
        if not users:
            return jsonify({'message': 'User not found'}), 404
        
        user_data = users[0]
        
        # Verify current password
        if not AuthService.verify_password(current_password, user_data.get('passwordHash', '')):
            return jsonify({'message': 'Current password is incorrect'}), 401
        
        # Hash new password
        new_password_hash = AuthService.hash_password(new_password)
        
        # Update password
        update_mutation = """
        mutation updatePassword($userId: String!, $passwordHash: String!, $updatedAt: Timestamp!) {
          user_update(key: {userId: $userId}, data: {passwordHash: $passwordHash, updatedAt: $updatedAt})
        }
        """
        
        variables = {
            "userId": request.user_id,
            "passwordHash": new_password_hash,
            "updatedAt": datetime.now().isoformat() + "Z"
        }
        session.execute_graphql(update_mutation, variables)
        
        # Log the change
        AuthService.log_audit(
            user_id=request.user_id,
            action='CHANGE_PASSWORD',
            resource_type='user',
            resource_id=request.user_id
        )
        
        return jsonify({'message': 'Password changed successfully'}), 200
    
    except Exception as e:
        print(f"Change password error: {str(e)}")
        return jsonify({'message': f'Failed to change password: {str(e)}'}), 500


@auth_bp.route('/reset-password/<user_id>', methods=['POST'])
@admin_required
def reset_password(user_id):
    """
    Reset user password (ADMIN ONLY)
    Body: {newPassword}
    Returns: {message}
    """
    try:
        data = request.json
        
        if not data:
            return jsonify({'message': 'Request body is empty'}), 400
        
        new_password = data.get('newPassword', '')
        
        if not new_password:
            return jsonify({'message': 'New password is required'}), 400
        
        if len(new_password) < 6:
            return jsonify({'message': 'New password must be at least 6 characters'}), 400
        
        session = dataconnect_config.get_session()
        
        # Check if user exists
        check_query = """
        query {
          users {
            userId
          }
        }
        """
        
        check_response = session.execute_graphql(check_query)
        all_users = check_response.get('data', {}).get('users', [])
        user_exists = any(u.get('userId') == user_id for u in all_users)
        if not user_exists:
            return jsonify({'message': 'User not found'}), 404
        
        # Hash new password
        new_password_hash = AuthService.hash_password(new_password)
        
        # Update password
        update_mutation = """
        mutation resetPassword($userId: String!, $passwordHash: String!, $updatedAt: Timestamp!) {
          user_update(key: {userId: $userId}, data: {passwordHash: $passwordHash, updatedAt: $updatedAt})
        }
        """
        
        variables = {
            "userId": user_id,
            "passwordHash": new_password_hash,
            "updatedAt": datetime.now().isoformat() + "Z"
        }
        session.execute_graphql(update_mutation, variables)
        
        # Log the reset
        AuthService.log_audit(
            user_id=request.user_id,
            action='RESET_PASSWORD',
            resource_type='user',
            resource_id=user_id
        )
        
        return jsonify({'message': 'Password reset successfully'}), 200
    
    except Exception as e:
        print(f"Reset password error: {str(e)}")
        return jsonify({'message': f'Failed to reset password: {str(e)}'}), 500


@auth_bp.route('/verify-token', methods=['GET'])
@token_required
def verify_token():
    """
    Verify JWT token validity
    Returns: {user}
    """
    try:
        session = dataconnect_config.get_session()
        query = """
        query {
          users {
            userId
            email
            fullName
            role
            status
            permissions
          }
        }
        """
        response = session.execute_graphql(query)
        all_users = response.get('data', {}).get('users', [])
        current_user = next((u for u in all_users if u.get('userId') == request.user_id), None)

        if not current_user:
            return jsonify({'message': 'User not found'}), 404

        user_data = {
            'userId': current_user.get('userId'),
            'email': current_user.get('email'),
            'fullName': current_user.get('fullName'),
            'role': current_user.get('role'),
            'status': current_user.get('status'),
            'permissions': AuthService.normalize_permissions(current_user.get('permissions'))
        }

        return jsonify({
            'message': 'Token is valid',
            'user': user_data
        }), 200
    except Exception as e:
        print(f"Verify token error: {str(e)}")
        return jsonify({'message': f'Failed to verify token: {str(e)}'}), 500
