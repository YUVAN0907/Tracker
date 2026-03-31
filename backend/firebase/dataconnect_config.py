import os
import json
from dotenv import load_dotenv
import google.auth
from google.oauth2 import service_account
from google.auth.transport.requests import AuthorizedSession

load_dotenv()

# Data Connect Configuration (from dataconnect.yaml)
PROJECT_ID = "vendbees-60d7b"
LOCATION = "asia-south1"
SERVICE_ID = "vendbees-60d7b-service"

# The REST endpoint for executing ad-hoc GraphQL queries against Data Connect
DATACONNECT_ENDPOINT = f"https://firebasedataconnect.googleapis.com/v1beta/projects/{PROJECT_ID}/locations/{LOCATION}/services/{SERVICE_ID}:executeGraphql"

# Make sure this points to your downloaded serviceAccountKey.json
SERVICE_ACCOUNT_FILE = os.path.join(os.path.dirname(__file__), "serviceAccountKey.json")

def get_auth_session():
    """Returns an authenticated requests block to talk to the Google API"""
    scopes = ["https://www.googleapis.com/auth/cloud-platform"]

    if os.path.exists(SERVICE_ACCOUNT_FILE):
        print("Using local serviceAccountKey.json for authentication.")
        credentials = service_account.Credentials.from_service_account_file(
            SERVICE_ACCOUNT_FILE, scopes=scopes
        )
    else:
        print("Falling back to Google Application Default Credentials.")
        credentials, project = google.auth.default(default_scopes=scopes)

    return AuthorizedSession(credentials)

auth_session = get_auth_session()
print(f"Data Connect Session initialized with endpoint: {DATACONNECT_ENDPOINT}")


class DataConnectSession:
    """Wrapper around AuthorizedSession to execute GraphQL queries against Data Connect."""
    
    def __init__(self, auth_session, endpoint):
        self.auth_session = auth_session
        self.endpoint = endpoint
    
    def execute_graphql(self, query: str, variables: dict = None):
        """Execute a GraphQL query against Data Connect.
        
        Args:
            query: GraphQL query/mutation string
            variables: Dictionary of variables for the query
            
        Returns:
            Dictionary with response data
        """
        if variables is None:
            variables = {}
        
        payload = {
            "query": query,
            "variables": variables
        }
        
        try:
            response = self.auth_session.post(
                self.endpoint,
                json=payload,
                headers={"Content-Type": "application/json"}
            )
            response.raise_for_status()
            return response.json()
        except Exception as e:
            print(f"GraphQL request failed: {e}")
            raise


def get_session():
    """Get a Data Connect session for executing GraphQL queries."""
    return DataConnectSession(auth_session, DATACONNECT_ENDPOINT)


