"""
Firebase Configuration
Initialize Firebase Admin SDK and export Firestore client.
"""
import os
import firebase_admin
from firebase_admin import credentials, firestore
from dotenv import load_dotenv

load_dotenv()

# Path to service account key JSON
SERVICE_ACCOUNT_KEY = os.environ.get(
    "FIREBASE_SERVICE_ACCOUNT_KEY",
    os.path.join(os.path.dirname(__file__), "serviceAccountKey.json")
)

# Firebase project ID (fallback if not in key file)
FIREBASE_PROJECT_ID = os.environ.get("FIREBASE_PROJECT_ID", "vendbees-60d7b")

def init_firebase():
    """Initialize Firebase Admin SDK and return Firestore client."""
    if not firebase_admin._apps:
        if os.path.exists(SERVICE_ACCOUNT_KEY):
            cred = credentials.Certificate(SERVICE_ACCOUNT_KEY)
            firebase_admin.initialize_app(cred, {
                "projectId": FIREBASE_PROJECT_ID
            })
            print(f"[OK] Firebase initialized with service account key")
        else:
            # Fallback: use application default credentials (for Cloud Run, etc.)
            firebase_admin.initialize_app(options={
                "projectId": FIREBASE_PROJECT_ID
            })
            print(f"[OK] Firebase initialized with application default credentials")
    
    return firestore.client()

# Initialize on import
db = init_firebase()
