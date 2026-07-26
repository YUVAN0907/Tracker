from flask import Blueprint, request, jsonify
from dataconnect_db import execute_graphql

# Create a Blueprint instead of importing 'app'
machine_location_bp = Blueprint('machine_location', __name__)

UPDATE_MACHINE_LOCATION_MUTATION = """
mutation UpdateMachineLocation($machineId: String!, $location: String, $latitude: Float!, $longitude: Float!) {
  machine_update(
    key: {machineId: $machineId}, 
    data: {location: $location, latitude: $latitude, longitude: $longitude}
  ) {
    machineId
  }
}
"""

@machine_location_bp.route('/update-machine-location', methods=['POST'])
def update_machine_location():
    data = request.json
    machine_id = data.get('machineId')
    address = data.get('address')
    latitude = data.get('latitude')
    longitude = data.get('longitude')
    
    variables = {
        "machineId": machine_id,
        "latitude": latitude,
        "longitude": longitude
    }
    
    if address is not None:
        variables["location"] = address
    
    result = execute_graphql(UPDATE_MACHINE_LOCATION_MUTATION, variables)
    return jsonify(result)

UPDATE_MACHINE_STATUS_MUTATION = """
mutation UpdateMachineStatus($machineId: String!, $status: String!) {
  machine_update(
    key: {machineId: $machineId}, 
    data: {status: $status}
  ) {
    machineId
  }
}
"""

@machine_location_bp.route('/api/update-machine-status', methods=['POST'])
@machine_location_bp.route('/update-machine-status', methods=['POST'])
def update_machine_status():
    data = request.json
    machine_id = data.get('machineId')
    
    # UI sends 'status' or 'sysStatus'
    status = data.get('sysStatus') or data.get('status')
    
    if not machine_id or not status:
        return jsonify({"error": "machineId and status are required"}), 400
        
    variables = {
        "machineId": machine_id,
        "status": status
    }
    
    result = execute_graphql(UPDATE_MACHINE_STATUS_MUTATION, variables)
    return jsonify(result)
