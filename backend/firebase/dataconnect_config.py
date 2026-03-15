import os
import json
from dotenv import load_dotenv
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
    if not os.path.exists(SERVICE_ACCOUNT_FILE):
        raise FileNotFoundError(f"Missing service account file: {SERVICE_ACCOUNT_FILE}. Download it from Firebase Console.")
    
    # We need the dataconnect scope
    scopes = ["https://www.googleapis.com/auth/cloud-platform"]
    credentials = service_account.Credentials.from_service_account_file(
        SERVICE_ACCOUNT_FILE, scopes=scopes
    )
    
    # AuthorizedSession automatically injects the OAuth2 Bearer token into headers
    return AuthorizedSession(credentials)

auth_session = get_auth_session()
print(f"✔ Data Connect Session initialized with endpoint: {DATACONNECT_ENDPOINT}")
