from flask import Blueprint, request, jsonify
from dataconnect_db import execute_graphql

# Create a Blueprint instead of importing 'app'
machine_location_bp = Blueprint('machine_location', __name__)

UPDATE_MACHINE_LOCATION_MUTATION = """
mutation UpdateMachineLocation($machineId: String!, $latitude: Float!, $longitude: Float!) {
  machine_update(
    key: {machineId: $machineId}, 
    data: {latitude: $latitude, longitude: $longitude}
  )
}
"""

@machine_location_bp.route('/update-machine-location', methods=['POST'])
def update_machine_location():
    data = request.json
    machine_id = data.get('machineId')
    latitude = data.get('latitude')
    longitude = data.get('longitude')
    
    variables = {
        "machineId": machine_id,
        "latitude": latitude,
        "longitude": longitude
    }
    
    result = execute_graphql(UPDATE_MACHINE_LOCATION_MUTATION, variables)
    return jsonify(result)
