import requests
from auth_service import AuthService
import time

BASE = 'http://127.0.0.1:3002'

# Generate tokens
user_token = AuthService.generate_jwt_token('test-user-1', 'user@example.com', 'user')
manager_token = AuthService.generate_jwt_token('test-manager-1', 'manager@example.com', 'manager')

headers_user = {'Authorization': f'Bearer {user_token}', 'Content-Type': 'application/json'}
headers_manager = {'Authorization': f'Bearer {manager_token}', 'Content-Type': 'application/json'}

def create_po(po_id):
    payload = {
        'po_id': po_id,
        'vendor_id': 'VEND-1',
        'product_id': 'PROD-1',
        'no_of_cases': 1,
        'units_per_case': 10,
        'po_price': 100.0
    }
    r = requests.post(f'{BASE}/api/create-po', json=payload, headers=headers_user)
    print('create_po', po_id, r.status_code, r.text)
    return r

def approve_po(po_id):
    r = requests.post(f'{BASE}/api/approve-po/{po_id}', headers=headers_manager)
    print('approve_po', po_id, r.status_code, r.text)
    return r

def reject_po(po_id, reason):
    r = requests.post(f'{BASE}/api/reject-po/{po_id}', json={'reason': reason}, headers=headers_manager)
    print('reject_po', po_id, r.status_code, r.text)
    return r

if __name__ == '__main__':
    print('Testing PO endpoints...')
    # Create and approve
    po1 = 'TEST-PO-001'
    create_po(po1)
    time.sleep(1)
    approve_po(po1)

    # Create and reject
    po2 = 'TEST-PO-002'
    create_po(po2)
    time.sleep(1)
    reject_po(po2, 'Invalid vendor mapping')

    print('Done')
