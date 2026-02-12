import os
import time
import threading
import requests
import pandas as pd
import numpy as np
from flask import Flask, jsonify, request
from flask_cors import CORS
from datetime import datetime
from dotenv import load_dotenv

# --------------------------------------------------
# LOAD ENV VARIABLES
# --------------------------------------------------
load_dotenv()

TENANT_ID = os.environ["SP_TENANT_ID"]
CLIENT_ID = os.environ["SP_CLIENT_ID"]
CLIENT_SECRET = os.environ["SP_CLIENT_SECRET"]
SITE_ID = os.environ["SP_SITE_ID"]
DRIVE_ID = os.environ["SP_DRIVE_ID"]
FILE_ID = os.environ["SP_FILE_ID"]

PORT = 3001
TEMP_EXCEL = "ventory_sheet.xlsx"

# --------------------------------------------------
# FLASK APP
# --------------------------------------------------
app = Flask(__name__)
CORS(app, resources={r"/api/*": {"origins": "*"}})

# --------------------------------------------------
# SHEET MAP
# --------------------------------------------------
SHEET_MAP = {
    'Products': 'Product_Master',
    'Machines': 'Machine_Master',
    'Stock': 'Current_Stock',
    'Sales': 'Sales_Log',
    'Purchases': 'Vendor_Purchase',
    'Refills': 'Machine_Refill_Log',
    'Vendors': 'Vendor_Master'
}

db = {}
last_sync = 0

# --------------------------------------------------
# SHAREPOINT AUTH
# --------------------------------------------------
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

# --------------------------------------------------
# SHAREPOINT FILE OPS
# --------------------------------------------------
def download_excel():
    token = get_access_token()
    headers = {"Authorization": f"Bearer {token}"}
    url = f"https://graph.microsoft.com/v1.0/sites/{SITE_ID}/drives/{DRIVE_ID}/items/{FILE_ID}/content"
    r = requests.get(url, headers=headers)
    r.raise_for_status()
    with open(TEMP_EXCEL, "wb") as f:
        f.write(r.content)

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

# --------------------------------------------------
# HELPERS
# --------------------------------------------------
def clean_df(df):
    if df.empty:
        return df

    df.columns = df.columns.astype(str).str.strip()
    df = df.replace({np.nan: None, np.inf: None, -np.inf: None})

    for col in df.columns:
        if df[col].dtype == "object":
            df[col] = df[col].apply(lambda x: x.strip() if isinstance(x, str) else x)

    return df.dropna(how="all")

def df_to_safe_dict(df):
    if df.empty:
        return []
    return df.replace({np.nan: None}).to_dict(orient="records")

# --------------------------------------------------
# LOAD DATA FROM SHAREPOINT
# --------------------------------------------------
def load_data():
    global db, last_sync

    try:
        download_excel()

        with pd.ExcelFile(TEMP_EXCEL, engine="openpyxl") as xls:
            for key, sheet in SHEET_MAP.items():
                if sheet in xls.sheet_names:
                    df = clean_df(pd.read_excel(xls, sheet))

                    if key == "Products" and "PRODUCT_ID" in df.columns:
                        df = df[df["PRODUCT_ID"].notna()]

                    db[key] = df.reset_index(drop=True)
                else:
                    db[key] = pd.DataFrame()

        if "Sales" in db and "Date" in db["Sales"].columns:
            db["Sales"]["Date"] = pd.to_datetime(
                db["Sales"]["Date"], errors="coerce"
            ).dt.strftime("%Y-%m-%d")

        last_sync = time.time()
        print("✔ SharePoint Excel loaded")
        return True

    except Exception as e:
        print("❌ Load failed:", e)
        return False

# --------------------------------------------------
# SAVE BACK TO SHAREPOINT
# --------------------------------------------------
def save_all():
    with pd.ExcelWriter(TEMP_EXCEL, engine="openpyxl", mode="w") as writer:
        for key, sheet in SHEET_MAP.items():
            db.get(key, pd.DataFrame()).to_excel(writer, sheet_name=sheet, index=False)
    upload_excel()

# --------------------------------------------------
# POLLING THREAD
# --------------------------------------------------
def poll_sharepoint():
    while True:
        load_data()
        time.sleep(30)

threading.Thread(target=poll_sharepoint, daemon=True).start()
load_data()

# --------------------------------------------------
# ROUTES
# --------------------------------------------------
@app.route("/api/dashboard")
def dashboard():
    products = db.get("Products", pd.DataFrame())
    machines = db.get("Machines", pd.DataFrame())
    stock = db.get("Stock", pd.DataFrame())

    # SAFE cost map (handles "-", empty, text)
    cost_map = {}
    for _, r in products.iterrows():
        pid = str(r.get("PRODUCT_ID", "")).strip()
        if not pid or pid.lower() == "nan":
            continue

        raw_cost = r.get("PO")
        try:
            cost = float(raw_cost)
        except (TypeError, ValueError):
            cost = 0.0

        cost_map[pid] = cost

    total_units = 0
    total_value = 0

    for _, r in stock.iterrows():
        qty = float(r.get("Current_Stock", 0) or 0)
        total_units += qty
        total_value += qty * cost_map.get(str(r.get("Product_ID")), 0)

    return jsonify({
        "products": df_to_safe_dict(products),
        "machines": df_to_safe_dict(machines),
        "stock": df_to_safe_dict(stock),
        "sales": df_to_safe_dict(db.get("Sales", pd.DataFrame())),
        "purchases": df_to_safe_dict(db.get("Purchases", pd.DataFrame())),
        "refills": df_to_safe_dict(db.get("Refills", pd.DataFrame())),
        "vendors": df_to_safe_dict(db.get("Vendors", pd.DataFrame())),
        "metrics": {
            "totalStockValue": round(total_value, 2),
            "totalUnits": int(total_units),
            "activeMachines": int((machines["Status"] == "Active").sum()) if not machines.empty else 0,
            "outOfStock": int((stock["Current_Stock"] <= 0).sum()) if not stock.empty else 0
        }
    })

@app.route("/api/sell", methods=["POST"])
def sell():
    d = request.json
    mid, pid, qty = d["machineId"], d["productId"], int(d.get("qty", 1))

    stock = db["Stock"]
    mask = (stock["Machine_ID"] == mid) & (stock["Product_ID"] == pid)

    if mask.any() and stock.loc[mask, "Current_Stock"].iloc[0] >= qty:
        stock.loc[mask, "Current_Stock"] -= qty

        db["Sales"] = pd.concat([db["Sales"], pd.DataFrame([{
            "Date": datetime.now().strftime("%Y-%m-%d"),
            "Machine_ID": mid,
            "Product_ID": pid,
            "Qty Sold": qty,
            "Selling_Price": d.get("price", 0)
        }])])

        save_all()
        return jsonify(success=True)

    return jsonify(error="Insufficient stock"), 400

@app.route("/api/refill", methods=["POST"])
def refill():
    d = request.json
    mid, pid, qty = d["machineId"], d["productId"], int(d["qty"])

    stock = db["Stock"]
    mask = (stock["Machine_ID"] == mid) & (stock["Product_ID"] == pid)

    if mask.any():
        stock.loc[mask, "Current_Stock"] += qty
    else:
        db["Stock"] = pd.concat([stock, pd.DataFrame([{
            "Machine_ID": mid,
            "Product_ID": pid,
            "Current_Stock": qty
        }])])

    db["Refills"] = pd.concat([db["Refills"], pd.DataFrame([{
        "Date": datetime.now().strftime("%Y-%m-%d"),
        "Refiller_ID": d.get("refillerId", "R001"),
        "Machine_ID": mid,
        "Product_ID": pid,
        "Qty": qty
    }])])

    save_all()
    return jsonify(success=True)

# --------------------------------------------------
# RUN SERVER
# --------------------------------------------------
if __name__ == "__main__":
    app.run(host="0.0.0.0", port=PORT, debug=False)
    
    
    
