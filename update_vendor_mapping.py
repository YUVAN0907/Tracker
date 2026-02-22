"""
Script to update Vendor ID mapping in Product_Master sheet
Maps Product_Name in Product_Master to FLAVORS in Vendor_Master
"""
import os
import requests
import pandas as pd
from dotenv import load_dotenv

# Load .env from backend folder
load_dotenv(os.path.join(os.path.dirname(__file__), 'backend', '.env'))

TENANT_ID = os.environ["SP_TENANT_ID"]
CLIENT_ID = os.environ["SP_CLIENT_ID"]
CLIENT_SECRET = os.environ["SP_CLIENT_SECRET"]
SITE_ID = os.environ["SP_SITE_ID"]
DRIVE_ID = os.environ["SP_DRIVE_ID"]
FILE_ID = os.environ["SP_FILE_ID"]

# Use absolute path for temp file
BASE_DIR = os.path.dirname(__file__)
TEMP_FILE = os.path.join(BASE_DIR, "backend", "temp_update.xlsx")

def get_access_token():
    url = f"https://login.microsoftonline.com/{TENANT_ID}/oauth2/v2.0/token"
    data = {
        "client_id": CLIENT_ID,
        "client_secret": CLIENT_SECRET,
        "grant_type": "client_credentials",
        "scope": "https://graph.microsoft.com/.default"
    }
    r = requests.post(url, data=data)
    r.raise_for_status()
    return r.json()["access_token"]

def download_excel():
    token = get_access_token()
    headers = {"Authorization": f"Bearer {token}"}
    url = f"https://graph.microsoft.com/v1.0/sites/{SITE_ID}/drives/{DRIVE_ID}/items/{FILE_ID}/content"
    r = requests.get(url, headers=headers)
    r.raise_for_status()
    with open(TEMP_FILE, "wb") as f:
        f.write(r.content)
    print("Downloaded Excel from SharePoint")

def upload_excel():
    token = get_access_token()
    headers = {
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/octet-stream"
    }
    url = f"https://graph.microsoft.com/v1.0/sites/{SITE_ID}/drives/{DRIVE_ID}/items/{FILE_ID}/content"
    with open(TEMP_FILE, "rb") as f:
        r = requests.put(url, headers=headers, data=f)
    r.raise_for_status()
    print("Uploaded Excel to SharePoint")

def update_vendor_mapping():
    """
    Map Vendor ID to products based on FLAVORS matching product name
    """
    print("Reading Excel file...")
    
    # Load all sheets
    xls = pd.ExcelFile(TEMP_FILE)
    sheets = {}
    for sheet_name in xls.sheet_names:
        sheets[sheet_name] = pd.read_excel(xls, sheet_name=sheet_name)
    
    vm = sheets['Vendor_Master'].copy()
    pm = sheets['Product_Master'].copy()
    
    # Convert VENDOR ID column to object type to allow string values
    pm['VENDOR ID'] = pm['VENDOR ID'].astype(object)
    
    # Forward fill VENDOR ID and VENDOR in Vendor_Master to propagate to all products
    vm['VENDOR ID'] = vm['VENDOR ID'].ffill()
    vm['VENDOR'] = vm['VENDOR'].ffill()
    
    # Create a mapping: FLAVOR (uppercase) -> VENDOR ID
    flavor_to_vendor = {}
    for _, row in vm.iterrows():
        if pd.notna(row['FLAVORS']):
            flavor = str(row['FLAVORS']).upper().strip()
            vendor_id = row['VENDOR ID']
            if flavor and vendor_id and pd.notna(vendor_id):
                flavor_to_vendor[flavor] = vendor_id
    
    print(f"Created {len(flavor_to_vendor)} flavor-to-vendor mappings")
    
    # Update Product_Master with Vendor ID based on matching product name
    matched = 0
    unmatched = []
    
    for idx, row in pm.iterrows():
        product_name = str(row['PRODUCT_NAME']).upper().strip() if pd.notna(row['PRODUCT_NAME']) else ''
        
        if product_name in flavor_to_vendor:
            pm.at[idx, 'VENDOR ID'] = flavor_to_vendor[product_name]
            matched += 1
        else:
            # Leave VENDOR ID empty if no match found
            pm.at[idx, 'VENDOR ID'] = None
            if product_name:
                unmatched.append(product_name)
    
    print(f"Matched {matched} products to vendors")
    print(f"Unmatched: {len(unmatched)} products")
    
    if unmatched:
        print("\nUnmatched products (first 20):")
        for p in unmatched[:20]:
            print(f"  - {p}")
    
    # Update the sheets dictionary
    sheets['Product_Master'] = pm
    
    # Save back to Excel
    print("\nSaving to Excel...")
    with pd.ExcelWriter(TEMP_FILE, engine='openpyxl') as writer:
        for sheet_name, df in sheets.items():
            df.to_excel(writer, sheet_name=sheet_name, index=False)
    
    print("Done! Excel file updated locally.")
    return matched, len(unmatched)

def main():
    print("=" * 60)
    print("VENDOR ID MAPPING UPDATE")
    print("=" * 60)
    
    # Download latest from SharePoint
    print("\n1. Downloading from SharePoint...")
    download_excel()
    
    # Update the mapping
    print("\n2. Updating Vendor ID mapping...")
    matched, unmatched = update_vendor_mapping()
    
    # Upload back to SharePoint
    print("\n3. Uploading to SharePoint...")
    upload_excel()
    
    print("\n" + "=" * 60)
    print(f"COMPLETE! {matched} products mapped, {unmatched} unmatched")
    print("=" * 60)

if __name__ == "__main__":
    main()
