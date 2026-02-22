import os, requests
from dotenv import load_dotenv
load_dotenv('backend/.env')

TENANT_ID = os.environ['SP_TENANT_ID']
CLIENT_ID = os.environ['SP_CLIENT_ID']
CLIENT_SECRET = os.environ['SP_CLIENT_SECRET']
SITE_ID = os.environ['SP_SITE_ID']
DRIVE_ID = os.environ['SP_DRIVE_ID']
FILE_ID = os.environ['SP_FILE_ID']

url = f'https://login.microsoftonline.com/{TENANT_ID}/oauth2/v2.0/token'
data = {
    'client_id': CLIENT_ID,
    'client_secret': CLIENT_SECRET,
    'grant_type': 'client_credentials',
    'scope': 'https://graph.microsoft.com/.default'
}
r = requests.post(url, data=data)
token = r.json()['access_token']

print('Uploading to SharePoint...')
headers = {
    'Authorization': f'Bearer {token}',
    'Content-Type': 'application/octet-stream'
}
upload_url = f'https://graph.microsoft.com/v1.0/sites/{SITE_ID}/drives/{DRIVE_ID}/items/{FILE_ID}/content'
with open('backend/temp_update.xlsx', 'rb') as f:
    r = requests.put(upload_url, headers=headers, data=f)

if r.ok:
    print('Upload successful!')
else:
    print(f'Upload failed: {r.status_code}')
    print(r.text)
