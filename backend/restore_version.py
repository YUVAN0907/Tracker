"""
Script to restore previous version of the Excel file from SharePoint
"""
import os
import requests
from dotenv import load_dotenv
import tempfile

load_dotenv()

TENANT_ID = os.environ['SP_TENANT_ID']
CLIENT_ID = os.environ['SP_CLIENT_ID']
CLIENT_SECRET = os.environ['SP_CLIENT_SECRET']
SITE_ID = os.environ['SP_SITE_ID']
DRIVE_ID = os.environ['SP_DRIVE_ID']
FILE_ID = os.environ['SP_FILE_ID']

def get_access_token():
    url = f'https://login.microsoftonline.com/{TENANT_ID}/oauth2/v2.0/token'
    data = {
        'client_id': CLIENT_ID,
        'client_secret': CLIENT_SECRET,
        'grant_type': 'client_credentials',
        'scope': 'https://graph.microsoft.com/.default'
    }
    r = requests.post(url, data=data)
    return r.json()['access_token']

def list_versions():
    token = get_access_token()
    headers = {'Authorization': f'Bearer {token}'}
    versions_url = f'https://graph.microsoft.com/v1.0/sites/{SITE_ID}/drives/{DRIVE_ID}/items/{FILE_ID}/versions'
    rv = requests.get(versions_url, headers=headers)
    versions = rv.json().get('value', [])
    
    print(f'Found {len(versions)} versions:')
    for i, v in enumerate(versions[:15]):
        size = v.get('size', 'N/A')
        print(f"  [{i}] ID: {v.get('id')} - {v.get('lastModifiedDateTime')} - Size: {size} bytes")
    
    return versions

def restore_version(version_id):
    """Restore a specific version by downloading it and re-uploading as current"""
    token = get_access_token()
    headers = {'Authorization': f'Bearer {token}'}
    
    # Download the specific version
    download_url = f'https://graph.microsoft.com/v1.0/sites/{SITE_ID}/drives/{DRIVE_ID}/items/{FILE_ID}/versions/{version_id}/content'
    print(f"Downloading version {version_id}...")
    r = requests.get(download_url, headers=headers, stream=True)
    r.raise_for_status()
    
    # Save to temp file
    temp_file = os.path.join(tempfile.gettempdir(), "restore_excel.xlsx")
    total_size = 0
    with open(temp_file, "wb") as f:
        for chunk in r.iter_content(chunk_size=8192):
            f.write(chunk)
            total_size += len(chunk)
    
    print(f"Downloaded {total_size} bytes")
    
    # Upload as current version
    print("Uploading as current version...")
    upload_headers = {
        'Authorization': f'Bearer {token}',
        'Content-Type': 'application/octet-stream'
    }
    upload_url = f'https://graph.microsoft.com/v1.0/sites/{SITE_ID}/drives/{DRIVE_ID}/items/{FILE_ID}/content'
    with open(temp_file, "rb") as f:
        r = requests.put(upload_url, headers=upload_headers, data=f)
    r.raise_for_status()
    
    print("Restored successfully!")
    return True

if __name__ == "__main__":
    import sys
    
    versions = list_versions()
    
    if len(sys.argv) > 1:
        # Restore specific version by index
        idx = int(sys.argv[1])
        if 0 <= idx < len(versions):
            version_id = versions[idx]['id']
            restore_version(version_id)
        else:
            print(f"Invalid index. Use 0 to {len(versions)-1}")
    else:
        print("\nTo restore a version, run: python restore_version.py <index>")
        print("Example: python restore_version.py 1  (to restore 2nd most recent version)")
