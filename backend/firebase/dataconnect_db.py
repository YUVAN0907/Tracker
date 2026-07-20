import json
import uuid
from dataconnect_config import DATACONNECT_ENDPOINT, get_session

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
    
    print(f"[DATACONNECT] Sending payload: {json.dumps(payload, indent=2)}", flush=True)
        
    try:
        response = get_session().auth_session.post(DATACONNECT_ENDPOINT, json=payload)
        print(f"[DATACONNECT] Response status: {response.status_code}", flush=True)
        print(f"[DATACONNECT] Response text: {response.text[:500]}", flush=True)
        
        response.raise_for_status() # Raise error for non-2xx codes
        
        result = response.json()
        
        if "errors" in result:
            print(f"GraphQL Errors: {json.dumps(result['errors'], indent=2)}")
            # Raise the first error message
            error_detail = result["errors"][0]
            error_message = error_detail.get("message", "Unknown GraphQL error")
            if "locations" in error_detail:
                error_message += f" (at {error_detail['locations']})"
            raise Exception(error_message)
            
        return result.get("data", {})
        
    except Exception as e:
        print(f"Error executing GraphQL: {e}")
        if hasattr(e, 'response') and e.response:
            print(f"Response status: {e.response.status_code}")
            print(f"Response: {e.response.text[:1000]}")
        raise

# Helper to generate UUIDs exactly as expected by strictly-typed Data Connect UUID fields
def generate_uuid():
    return str(uuid.uuid4())
    
# Helper to convert dates to Data Connect timestamp format
def format_timestamp(dt_obj):
    # Data Connect expects RFC 3339 timestamps, e.g., "2024-03-15T10:00:00Z"
    return dt_obj.strftime("%Y-%m-%dT%H:%M:%SZ")


# ------------------------
# Schema introspection
# ------------------------
_schema_cache = {}

def get_type_fields(type_name: str):
    """Return a set of field names for a GraphQL type via introspection.

    Results are cached in-memory for the lifespan of the process.
    """
    if type_name in _schema_cache:
        return _schema_cache[type_name]

    introspect_query = f'''query IntrospectType {{
  __type(name: "{type_name}") {{
    name
    fields {{ name }}
  }}
}}'''

    try:
        resp = get_session().auth_session.post(DATACONNECT_ENDPOINT, json={"query": introspect_query})
        resp.raise_for_status()
        data = resp.json()
        type_info = data.get('data', {}).get('__type')
        if not type_info:
            _schema_cache[type_name] = set()
            return set()

        fields = {f.get('name') for f in type_info.get('fields', []) if f.get('name')}
        _schema_cache[type_name] = fields
        return fields
    except Exception as e:
        print(f"Introspection failed for type {type_name}: {e}")
        _schema_cache[type_name] = set()
        return set()
