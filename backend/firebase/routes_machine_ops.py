from flask import Blueprint, request, jsonify
from dataconnect_db import execute_graphql

machine_ops_bp = Blueprint('machine_ops', __name__)

ADD_MACHINE_MUTATION = """
mutation AddMachine($machineId: String!, $location: String, $status: String, $latitude: Float, $longitude: Float, $keyNumber: String) {
  machine_upsert(data: {
    machineId: $machineId,
    location: $location,
    status: $status,
    latitude: $latitude,
    longitude: $longitude,
    keyNumber: $keyNumber
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
@machine_ops_bp.route('/api/update-machine-location', methods=['POST', 'OPTIONS'])
@machine_ops_bp.route('/update-machine-location', methods=['POST', 'OPTIONS'])
def add_machine():
    if request.method == 'OPTIONS':
        return jsonify({}), 200
        
    try:
        data = request.json
        if not data or 'machineId' not in data:
            return jsonify({'error': 'Missing machineId'}), 400
            
        machine_id = data['machineId']
        location = data.get('location') or data.get('address', '')
        status = data.get('status', 'active')
        key_number = data.get('keyNumber')
        latitude = data.get('latitude')
        longitude = data.get('longitude')
        
        variables = {
            "machineId": machine_id,
            "location": location,
            "status": status
        }
        if key_number is not None:
            variables["keyNumber"] = key_number
        if latitude is not None:
            try:
                variables["latitude"] = float(latitude)
            except (ValueError, TypeError):
                pass
        if longitude is not None:
            try:
                variables["longitude"] = float(longitude)
            except (ValueError, TypeError):
                pass
            
        execute_graphql(
            ADD_MACHINE_MUTATION,
            variables,
            "AddMachine"
        )
        return jsonify({'message': 'Machine added/updated successfully', 'success': True})
    except Exception as e:
        return jsonify({'error': str(e), 'success': False}), 500

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
