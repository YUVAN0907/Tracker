"""
Script to clear all data from OUR_PO sheet in the inventory Excel file.
"""
import os
import requests
import pandas as pd
import numpy as np
from dotenv import load_dotenv
import tempfile

# Load .env from backend folder
script_dir = os.path.dirname(os.path.abspath(__file__))
env_path = os.path.join(script_dir, "backend", ".env")
load_dotenv(env_path)

TENANT_ID = os.environ["SP_TENANT_ID"]
CLIENT_ID = os.environ["SP_CLIENT_ID"]
CLIENT_SECRET = os.environ["SP_CLIENT_SECRET"]
SITE_ID = os.environ["SP_SITE_ID"]
DRIVE_ID = os.environ["SP_DRIVE_ID"]
FILE_ID = os.environ["SP_FILE_ID"]

TEMP_EXCEL = os.path.join(tempfile.gettempdir(), "vendbees_clear_ourpo.xlsx")

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
    r = requests.get(url, headers=headers, stream=True)
    r.raise_for_status()
    
    total_size = 0
    with open(TEMP_EXCEL, "wb") as f:
        for chunk in r.iter_content(chunk_size=8192):
            f.write(chunk)
            total_size += len(chunk)
    
    print(f"Downloaded Excel ({total_size} bytes)")
    return True

def upload_excel():
    token = get_access_token()
    headers = {
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/octet-stream"
    }
    url = f"https://graph.microsoft.com/v1.0/sites/{SITE_ID}/drives/{DRIVE_ID}/items/{FILE_ID}/content"
    with open(TEMP_EXCEL, "rb") as f:
        r = requests.put(url, headers=headers, data=f)
    r.raise_for_status()
    print("Uploaded Excel successfully")
    return True

def clear_our_po():
    # Download the file
    download_excel()
    
    # Read all sheets
    SHEET_MAP = {
        'Products': 'Product_Master',
        'Machines': 'Machine_Master',
        'Stock': 'Current_Stock',
        'Sales': 'Sales_Log',
        'Purchases': 'Vendor_Purchase',
        'Refills': 'Machine_Refill_Log',
        'Vendors': 'Vendor_Master',
        'Warehouse': 'Warehouse_Stock',
        'OUR_PO': 'OUR_PO'
    }
    
    sheets_data = {}
    with pd.ExcelFile(TEMP_EXCEL, engine="openpyxl") as xls:
        for key, sheet_name in SHEET_MAP.items():
            if sheet_name in xls.sheet_names:
                sheets_data[key] = pd.read_excel(xls, sheet_name=sheet_name)
                if key == "OUR_PO":
                    print(f"Current OUR_PO has {len(sheets_data[key])} rows")
            else:
                sheets_data[key] = pd.DataFrame()
    
    # Clear OUR_PO - keep only headers
    our_po_columns = [
        "PO_ID", "Vendor_ID", "Created_Date", "Total_Amount", "Product_ID", "Product_Name", 
        "No_of_Cases", "Units_Per_Case", "PO_Price", "Line_Total", "Status"
    ]
    sheets_data["OUR_PO"] = pd.DataFrame(columns=our_po_columns)
    print("Cleared OUR_PO sheet (kept headers only)")
    
    # Write back all sheets
    with pd.ExcelWriter(TEMP_EXCEL, engine="openpyxl", mode="w") as writer:
        for key, sheet_name in SHEET_MAP.items():
            df = sheets_data.get(key, pd.DataFrame())
            # Replace NaN with None for clean Excel output
            df = df.replace({np.nan: None, np.inf: None, -np.inf: None})
            df.to_excel(writer, sheet_name=sheet_name, index=False)
    
    # Upload back to SharePoint
    upload_excel()
    print("OUR_PO sheet cleared successfully!")

if __name__ == "__main__":
    clear_our_po()
