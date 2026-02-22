import os
import requests
from dotenv import load_dotenv

load_dotenv()

token_url = f"https://login.microsoftonline.com/{os.environ['SP_TENANT_ID']}/oauth2/v2.0/token"
r = requests.post(token_url, data={
    'client_id': os.environ['SP_CLIENT_ID'],
    'client_secret': os.environ['SP_CLIENT_SECRET'],
    'grant_type': 'client_credentials',
    'scope': 'https://graph.microsoft.com/.default'
})
token = r.json()['access_token']

url = f"https://graph.microsoft.com/v1.0/sites/{os.environ['SP_SITE_ID']}/drives/{os.environ['SP_DRIVE_ID']}/items/{os.environ['SP_FILE_ID']}/content"
with open('test_download.xlsx', 'rb') as f:
    r = requests.put(url, headers={'Authorization': f'Bearer {token}', 'Content-Type': 'application/octet-stream'}, data=f)
print('Upload status:', r.status_code)
print('Response:', r.text[:200] if r.text else 'OK')
