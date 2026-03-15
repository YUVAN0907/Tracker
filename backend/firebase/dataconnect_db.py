import json
import uuid
from dataconnect_config import auth_session, DATACONNECT_ENDPOINT

def execute_graphql(query: str, variables: dict = None, operation_name: str = None):
    """
    Executes a raw GraphQL query or mutation against Firebase Data Connect.
    Data Connect expects the payload format {"query": "...", "variables": {...}}
    """
    payload = {
        "query": query,
        "variables": variables or {}
    }
    
    if operation_name:
        payload["operationName"] = operation_name
        
    try:
        response = auth_session.post(DATACONNECT_ENDPOINT, json=payload)
        response.raise_for_status() # Raise error for non-2xx codes
        
        result = response.json()
        
        if "errors" in result:
            print(f"GraphQL Errors: {json.dumps(result['errors'], indent=2)}")
            # Raise the first error message
            raise Exception(result["errors"][0].get("message", "Unknown GraphQL error"))
            
        return result.get("data", {})
        
    except Exception as e:
        print(f"Error executing GraphQL: {e}")
        if hasattr(e, 'response') and e.response:
            print(f"Response: {e.response.text}")
        raise

# Helper to generate UUIDs exactly as expected by strictly-typed Data Connect UUID fields
def generate_uuid():
    return str(uuid.uuid4())
    
# Helper to convert dates to Data Connect timestamp format
def format_timestamp(dt_obj):
    # Data Connect expects RFC 3339 timestamps, e.g., "2024-03-15T10:00:00Z"
    return dt_obj.strftime("%Y-%m-%dT%H:%M:%SZ")
