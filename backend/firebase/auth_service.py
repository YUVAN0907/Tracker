"""
Authentication Service
Handles user login, registration, JWT token generation, and password hashing
Uses Data Connect (GraphQL) for database operations
"""

import bcrypt
import jwt
import os
import uuid
from datetime import datetime, timedelta
from dotenv import load_dotenv
import dataconnect_config

load_dotenv()

# JWT Configuration
JWT_SECRET = os.environ.get("JWT_SECRET", "your-secret-key-change-in-production")
JWT_EXPIRY_HOURS = int(os.environ.get("JWT_EXPIRY_HOURS", 24))


class AuthService:
    """Authentication service for user login and token management"""

    @staticmethod
    def hash_password(password: str) -> str:
        """Hash a password using bcrypt"""
        salt = bcrypt.gensalt(rounds=10)
        return bcrypt.hashpw(password.encode('utf-8'), salt).decode('utf-8')

    @staticmethod
    def verify_password(password: str, password_hash: str) -> bool:
        """Verify a password against its hash"""
        try:
            return bcrypt.checkpw(password.encode('utf-8'), password_hash.encode('utf-8'))
        except Exception:
            return False

    @staticmethod
    def generate_jwt_token(user_id: str, user_email: str, role: str) -> str:
        """Generate a JWT token for authenticated user"""
        payload = {
            'userId': user_id,
            'email': user_email,
            'role': role,
            'iat': datetime.utcnow(),
            'exp': datetime.utcnow() + timedelta(hours=JWT_EXPIRY_HOURS)
        }
        token = jwt.encode(payload, JWT_SECRET, algorithm='HS256')
        return token

    @staticmethod
    def verify_jwt_token(token: str) -> dict:
        """Verify and decode a JWT token"""
        try:
            payload = jwt.decode(token, JWT_SECRET, algorithms=['HS256'])
            return payload
        except jwt.ExpiredSignatureError:
            return {'error': 'Token has expired'}
        except jwt.InvalidTokenError:
            return {'error': 'Invalid token'}

    @staticmethod
    def login(email: str, password: str) -> dict:
        """Authenticate user and return JWT token"""
        try:
            session = dataconnect_config.get_session()
            
            # GraphQL query to get all users (filter in Python)
            query = """
            query {
              users {
                userId
                email
                fullName
                passwordHash
                role
                status
              }
            }
            """
            
            response = session.execute_graphql(query)
            
            # Filter users by email in Python
            all_users = response.get('data', {}).get('users', [])
            users = [u for u in all_users if u.get('email', '').lower() == email.lower()]
            
            if not users:
                return {
                    'success': False,
                    'message': 'User not found',
                    'status': 404
                }
            
            user_data = users[0]
            
            # Check if user is active
            if user_data.get('status') != 'active':
                return {
                    'success': False,
                    'message': 'User account is inactive',
                    'status': 403
                }
            
            # Verify password
            if not AuthService.verify_password(password, user_data.get('passwordHash', '')):
                return {
                    'success': False,
                    'message': 'Invalid password',
                    'status': 401
                }
            
            # Update last login
            update_query = """
            mutation updateUserLastLogin($userId: String!, $lastLogin: Timestamp!) {
              user_update(key: {userId: $userId}, data: {lastLogin: $lastLogin})
            }
            """
            
            update_vars = {
                "userId": user_data.get('userId'),
                "lastLogin": datetime.now().isoformat() + "Z"
            }
            
            try:
                update_response = session.execute_graphql(update_query, update_vars)
                
                # Check for GraphQL errors
                if 'errors' in update_response:
                    print(f"GraphQL error updating lastLogin: {update_response['errors']}")
                    # Continue with login - don't fail due to lastLogin update
                elif not update_response.get('data', {}).get('user_update'):
                    print(f"Warning: lastLogin update returned no data for userId: {user_data.get('userId')}")
                else:
                    print(f"Successfully updated lastLogin for userId: {user_data.get('userId')}")
            except Exception as e:
                print(f"Error updating lastLogin: {str(e)}")
                # Continue with login - don't fail due to lastLogin update
            
            # Generate JWT token
            token = AuthService.generate_jwt_token(
                user_data.get('userId'),
                user_data.get('email'),
                user_data.get('role', 'user')
            )
            
            # Log the login action
            AuthService.log_audit(
                user_id=user_data.get('userId'),
                action='LOGIN',
                resource_type='user',
                resource_id=user_data.get('userId'),
                details={"email": email}
            )
            
            return {
                'success': True,
                'message': 'Login successful',
                'token': token,
                'user': {
                    'userId': user_data.get('userId'),
                    'email': user_data.get('email'),
                    'fullName': user_data.get('fullName'),
                    'role': user_data.get('role')
                },
                'status': 200
            }
        except Exception as e:
            print(f"Login error: {str(e)}")
            return {
                'success': False,
                'message': f'Login failed: {str(e)}',
                'status': 500
            }

    @staticmethod
    def register(email: str, password: str, full_name: str, created_by: str) -> dict:
        """Register a new user (admin only)"""
        try:
            email_lower = email.lower()
            session = dataconnect_config.get_session()
            
            # Check if user already exists
            check_query = """
            query {
              users {
                userId
                email
              }
            }
            """
            
            response = session.execute_graphql(check_query)
            
            # Filter users by email in Python
            all_users = response.get('data', {}).get('users', [])
            existing_users = [u for u in all_users if u.get('email', '').lower() == email_lower]
            if existing_users:
                return {
                    'success': False,
                    'message': 'Email already exists',
                    'status': 400
                }
            
            # Hash password
            password_hash = AuthService.hash_password(password)
            
            # Create new user via mutation
            create_query = """
            mutation createUser(
              $userId: String!
              $email: String!
              $fullName: String!
              $passwordHash: String!
              $role: String!
              $status: String!
              $createdAt: Timestamp!
              $createdBy: String!
              $updatedAt: Timestamp!
            ) {
              user_insert(data: {
                userId: $userId
                email: $email
                fullName: $fullName
                passwordHash: $passwordHash
                role: $role
                status: $status
                createdAt: $createdAt
                createdBy: $createdBy
                updatedAt: $updatedAt
              })
            }
            """
            
            user_id = str(uuid.uuid4())
            now = datetime.now().isoformat() + "Z"
            
            create_vars = {
                "userId": user_id,
                "email": email_lower,
                "fullName": full_name,
                "passwordHash": password_hash,
                "role": "user",
                "status": "active",
                "createdAt": now,
                "createdBy": created_by,
                "updatedAt": now
            }
            
            session.execute_graphql(create_query, create_vars)
            
            # Log the registration
            AuthService.log_audit(
                user_id=created_by,
                action='CREATE_USER',
                resource_type='user',
                resource_id=user_id,
                details={"email": email, "fullName": full_name}
            )
            
            return {
                'success': True,
                'message': 'User registered successfully',
                'userId': user_id,
                'status': 201
            }
        except Exception as e:
            print(f"Registration error: {str(e)}")
            return {
                'success': False,
                'message': f'Registration failed: {str(e)}',
                'status': 500
            }

    @staticmethod
    def log_audit(user_id: str, action: str, resource_type: str = None, 
                  resource_id: str = None, details: dict = None):
        """Log user actions for audit trail"""
        try:
            session = dataconnect_config.get_session()
            
            audit_query = """
            mutation logAudit(
              $logId: String!
              $userId: String!
              $action: String!
              $resourceType: String!
              $resourceId: String!
              $details: String!
              $timestamp: Timestamp!
            ) {
              auditLog_insert(data: {
                logId: $logId
                userId: $userId
                action: $action
                resourceType: $resourceType
                resourceId: $resourceId
                details: $details
                timestamp: $timestamp
              })
            }
            """
            
            log_id = str(uuid.uuid4())
            
            audit_vars = {
                "logId": log_id,
                "userId": user_id,
                "action": action,
                "resourceType": resource_type or "",
                "resourceId": resource_id or "",
                "details": str(details) if details else "",
                "timestamp": datetime.now().isoformat() + "Z"
            }
            
            session.execute_graphql(audit_query, audit_vars)
        except Exception as e:
            print(f"Audit logging error: {str(e)}")
