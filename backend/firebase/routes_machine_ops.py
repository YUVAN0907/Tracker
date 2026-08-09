from flask import Blueprint, request, jsonify
from dataconnect_db import execute_graphql

machine_ops_bp = Blueprint('machine_ops', __name__)

ADD_MACHINE_MUTATION = """
mutation AddMachine($machineId: String!, $location: String, $status: String) {
  machine_insert(data: {
    machineId: $machineId,
    location: $location,
    status: $status
  })
}
"""

DELETE_MACHINE_MUTATION = """
mutation DeleteMachine($machineId: String!) {
  machine_delete(key: {machineId: $machineId})
}
"""

UPDATE_MACHINE_STATUS_MUTATION = """
mutation UpdateMachineStatus($machineId: String!, $status: String!) {
  machine_update(
    key: {machineId: $machineId},
    data: {status: $status}
  )
}
"""

@machine_ops_bp.route('/api/add-machine', methods=['POST', 'OPTIONS'])
def add_machine():
    if request.method == 'OPTIONS':
        return jsonify({}), 200
        
    try:
        data = request.json
        if not data or 'machineId' not in data:
            return jsonify({'error': 'Missing machineId'}), 400
            
        machine_id = data['machineId']
        location = data.get('location', '')
        status = data.get('status', 'active')
        
        execute_graphql(
            ADD_MACHINE_MUTATION,
            {
                "machineId": machine_id,
                "location": location,
                "status": status
            },
            "AddMachine"
        )
        return jsonify({'message': 'Machine added successfully'})
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@machine_ops_bp.route('/api/delete-machine', methods=['POST', 'OPTIONS'])
def delete_machine():
    if request.method == 'OPTIONS':
        return jsonify({}), 200
        
    try:
        data = request.json
        if not data or 'machineId' not in data:
            return jsonify({'error': 'Missing machineId'}), 400
            
        machine_id = data['machineId']
        
        execute_graphql(
            DELETE_MACHINE_MUTATION,
            {"machineId": machine_id},
            "DeleteMachine"
        )
        return jsonify({'message': 'Machine deleted successfully'})
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@machine_ops_bp.route('/api/update-machine-status', methods=['POST', 'OPTIONS'])
def update_machine_status():
    if request.method == 'OPTIONS':
        return jsonify({}), 200
        
    try:
        data = request.json
        if not data or 'machineId' not in data or 'status' not in data:
            return jsonify({'error': 'Missing machineId or status'}), 400
            
        machine_id = data['machineId']
        status = data['status']
        
        execute_graphql(
            UPDATE_MACHINE_STATUS_MUTATION,
            {
                "machineId": machine_id,
                "status": status
            },
            "UpdateMachineStatus"
        )
        return jsonify({'message': 'Machine status updated successfully'})
    except Exception as e:
        return jsonify({'error': str(e)}), 500
