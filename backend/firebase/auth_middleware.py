"""
Authentication Middleware
Provides decorators for protecting routes and checking user roles
"""

from functools import wraps
from flask import request, jsonify
from auth_service import AuthService


def token_required(f):
    """Decorator to verify JWT token in request header"""
    @wraps(f)
    def decorated(*args, **kwargs):
        token = None
        
        # Check for token in Authorization header
        if 'Authorization' in request.headers:
            auth_header = request.headers['Authorization']
            try:
                # Expected format: "Bearer <token>"
                token = auth_header.split(" ")[1]
            except IndexError:
                return jsonify({'message': 'Invalid authorization header format'}), 401
        
        if not token:
            return jsonify({'message': 'Token is missing'}), 401
        
        # Verify token
        payload = AuthService.verify_jwt_token(token)
        
        if 'error' in payload:
            return jsonify({'message': payload['error']}), 401
        
        # Store user info in request for use in route
        request.user_id = payload.get('userId')
        request.user_email = payload.get('email')
        request.user_role = payload.get('role')
        
        return f(*args, **kwargs)
    
    return decorated


def admin_required(f):
    """Decorator to verify JWT token AND admin role"""
    @wraps(f)
    def decorated(*args, **kwargs):
        token = None
        
        # Check for token in Authorization header
        if 'Authorization' in request.headers:
            auth_header = request.headers['Authorization']
            try:
                # Expected format: "Bearer <token>"
                token = auth_header.split(" ")[1]
            except IndexError:
                return jsonify({'message': 'Invalid authorization header format'}), 401
        
        if not token:
            return jsonify({'message': 'Token is missing'}), 401
        
        # Verify token
        payload = AuthService.verify_jwt_token(token)
        
        if 'error' in payload:
            return jsonify({'message': payload['error']}), 401
        
        # Check if user is admin
        if payload.get('role') != 'admin':
            return jsonify({'message': 'Admin access required'}), 403
        
        # Store user info in request for use in route
        request.user_id = payload.get('userId')
        request.user_email = payload.get('email')
        request.user_role = payload.get('role')
        
        return f(*args, **kwargs)
    
    return decorated


def manager_required(f):
    """Decorator to verify JWT token for manager or admin roles"""
    @wraps(f)
    def decorated(*args, **kwargs):
        token = None
        
        if 'Authorization' in request.headers:
            auth_header = request.headers['Authorization']
            try:
                token = auth_header.split(" ")[1]
            except IndexError:
                return jsonify({'message': 'Invalid authorization header format'}), 401
        
        if not token:
            return jsonify({'message': 'Token is missing'}), 401
        
        payload = AuthService.verify_jwt_token(token)
        
        if 'error' in payload:
            return jsonify({'message': payload['error']}), 401
        
        if payload.get('role') not in ['manager', 'admin']:
            return jsonify({'message': 'Manager access required'}), 403
        
        request.user_id = payload.get('userId')
        request.user_email = payload.get('email')
        request.user_role = payload.get('role')
        
        return f(*args, **kwargs)
    
    return decorated
