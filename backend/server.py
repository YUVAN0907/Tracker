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
# Use Windows temp folder to avoid OneDrive sync issues
import tempfile
TEMP_EXCEL = os.path.join(tempfile.gettempdir(), "vendbees_temp_update.xlsx")

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
    'Vendors': 'Vendor_Master',
    'Warehouse': 'Warehouse_Stock',
    'OUR_PO': 'OUR_PO'
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
    # Use streaming to avoid file corruption on Windows
    r = requests.get(url, headers=headers, stream=True)
    r.raise_for_status()
    
    # Write using streaming chunks
    total_size = 0
    with open(TEMP_EXCEL, "wb") as f:
        for chunk in r.iter_content(chunk_size=8192):
            f.write(chunk)
            total_size += len(chunk)
    
    # Verify file was written
    if total_size < 1000:
        raise Exception(f"Downloaded file too small: {total_size} bytes")
    
    print(f"✔ Downloaded Excel to {TEMP_EXCEL} ({total_size} bytes)")

def upload_excel(max_retries=3, retry_delay=2):
    """Upload Excel to SharePoint with retry logic for locked files"""
    for attempt in range(max_retries):
        try:
            token = get_access_token()
            headers = {
                "Authorization": f"Bearer {token}",
                "Content-Type": "application/octet-stream"
            }
            url = f"https://graph.microsoft.com/v1.0/sites/{SITE_ID}/drives/{DRIVE_ID}/items/{FILE_ID}/content"
            with open(TEMP_EXCEL, "rb") as f:
                r = requests.put(url, headers=headers, data=f)
            
            if r.status_code == 423:
                # File is locked - retry after delay
                if attempt < max_retries - 1:
                    print(f"⚠ File locked, retrying in {retry_delay}s... (attempt {attempt + 1}/{max_retries})")
                    time.sleep(retry_delay)
                    retry_delay *= 2  # Exponential backoff
                    continue
                else:
                    raise Exception("SharePoint file is locked. Please close the Excel file and try again.")
            
            r.raise_for_status()
            return True
        except requests.exceptions.HTTPError as e:
            if "423" in str(e) and attempt < max_retries - 1:
                print(f"⚠ File locked, retrying in {retry_delay}s... (attempt {attempt + 1}/{max_retries})")
                time.sleep(retry_delay)
                retry_delay *= 2
                continue
            raise
    return False

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

        # Ensure OUR_PO has correct columns (add missing ones in memory only - don't save on load)
        if "OUR_PO" in db:
            our_po = db["OUR_PO"]
            expected_columns = [
                "PO_ID", "Vendor_ID", "Created_Date", "Total_Amount", "Product_ID", "Product_Name", 
                "No_of_Cases", "Units_Per_Case", "PO_Price", "Line_Total", "Status"
            ]
            
            # Only add missing columns in memory (no save on load to avoid corruption)
            if our_po.empty:
                our_po = pd.DataFrame(columns=expected_columns)
            else:
                for col in expected_columns:
                    if col not in our_po.columns:
                        if col == "Status":
                            our_po[col] = "Pending"
                        elif col == "Line_Total":
                            our_po[col] = our_po.apply(
                                lambda r: int(r.get("No_of_Cases", 0) or 0) * int(r.get("Units_Per_Case", 1) or 1), 
                                axis=1
                            )
                        else:
                            our_po[col] = None  # Use None instead of empty string
                
                # Ensure column order (in memory)
                our_po = our_po[[col for col in expected_columns if col in our_po.columns]]
            
            db["OUR_PO"] = our_po
        print("✔ SharePoint Excel loaded")
        return True

    except Exception as e:
        print("❌ Load failed:", e)
        return False

# --------------------------------------------------
# SAVE BACK TO SHAREPOINT
# --------------------------------------------------
def save_all():
    """Save data to Excel and upload to SharePoint. Raises exception if file is locked."""
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

    # Process OUR_PO to propagate common fields to all rows (like /api/our-pos does)
    our_po = db.get("OUR_PO", pd.DataFrame())
    our_pos_enriched = []
    
    if not our_po.empty:
        # Helper to check if PO_ID is valid
        def is_valid_po_id(val):
            if pd.isna(val):
                return False
            val_str = str(val).strip()
            return val_str and val_str not in ("nan", "None", "")
        
        # First pass: collect common fields for each PO
        po_common_fields = {}
        current_po_id = None
        
        for _, row in our_po.iterrows():
            po_id_val = row.get("PO_ID")
            if is_valid_po_id(po_id_val):
                current_po_id = str(po_id_val).strip()
                po_common_fields[current_po_id] = {
                    "PO_ID": current_po_id,
                    "Vendor_ID": str(row.get("Vendor_ID", "")).strip() if pd.notna(row.get("Vendor_ID")) else "",
                    "Created_Date": str(row.get("Created_Date", "")).strip() if pd.notna(row.get("Created_Date")) else "",
                    "Total_Amount": float(row.get("Total_Amount", 0) or 0) if pd.notna(row.get("Total_Amount")) else 0,
                    "Status": str(row.get("Status", "Pending")).strip() or "Pending"
                }
        
        # Second pass: build enriched rows
        current_po_id = None
        for _, row in our_po.iterrows():
            po_id_val = row.get("PO_ID")
            if is_valid_po_id(po_id_val):
                current_po_id = str(po_id_val).strip()
            
            if not current_po_id:
                continue
            
            common = po_common_fields.get(current_po_id, {})
            our_pos_enriched.append({
                "PO_ID": common.get("PO_ID", ""),
                "Vendor_ID": common.get("Vendor_ID", ""),
                "Created_Date": common.get("Created_Date", ""),
                "Total_Amount": common.get("Total_Amount", 0),
                "Product_ID": str(row.get("Product_ID", "")).strip() if pd.notna(row.get("Product_ID")) else "",
                "Product_Name": str(row.get("Product_Name", "")).strip() if pd.notna(row.get("Product_Name")) else "",
                "No_of_Cases": int(row.get("No_of_Cases", 0) or 0) if pd.notna(row.get("No_of_Cases")) else 0,
                "Units_Per_Case": int(row.get("Units_Per_Case", 1) or 1) if pd.notna(row.get("Units_Per_Case")) else 1,
                "PO_Price": float(row.get("PO_Price", 0) or 0) if pd.notna(row.get("PO_Price")) else 0,
                "Line_Total": float(row.get("Line_Total", 0) or 0) if pd.notna(row.get("Line_Total")) else 0,
                "Status": common.get("Status", "Pending")
            })

    return jsonify({
        "products": df_to_safe_dict(products),
        "machines": df_to_safe_dict(machines),
        "stock": df_to_safe_dict(stock),
        "sales": df_to_safe_dict(db.get("Sales", pd.DataFrame())),
        "purchases": df_to_safe_dict(db.get("Purchases", pd.DataFrame())),
        "refills": df_to_safe_dict(db.get("Refills", pd.DataFrame())),
        "vendors": df_to_safe_dict(db.get("Vendors", pd.DataFrame())),
        "warehouse": df_to_safe_dict(db.get("Warehouse", pd.DataFrame())),
        "our_pos": our_pos_enriched,
        "metrics": {
            "totalStockValue": round(total_value, 2),
            "totalUnits": int(total_units),
            "activeMachines": int((machines["Status"] == "Active").sum()) if not machines.empty else 0,
            "outOfStock": int((stock["Current_Stock"] <= 0).sum()) if not stock.empty else 0
        }
    })

@app.route("/api/add-product", methods=["POST"])
def add_product():
    """Add a new product to Product_Master"""
    try:
        d = request.json
        product_id = d.get("Product_ID", "").strip()
        name = d.get("Name", "").strip()
        
        if not product_id or not name:
            return jsonify(error="Product ID and Name are required"), 400
        
        products = db.get("Products", pd.DataFrame())
        
        # Check for duplicate Product_ID
        if not products.empty and "PRODUCT_ID" in products.columns:
            if product_id in products["PRODUCT_ID"].astype(str).values:
                return jsonify(error=f"Product ID '{product_id}' already exists"), 400
        
        # Create new product row matching Excel column names
        new_product = pd.DataFrame([{
            "PRODUCT_ID": product_id,
            "PRODUCT_NAME": name,
            "CATEGORY": d.get("Category", "Others"),
            "PO": float(d.get("Unit_Cost", 0)),
            "GST": float(d.get("GST", 0)),
            "MRP": float(d.get("MRP", 0)),
            "QUANTITY": int(d.get("Quantity", 0))
        }])
        
        db["Products"] = pd.concat([products, new_product], ignore_index=True)
        save_all()
        
        return jsonify(success=True, message=f"Product '{name}' added successfully")
    except Exception as e:
        return jsonify(error=str(e)), 500

@app.route("/api/update-product", methods=["POST"])
def update_product():
    """Update an existing product in Product_Master"""
    try:
        d = request.json
        product_id = d.get("Product_ID", "").strip()
        
        if not product_id:
            return jsonify(error="Product ID is required"), 400
        
        products = db.get("Products", pd.DataFrame())
        
        if products.empty or "PRODUCT_ID" not in products.columns:
            return jsonify(error="No products found"), 404
        
        mask = products["PRODUCT_ID"].astype(str) == product_id
        if not mask.any():
            return jsonify(error=f"Product '{product_id}' not found"), 404
        
        # Update the product
        if "Name" in d:
            products.loc[mask, "PRODUCT_NAME"] = d["Name"]
        if "Category" in d:
            products.loc[mask, "CATEGORY"] = d["Category"]
        if "Unit_Cost" in d:
            products.loc[mask, "PO"] = float(d["Unit_Cost"])
        if "GST" in d:
            products.loc[mask, "GST"] = float(d["GST"])
        if "MRP" in d:
            products.loc[mask, "MRP"] = float(d["MRP"])
        if "Quantity" in d:
            products.loc[mask, "QUANTITY"] = int(d["Quantity"])
        
        db["Products"] = products
        save_all()
        
        return jsonify(success=True, message=f"Product '{product_id}' updated successfully")
    except Exception as e:
        return jsonify(error=str(e)), 500

@app.route("/api/delete-product", methods=["POST"])
def delete_product():
    """Delete a product from Product_Master"""
    try:
        d = request.json
        product_id = d.get("Product_ID", "").strip()
        
        if not product_id:
            return jsonify(error="Product ID is required"), 400
        
        products = db.get("Products", pd.DataFrame())
        
        if products.empty or "PRODUCT_ID" not in products.columns:
            return jsonify(error="No products found"), 404
        
        mask = products["PRODUCT_ID"].astype(str) == product_id
        if not mask.any():
            return jsonify(error=f"Product '{product_id}' not found"), 404
        
        db["Products"] = products[~mask].reset_index(drop=True)
        save_all()
        
        return jsonify(success=True, message=f"Product '{product_id}' deleted successfully")
    except Exception as e:
        return jsonify(error=str(e)), 500

@app.route("/api/create-po", methods=["POST"])
def create_po():
    """Create a new purchase order"""
    try:
        d = request.json
        product_id = str(d.get("product_id", "")).strip()
        vendor_id = str(d.get("vendor_id", "")).strip()
        qty = int(d.get("qty", 0))
        units_per_case = int(d.get("units_per_case", 1))
        po_price = float(d.get("po_price", 0))
        notes = d.get("notes", "")
        
        if not product_id or not vendor_id:
            return jsonify(error="Product ID and Vendor ID are required"), 400
        
        purchases = db.get("Purchases", pd.DataFrame())
        
        # Generate PO number
        po_count = len(purchases) + 1 if not purchases.empty else 1
        po_number = f"PO-{datetime.now().strftime('%Y%m')}-{po_count:03d}"
        
        # Create new PO row matching Excel column names for Vendor_Purchase
        new_po = pd.DataFrame([{
            "PO Bill": po_number,
            "Date": datetime.now().strftime("%Y-%m-%d"),
            "Vendor_ID": vendor_id,
            "Product_ID": product_id,
            "Qty": qty,
            "Units_Per_Case": units_per_case,
            "Total_Units": qty * units_per_case,
            "Actual PO price": po_price,
            "Payment Status ": "Pending",
            "Notes": notes
        }])
        
        db["Purchases"] = pd.concat([purchases, new_po], ignore_index=True)
        save_all()
        
        return jsonify(success=True, message=f"PO '{po_number}' created successfully", po_number=po_number)
    except Exception as e:
        return jsonify(error=str(e)), 500

@app.route("/api/create-multi-po", methods=["POST"])
def create_multi_po():
    """
    Create purchase orders for multiple products, grouped by vendor.
    Each vendor gets a separate PO_ID. All entries stored in OUR_PO sheet.
    Structure: Common fields (PO_ID, Vendor_ID, Created_Date, Total_Amount, Status) only in first row,
    subsequent rows for the same PO have those fields empty (like Vendor_Purchase sheet).
    """
    try:
        d = request.json
        items = d.get("items", [])  # List of products with vendor_id, product_id, etc.
        
        if not items:
            return jsonify(error="No items provided"), 400
        
        # Group items by vendor_id
        vendor_groups = {}
        for item in items:
            vendor_id = str(item.get("vendor_id", "")).strip()
            if not vendor_id:
                return jsonify(error="All items must have a vendor_id"), 400
            if vendor_id not in vendor_groups:
                vendor_groups[vendor_id] = []
            vendor_groups[vendor_id].append(item)
        
        # Load or initialize OUR_PO sheet
        our_po = db.get("OUR_PO", pd.DataFrame())
        if our_po.empty:
            our_po = pd.DataFrame(columns=[
                "PO_ID", "Vendor_ID", "Created_Date", "Total_Amount", "Product_ID", "Product_Name", 
                "No_of_Cases", "Units_Per_Case", "PO_Price", "Line_Total", "Status"
            ])
        
        # Get current datetime for PO_ID generation (format: VP-YYYYMMDD-HHMMSS-VENDOR_ID)
        created_po_ids = []
        new_rows = []
        # Create a PO for each vendor
        for vendor_id, vendor_items in vendor_groups.items():
            # Generate PO_ID: VP-YYYYMMDD-HHMMSS-VENDOR_ID
            # Use a unique timestamp for each vendor group
            now = datetime.now()
            po_id = f"VP-{now.strftime('%Y%m%d-%H%M%S')}-{vendor_id}"
            created_date = now.strftime("%Y-%m-%d %H:%M:%S")
            created_po_ids.append(po_id)
            # Sleep for 1 second to ensure unique time for each PO_ID if multiple vendors
            if len(vendor_groups) > 1:
                import time
                time.sleep(1)
            # Calculate total amount for this PO: sum(Line_Total * PO_Price) for all products
            total_amount = 0.0
            for item in vendor_items:
                cases = int(item.get("no_of_cases", 0) or 0)
                units = int(item.get("units_per_case", 1) or 1)
                price_per_unit = float(item.get("po_price", 0) or 0)
                line_total = cases * units  # Total units for this product
                total_amount += line_total * price_per_unit  # Total cost for this product
            # Create a row for each product in this PO
            for idx, item in enumerate(vendor_items):
                product_id = str(item.get("product_id", "")).strip()
                product_name = str(item.get("product_name", "")).strip()
                no_of_cases = int(item.get("no_of_cases", 0) or 0)
                units_per_case = int(item.get("units_per_case", 1) or 1)
                po_price = float(item.get("po_price", 0) or 0)
                line_total = no_of_cases * units_per_case  # Total units for this line
                # Common fields only in first row, subsequent rows have None for empty cells
                # Using None ensures Excel writes empty cells, not empty strings or 'nan'
                is_first_row = idx == 0
                new_rows.append({
                    "PO_ID": po_id if is_first_row else None,
                    "Vendor_ID": vendor_id if is_first_row else None,
                    "Created_Date": created_date if is_first_row else None,
                    "Total_Amount": total_amount if is_first_row else None,
                    "Product_ID": product_id,
                    "Product_Name": product_name,
                    "No_of_Cases": no_of_cases,
                    "Units_Per_Case": units_per_case,
                    "PO_Price": po_price,
                    "Line_Total": line_total,
                    "Status": "Pending" if is_first_row else None
                })
        
        # Append new rows to OUR_PO
        if new_rows:
            new_df = pd.DataFrame(new_rows)
            # Define the exact column order we want in Excel
            column_order = [
                "PO_ID", "Vendor_ID", "Created_Date", "Total_Amount", "Product_ID", "Product_Name", 
                "No_of_Cases", "Units_Per_Case", "PO_Price", "Line_Total", "Status"
            ]
            combined = pd.concat([our_po, new_df], ignore_index=True)
            # Ensure column order and add any missing columns (add as None, not empty string)
            for col in column_order:
                if col not in combined.columns:
                    combined[col] = None
            db["OUR_PO"] = combined[column_order]
            save_all()
        
        return jsonify(
            success=True, 
            message=f"Created {len(created_po_ids)} PO(s) successfully",
            po_ids=created_po_ids,
            total_items=len(new_rows)
        )
    except Exception as e:
        return jsonify(error=str(e)), 500

@app.route("/api/our-pos", methods=["GET"])
def get_our_pos():
    """Get all POs from OUR_PO sheet with Status column"""
    try:
        our_po = db.get("OUR_PO", pd.DataFrame())
        
        if our_po.empty:
            return jsonify(pos=[])
        
        # Ensure Status column exists
        if "Status" not in our_po.columns:
            our_po["Status"] = "Pending"
        
        # Helper to check if a PO_ID value is valid (not None, NaN, empty, "nan", "None")
        def is_valid_po_id(val):
            if pd.isna(val):
                return False
            val_str = str(val).strip()
            return val_str and val_str not in ("nan", "None", "")
        
        # First pass: track common fields for each PO (from first row)
        po_common_fields = {}
        current_po_id = None
        
        for _, row in our_po.iterrows():
            po_id_val = row.get("PO_ID")
            
            # If this row has a valid PO_ID, it's the first row of a PO
            if is_valid_po_id(po_id_val):
                current_po_id = str(po_id_val).strip()
                po_common_fields[current_po_id] = {
                    "PO_ID": current_po_id,
                    "Vendor_ID": str(row.get("Vendor_ID", "")).strip() if pd.notna(row.get("Vendor_ID")) else "",
                    "Created_Date": str(row.get("Created_Date", "")).strip() if pd.notna(row.get("Created_Date")) else "",
                    "Total_Amount": float(row.get("Total_Amount", 0) or 0) if pd.notna(row.get("Total_Amount")) else 0,
                    "Status": str(row.get("Status", "Pending")).strip() or "Pending"
                }
        
        # Second pass: build enriched rows with propagated common fields
        enriched_pos = []
        current_po_id = None
        
        for _, row in our_po.iterrows():
            po_id_val = row.get("PO_ID")
            
            # Update current PO ID if this row has one
            if is_valid_po_id(po_id_val):
                current_po_id = str(po_id_val).strip()
            
            if not current_po_id:
                continue
            
            # Get common fields for this PO
            common = po_common_fields.get(current_po_id, {})
            
            enriched_pos.append({
                "PO_ID": common.get("PO_ID", ""),
                "Vendor_ID": common.get("Vendor_ID", ""),
                "Created_Date": common.get("Created_Date", ""),
                "Total_Amount": common.get("Total_Amount", 0),
                "Product_ID": str(row.get("Product_ID", "")).strip() if pd.notna(row.get("Product_ID")) else "",
                "Product_Name": str(row.get("Product_Name", "")).strip() if pd.notna(row.get("Product_Name")) else "",
                "No_of_Cases": int(row.get("No_of_Cases", 0) or 0) if pd.notna(row.get("No_of_Cases")) else 0,
                "Units_Per_Case": int(row.get("Units_Per_Case", 1) or 1) if pd.notna(row.get("Units_Per_Case")) else 1,
                "PO_Price": float(row.get("PO_Price", 0) or 0) if pd.notna(row.get("PO_Price")) else 0,
                "Line_Total": float(row.get("Line_Total", 0) or 0) if pd.notna(row.get("Line_Total")) else 0,
                "Status": common.get("Status", "Pending")
            })
        
        return jsonify(pos=enriched_pos)
    except Exception as e:
        import traceback
        print(f"ERROR in get_our_pos: {traceback.format_exc()}")
        return jsonify(error=str(e)), 500


@app.route("/api/vendor-purchases-grouped", methods=["GET"])
def get_vendor_purchases_grouped():
    """
    Get vendor purchases grouped by PO_ID.
    Structure: PO_ID -> DATE -> PURCHASE_DATE -> VENDOR_ID -> [Products] -> BATCH -> PAYMENT -> GST
    """
    try:
        purchases = db.get("Purchases", pd.DataFrame())
        
        if purchases.empty:
            return jsonify(grouped_purchases=[])
        
        # Group by PO ID
        grouped = {}
        for _, row in purchases.iterrows():
            po_id = str(row.get("PO ID", "")).strip()
            if not po_id:
                continue
            
            if po_id not in grouped:
                grouped[po_id] = {
                    "PO_ID": po_id,
                    "Date": row.get("DATE"),
                    "Purchase_Date": row.get("PURCHASE DATE"),
                    "Vendor_ID": str(row.get("VENDOR ID", "")).strip(),
                    "Batch": row.get("BATCH"),
                    "Payment_Mode": row.get("PAYMENT MODE"),
                    "Payment_Status": row.get("PAYMENT STATUS"),
                    "GST_Filed": row.get("GST FILED"),
                    "Items": [],
                    "Total_Cases": 0,
                    "Total_Quantity": 0,
                    "Total_Value": 0
                }
            
            # Add product as line item
            cases = int(row.get("CASE COUNT") or 0) if pd.notna(row.get("CASE COUNT")) else 0
            qty = int(row.get("QUANTITY") or 0) if pd.notna(row.get("QUANTITY")) else 0
            po_price = float(row.get("PO PRICE") or 0) if pd.notna(row.get("PO PRICE")) else 0
            
            grouped[po_id]["Items"].append({
                "Product_ID": str(row.get("PRODUCT ID", "")).strip(),
                "Product_Name": row.get("PRODUCT NAME") or "",
                "Units_Per_Case": int(row.get("UNIT/CASE") or 1) if pd.notna(row.get("UNIT/CASE")) else 1,
                "Case_Count": cases,
                "Quantity": qty,
                "MRP": float(row.get("MRP") or 0) if pd.notna(row.get("MRP")) else 0,
                "PO_Price": po_price
            })
            grouped[po_id]["Total_Cases"] += cases
            grouped[po_id]["Total_Quantity"] += qty
            grouped[po_id]["Total_Value"] += (po_price * cases)
        
        # Convert to list and sort by date descending
        result = list(grouped.values())
        result.sort(key=lambda x: x.get("Date") or "", reverse=True)
        
        return jsonify(grouped_purchases=result)
    except Exception as e:
        return jsonify(error=str(e)), 500


@app.route("/api/vendor-purchases", methods=["GET"])
def get_vendor_purchases_flat():
    """
    Get all vendor purchases as a flat list (all rows from Vendor_Purchase sheet)
    """
    try:
        purchases = db.get("Purchases", pd.DataFrame())
        
        if purchases.empty:
            return jsonify(purchases=[])
        
        def safe_date(val):
            """Convert date value safely, returning None for NaT/NaN"""
            if pd.isna(val):
                return None
            try:
                if hasattr(val, 'isoformat'):
                    return val.isoformat()
                return str(val)
            except:
                return None
        
        result = []
        for _, row in purchases.iterrows():
            # Skip completely empty rows
            if pd.isna(row.get("VENDOR ID")) and pd.isna(row.get("PRODUCT NAME")):
                continue
                
            result.append({
                "PO_ID": str(row.get("PO ID", "")).strip() if pd.notna(row.get("PO ID")) else "",
                "Date": safe_date(row.get("DATE")),
                "Purchase_Date": safe_date(row.get("PURCHASE DATE")),
                "Vendor_ID": str(row.get("VENDOR ID", "")).strip() if pd.notna(row.get("VENDOR ID")) else "",
                "Product_ID": str(row.get("PRODUCT ID", "")).strip() if pd.notna(row.get("PRODUCT ID")) else "",
                "Product_Name": str(row.get("PRODUCT NAME", "")).strip() if pd.notna(row.get("PRODUCT NAME")) else "",
                "Batch": str(row.get("BATCH", "")).strip() if pd.notna(row.get("BATCH")) else "",
                "Units_Per_Case": int(row.get("UNIT/CASE") or 1) if pd.notna(row.get("UNIT/CASE")) else 1,
                "Case_Count": int(row.get("CASE COUNT") or 0) if pd.notna(row.get("CASE COUNT")) else 0,
                "Quantity": int(row.get("QUANTITY") or 0) if pd.notna(row.get("QUANTITY")) else 0,
                "MRP": float(row.get("MRP") or 0) if pd.notna(row.get("MRP")) else 0,
                "PO_Price": float(row.get("PO PRICE") or 0) if pd.notna(row.get("PO PRICE")) else 0,
                "Payment_Mode": str(row.get("PAYMENT MODE", "")).strip() if pd.notna(row.get("PAYMENT MODE")) else "",
                "Payment_Status": str(row.get("PAYMENT STATUS", "")).strip() if pd.notna(row.get("PAYMENT STATUS")) else "",
                "GST_Filed": str(row.get("GST FILED", "")).strip() if pd.notna(row.get("GST FILED")) else ""
            })
        
        return jsonify(purchases=result, count=len(result))
    except Exception as e:
        return jsonify(error=str(e)), 500


@app.route("/api/generate-vendor-po-ids", methods=["POST"])
def generate_vendor_po_ids():
    """
    Generate PO_IDs for all vendor purchase records that don't have one.
    Groups by DATE + VENDOR_ID - same date & vendor get same PO_ID.
    """
    try:
        purchases = db.get("Purchases", pd.DataFrame())
        
        if purchases.empty:
            return jsonify(message="No purchases found", updated=0)
        
        # Track which PO_IDs we've already generated
        generated_ids = {}
        updated_count = 0
        
        for idx, row in purchases.iterrows():
            # Skip if already has a PO_ID
            existing_po = str(row.get("PO ID", "")).strip()
            if existing_po and existing_po.lower() not in ['nan', 'none', '']:
                continue
            
            # Get date and vendor for grouping
            date_val = row.get("DATE")
            vendor_id = str(row.get("VENDOR ID", "")).strip()
            
            if pd.isna(date_val):
                continue
            
            # Create group key (date + vendor)
            if hasattr(date_val, 'strftime'):
                date_str = date_val.strftime("%Y%m%d")
            else:
                try:
                    dt = pd.to_datetime(date_val)
                    date_str = dt.strftime("%Y%m%d")
                except:
                    continue
            
            group_key = f"{date_str}_{vendor_id}"
            
            # Generate PO_ID for this group if not already done
            if group_key not in generated_ids:
                # Find the next sequence number for this date
                prefix = f"VP-{date_str}"
                existing = purchases["PO ID"].astype(str).str.strip()
                matching = existing[existing.str.startswith(prefix)]
                
                max_seq = 0
                for po_id in matching:
                    try:
                        seq = int(po_id.split("-")[-1])
                        max_seq = max(max_seq, seq)
                    except:
                        pass
                
                # Also check already generated IDs
                for gen_id in generated_ids.values():
                    if gen_id.startswith(prefix):
                        try:
                            seq = int(gen_id.split("-")[-1])
                            max_seq = max(max_seq, seq)
                        except:
                            pass
                
                generated_ids[group_key] = f"{prefix}-{str(max_seq + 1).zfill(3)}"
            
            # Update the row
            purchases.at[idx, "PO ID"] = generated_ids[group_key]
            updated_count += 1
        
        # Save back to Excel if any updates
        if updated_count > 0:
            db["Purchases"] = purchases
            save_all()
        
        return jsonify(
            message=f"Generated PO_IDs for {updated_count} records",
            updated=updated_count,
            generated_ids=list(set(generated_ids.values()))
        )
    except Exception as e:
        return jsonify(error=str(e)), 500


def generate_vendor_po_id(date_str=None):
    """Generate a unique PO ID for vendor purchases: VP-YYYYMMDD-HHMMSS-VendorID"""
    now = datetime.now()
    # If vendor_id is available, append it; else, just use timestamp
    vendor_id = None
    # Try to get vendor_id from request context if possible
    try:
        vendor_id = request.json.get("vendor_id", None)
    except:
        pass
    po_id = f"VP-{now.strftime('%Y%m%d-%H%M%S')}"
    if vendor_id:
        po_id = f"{po_id}-{vendor_id}"
    return po_id


@app.route("/api/record-vendor-purchase", methods=["POST"])
def record_vendor_purchase():
    """
    Record a complete vendor purchase with auto-generated PO_ID.
    Accepts multiple products in a single PO.
    """
    try:
        d = request.json
        
        # Common PO fields
        date = d.get("date") or datetime.now().strftime("%Y-%m-%d")
        purchase_date = d.get("purchase_date") or date
        vendor_id = str(d.get("vendor_id", "")).strip()
        batch = str(d.get("batch", "")).strip() or None
        payment_mode = str(d.get("payment_mode", "")).strip() or None
        payment_status = str(d.get("payment_status", "Pending")).strip()
        gst_filed = str(d.get("gst_filed", "No")).strip()
        
        # Line items (products)
        items = d.get("items", [])
        
        if not vendor_id:
            return jsonify(error="Vendor ID is required"), 400
        if not items or len(items) == 0:
            return jsonify(error="At least one product item is required"), 400
        
        # Generate PO ID
        po_id = generate_vendor_po_id(date)
        
        purchases = db.get("Purchases", pd.DataFrame())
        if purchases.empty:
            purchases = pd.DataFrame(columns=[
                "PO ID", "DATE", "PURCHASE DATE", "VENDOR ID", "PRODUCT ID",
                "PRODUCT NAME", "BATCH", "UNIT/CASE", "CASE COUNT", "QUANTITY",
                "MRP", "PO PRICE", "PAYMENT MODE", "PAYMENT STATUS", "GST FILED"
            ])
        
        warehouse = db.get("Warehouse", pd.DataFrame())
        if warehouse.empty:
            warehouse = pd.DataFrame(columns=["Product_ID", "Product_Name", "Available_Units", "Units_Per_Case", "Last_Received_Date", "Notes"])
        
        new_rows = []
        for idx, item in enumerate(items):
            product_id = str(item.get("product_id", "")).strip()
            product_name = str(item.get("product_name", "")).strip()
            units_per_case = int(item.get("units_per_case", 1))
            case_count = int(item.get("case_count", 0))
            quantity = case_count * units_per_case
            mrp = float(item.get("mrp", 0))
            po_price = float(item.get("po_price", 0))
            
            if not product_id or case_count <= 0:
                continue
            
            # Common PO fields only for first row (PO ID kept in all rows for status matching)
            is_first_row = len(new_rows) == 0
            
            new_rows.append({
                "PO ID": po_id,
                "DATE": date if is_first_row else "",
                "PURCHASE DATE": purchase_date if is_first_row else "",
                "VENDOR ID": vendor_id if is_first_row else "",
                "PRODUCT ID": product_id,
                "PRODUCT NAME": product_name,
                "BATCH": batch if is_first_row else "",
                "UNIT/CASE": units_per_case,
                "CASE COUNT": case_count,
                "QUANTITY": quantity,
                "MRP": mrp,
                "PO PRICE": po_price,
                "PAYMENT MODE": payment_mode if is_first_row else "",
                "PAYMENT STATUS": payment_status if is_first_row else "",
                "GST FILED": gst_filed if is_first_row else ""
            })
            
            # Update warehouse
            wh_mask = warehouse["Product_ID"].astype(str) == product_id
            if wh_mask.any():
                warehouse.loc[wh_mask, "Available_Units"] = warehouse.loc[wh_mask, "Available_Units"].fillna(0).astype(int) + quantity
                warehouse.loc[wh_mask, "Units_Per_Case"] = units_per_case
                warehouse.loc[wh_mask, "Last_Received_Date"] = date
            else:
                new_wh = pd.DataFrame([{
                    "Product_ID": product_id,
                    "Product_Name": product_name,
                    "Available_Units": quantity,
                    "Units_Per_Case": units_per_case,
                    "Last_Received_Date": date,
                    "Notes": f"From VP: {po_id}"
                }])
                warehouse = pd.concat([warehouse, new_wh], ignore_index=True)
        
        if not new_rows:
            return jsonify(error="No valid items to add"), 400
        
        db["Purchases"] = pd.concat([purchases, pd.DataFrame(new_rows)], ignore_index=True)
        db["Warehouse"] = warehouse
        save_all()
        
        total_cases = sum(r["CASE COUNT"] for r in new_rows)
        total_qty = sum(r["QUANTITY"] for r in new_rows)
        
        return jsonify(
            success=True,
            po_id=po_id,
            message=f"Created {po_id} with {len(new_rows)} products ({total_cases} cases, {total_qty} units)",
            items_count=len(new_rows),
            total_cases=total_cases,
            total_quantity=total_qty
        )
    except Exception as e:
        return jsonify(error=str(e)), 500


@app.route("/api/po-items/<po_id>", methods=["GET"])
def get_po_items(po_id):
    """Get all items/products for a specific PO from OUR_PO sheet.
    Since common fields (PO_ID, Vendor_ID, etc.) are only in the first row,
    we need to track rows that belong to the same PO by sequence.
    """
    try:
        our_po = db.get("OUR_PO", pd.DataFrame())
        
        if our_po.empty:
            return jsonify(success=True, items=[], po_date=None, vendor_id=None)
        
        # Find all rows belonging to this PO
        # First row has PO_ID, subsequent rows for same PO have None/empty PO_ID
        po_items = []
        po_date = None
        vendor_id = None
        found_po = False
        
        for _, row in our_po.iterrows():
            row_po_id = row.get("PO_ID")
            row_po_id_str = str(row_po_id).strip() if pd.notna(row_po_id) else ""
            
            # Check if this row starts a new PO
            if row_po_id_str and row_po_id_str != "nan" and row_po_id_str != "None":
                if row_po_id_str == po_id:
                    # Found the PO we're looking for
                    found_po = True
                    po_date = row.get("Created_Date", "")
                    vendor_id = str(row.get("Vendor_ID", "")).strip() if pd.notna(row.get("Vendor_ID")) else ""
                elif found_po:
                    # This is a new PO, stop collecting items
                    break
            
            # If we found our PO, collect this item
            if found_po:
                po_items.append({
                    "Product_ID": str(row.get("Product_ID", "")).strip() if pd.notna(row.get("Product_ID")) else "",
                    "Product_Name": str(row.get("Product_Name", "")).strip() if pd.notna(row.get("Product_Name")) else "",
                    "No_of_Cases": int(row.get("No_of_Cases", 0)) if pd.notna(row.get("No_of_Cases")) else 0,
                    "Units_Per_Case": int(row.get("Units_Per_Case", 1)) if pd.notna(row.get("Units_Per_Case")) else 1,
                    "PO_Price": float(row.get("PO_Price", 0)) if pd.notna(row.get("PO_Price")) else 0
                })
        
        # Format date properly
        if pd.notna(po_date):
            if hasattr(po_date, 'strftime'):
                po_date = po_date.strftime("%Y-%m-%d")
            else:
                po_date = str(po_date)[:10] if po_date else None
        
        return jsonify(success=True, items=po_items, po_date=po_date, vendor_id=vendor_id)
    except Exception as e:
        return jsonify(success=False, error=str(e)), 500


@app.route("/api/record-delivery", methods=["POST"])
def record_delivery():
    """
    Record vendor delivery against a PO. This adds to Vendor_Purchase sheet.
    Accepts multiple products in a single delivery.
    Skips products with 0 case count (not delivered).
    """
    try:
        d = request.json
        po_id = str(d.get("po_id", "")).strip()
        vendor_id = str(d.get("vendor_id", "")).strip()
        po_date = str(d.get("po_date", "")).strip()  # Date from PO creation
        purchase_date = str(d.get("purchase_date", "")).strip()  # Manual entry by admin
        products = d.get("products", [])  # List of products with delivery details
        
        if not po_id:
            return jsonify(error="PO ID is required"), 400
        if not purchase_date:
            return jsonify(error="Purchase Date is required"), 400
        if not products:
            return jsonify(error="No products provided"), 400
        
        # Parse dates
        try:
            po_date_parsed = pd.to_datetime(po_date).strftime("%Y-%m-%d") if po_date else datetime.now().strftime("%Y-%m-%d")
        except:
            po_date_parsed = datetime.now().strftime("%Y-%m-%d")
        
        try:
            purchase_date_parsed = pd.to_datetime(purchase_date).strftime("%Y-%m-%d")
        except:
            return jsonify(error="Invalid Purchase Date format"), 400
        
        purchases = db.get("Purchases", pd.DataFrame())
        
        # Initialize if empty with correct columns matching Excel
        if purchases.empty:
            purchases = pd.DataFrame(columns=[
                "PO ID", "DATE", "PURCHASE DATE", "VENDOR ID", "PRODUCT ID",
                "PRODUCT NAME", "BATCH", "UNIT/CASE", "CASE COUNT", "QUANTITY",
                "MRP", "PO PRICE", "PAYMENT MODE", "PAYMENT STATUS", "GST FILED"
            ])
        
        warehouse = db.get("Warehouse", pd.DataFrame())
        if warehouse.empty:
            warehouse = pd.DataFrame(columns=["Product_ID", "Product_Name", "Available_Units", "Units_Per_Case", "Last_Received_Date", "Notes"])
        
        new_deliveries = []
        products_recorded = 0
        products_skipped = 0
        total_units_added = 0
        
        for product in products:
            case_count = int(product.get("case_count", 0))
            
            # Skip products with 0 case count (not delivered)
            if case_count <= 0:
                products_skipped += 1
                continue
            
            product_id = str(product.get("product_id", "")).strip()
            product_name = str(product.get("product_name", "")).strip()
            batch = str(product.get("batch", "")).strip() or ""
            units_per_case = int(product.get("units_per_case", 1))
            quantity = case_count * units_per_case  # Auto-calculated
            mrp = float(product.get("mrp", 0))
            po_price = float(product.get("po_price", 0))
            payment_mode = str(product.get("payment_mode", "")).strip()
            payment_status = str(product.get("payment_status", "")).strip()
            gst_filed = str(product.get("gst_filed", "")).strip()
            
            # Common PO fields only for first row (except PO ID and PRODUCT ID which are needed for matching)
            is_first_row = len(new_deliveries) == 0
            
            # Create delivery record
            new_deliveries.append({
                "PO ID": po_id,
                "DATE": po_date_parsed if is_first_row else "",
                "PURCHASE DATE": purchase_date_parsed if is_first_row else "",
                "VENDOR ID": vendor_id if is_first_row else "",
                "PRODUCT ID": product_id,
                "PRODUCT NAME": product_name,
                "BATCH": batch if is_first_row else "",
                "UNIT/CASE": units_per_case,
                "CASE COUNT": case_count,
                "QUANTITY": quantity,
                "MRP": mrp,
                "PO PRICE": po_price,
                "PAYMENT MODE": payment_mode if is_first_row else "",
                "PAYMENT STATUS": payment_status if is_first_row else "",
                "GST FILED": gst_filed if is_first_row else ""
            })
            
            products_recorded += 1
            total_units_added += quantity
            
            # Update warehouse stock
            wh_mask = warehouse["Product_ID"].astype(str) == product_id
            if wh_mask.any():
                warehouse.loc[wh_mask, "Available_Units"] = warehouse.loc[wh_mask, "Available_Units"].fillna(0).astype(int) + quantity
                warehouse.loc[wh_mask, "Units_Per_Case"] = units_per_case
                warehouse.loc[wh_mask, "Last_Received_Date"] = purchase_date_parsed
            else:
                new_wh = pd.DataFrame([{
                    "Product_ID": product_id,
                    "Product_Name": product_name,
                    "Available_Units": quantity,
                    "Units_Per_Case": units_per_case,
                    "Last_Received_Date": purchase_date_parsed,
                    "Notes": f"From PO: {po_id}"
                }])
                warehouse = pd.concat([warehouse, new_wh], ignore_index=True)
        
        # Save deliveries if any
        if new_deliveries:
            new_df = pd.DataFrame(new_deliveries)
            db["Purchases"] = pd.concat([purchases, new_df], ignore_index=True)
            db["Warehouse"] = warehouse
            
            # Update OUR_PO Status for delivered products
            our_po = db.get("OUR_PO", pd.DataFrame())
            if not our_po.empty and "Status" not in our_po.columns:
                our_po["Status"] = "Pending"
            
            if not our_po.empty:
                # Find the first row index for this PO (where PO_ID is set)
                po_first_row_idx = None
                po_product_rows = []  # Track all product rows for this PO
                current_po = None
                
                for idx, row in our_po.iterrows():
                    row_po_id = row.get("PO_ID")
                    # Handle None, NaN, "nan", "None", and empty strings
                    row_po_id_str = str(row_po_id).strip() if pd.notna(row_po_id) else ""
                    is_valid_po_id = row_po_id_str and row_po_id_str not in ("nan", "None", "")
                    
                    if is_valid_po_id:
                        current_po = row_po_id_str
                        if current_po == po_id:
                            po_first_row_idx = idx
                            po_product_rows = [idx]
                    elif current_po == po_id:
                        po_product_rows.append(idx)
                
                # Check if all products in this PO are delivered
                all_delivered = True
                any_partial = False
                
                for delivery in new_deliveries:
                    product_id = delivery["PRODUCT ID"]
                    delivered_cases = delivery["CASE COUNT"]
                    
                    # Find matching product in PO rows
                    for row_idx in po_product_rows:
                        if str(our_po.at[row_idx, "Product_ID"]).strip() == product_id:
                            ordered_cases = int(our_po.at[row_idx, "No_of_Cases"] or 0)
                            if delivered_cases < ordered_cases:
                                all_delivered = False
                                if delivered_cases > 0:
                                    any_partial = True
                            break
                
                # Update status in the first row only
                if po_first_row_idx is not None:
                    if all_delivered:
                        our_po.at[po_first_row_idx, "Status"] = "Completed"
                    elif any_partial:
                        our_po.at[po_first_row_idx, "Status"] = "Partial"
                
                db["OUR_PO"] = our_po
            
            save_all()
        
        return jsonify(
            success=True,
            message=f"Recorded delivery for PO {po_id}",
            products_recorded=products_recorded,
            products_skipped=products_skipped,
            total_units=total_units_added,
            warehouse_updated=True
        )
    except Exception as e:
        return jsonify(error=str(e)), 500


@app.route("/api/po-deliveries/<po_id>", methods=["GET"])
def get_po_deliveries(po_id):
    """Get all deliveries for a specific PO"""
    try:
        purchases = db.get("Purchases", pd.DataFrame())
        
        if purchases.empty:
            return jsonify(deliveries=[])
        
        # Filter deliveries for this PO
        mask = purchases["PO ID"].astype(str).str.strip() == po_id
        po_deliveries = purchases[mask]
        
        return jsonify(deliveries=df_to_safe_dict(po_deliveries))
    except Exception as e:
        return jsonify(error=str(e)), 500


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

@app.route("/api/update-stock", methods=["POST"])
def update_stock():
    """Update stock directly without creating a refill log entry"""
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

    save_all()
    return jsonify(success=True)

# --------------------------------------------------
# WAREHOUSE ROUTES
# --------------------------------------------------
@app.route("/api/warehouse/add", methods=["POST"])
def warehouse_add():
    """Add or update warehouse stock when receiving a PO"""
    try:
        d = request.json
        product_id = str(d.get("product_id", "")).strip()
        product_name = str(d.get("product_name", "")).strip()
        units_received = int(d.get("units_received", 0))
        units_per_case = int(d.get("units_per_case", 1))
        notes = d.get("notes", "")
        
        if not product_id:
            return jsonify(error="Product ID is required"), 400
        
        warehouse = db.get("Warehouse", pd.DataFrame())
        
        if warehouse.empty:
            warehouse = pd.DataFrame(columns=["Product_ID", "Product_Name", "Available_Units", "Units_Per_Case", "Last_Received_Date", "Notes"])
        
        mask = warehouse["Product_ID"].astype(str) == product_id
        
        if mask.any():
            # Update existing row
            warehouse.loc[mask, "Available_Units"] = warehouse.loc[mask, "Available_Units"].fillna(0).astype(int) + units_received
            warehouse.loc[mask, "Units_Per_Case"] = units_per_case
            warehouse.loc[mask, "Last_Received_Date"] = datetime.now().strftime("%Y-%m-%d")
            if notes:
                warehouse.loc[mask, "Notes"] = notes
        else:
            # Add new row
            new_row = pd.DataFrame([{
                "Product_ID": product_id,
                "Product_Name": product_name,
                "Available_Units": units_received,
                "Units_Per_Case": units_per_case,
                "Last_Received_Date": datetime.now().strftime("%Y-%m-%d"),
                "Notes": notes
            }])
            warehouse = pd.concat([warehouse, new_row], ignore_index=True)
        
        db["Warehouse"] = warehouse
        save_all()
        
        return jsonify(success=True, message=f"Added {units_received} units of {product_id} to warehouse")
    except Exception as e:
        return jsonify(error=str(e)), 500

@app.route("/api/warehouse/transfer", methods=["POST"])
def warehouse_transfer():
    """Transfer units from warehouse to refiller (deduct from warehouse stock)"""
    try:
        d = request.json
        product_id = str(d.get("product_id", "")).strip()
        refiller_id = str(d.get("refiller_id", "")).strip()
        units_to_transfer = int(d.get("units", 0))
        
        if not product_id or not refiller_id:
            return jsonify(error="Product ID and Refiller ID are required"), 400
        
        warehouse = db.get("Warehouse", pd.DataFrame())
        
        if warehouse.empty:
            return jsonify(error="Warehouse is empty"), 400
        
        mask = warehouse["Product_ID"].astype(str) == product_id
        
        if not mask.any():
            return jsonify(error=f"Product {product_id} not found in warehouse"), 404
        
        available = int(warehouse.loc[mask, "Available_Units"].fillna(0).iloc[0])
        
        if available < units_to_transfer:
            return jsonify(error=f"Insufficient stock. Available: {available}, Requested: {units_to_transfer}"), 400
        
        # Deduct from warehouse
        warehouse.loc[mask, "Available_Units"] = available - units_to_transfer
        db["Warehouse"] = warehouse
        
        # Log the transfer as a refill entry (for tracking)
        db["Refills"] = pd.concat([db["Refills"], pd.DataFrame([{
            "Date": datetime.now().strftime("%Y-%m-%d"),
            "Refiller_ID": refiller_id,
            "Machine_ID": "WAREHOUSE_TRANSFER",
            "Product_ID": product_id,
            "Qty": units_to_transfer
        }])])
        
        save_all()
        
        return jsonify(success=True, message=f"Transferred {units_to_transfer} units to {refiller_id}", remaining=available - units_to_transfer)
    except Exception as e:
        return jsonify(error=str(e)), 500

@app.route("/api/warehouse/update", methods=["POST"])
def warehouse_update():
    """Update warehouse item details or adjust stock manually"""
    try:
        d = request.json
        product_id = str(d.get("product_id", "")).strip()
        
        if not product_id:
            return jsonify(error="Product ID is required"), 400
        
        warehouse = db.get("Warehouse", pd.DataFrame())
        
        if warehouse.empty:
            return jsonify(error="Warehouse is empty"), 404
        
        mask = warehouse["Product_ID"].astype(str) == product_id
        
        if not mask.any():
            return jsonify(error=f"Product {product_id} not found in warehouse"), 404
        
        # Update fields if provided
        if "available_units" in d:
            warehouse.loc[mask, "Available_Units"] = int(d["available_units"])
        if "units_per_case" in d:
            warehouse.loc[mask, "Units_Per_Case"] = int(d["units_per_case"])
        if "notes" in d:
            warehouse.loc[mask, "Notes"] = d["notes"]
        if "product_name" in d:
            warehouse.loc[mask, "Product_Name"] = d["product_name"]
        
        db["Warehouse"] = warehouse
        save_all()
        
        return jsonify(success=True, message=f"Warehouse item {product_id} updated")
    except Exception as e:
        return jsonify(error=str(e)), 500

@app.route("/api/warehouse/delete", methods=["POST"])
def warehouse_delete():
    """Remove a product from warehouse tracking"""
    try:
        d = request.json
        product_id = str(d.get("product_id", "")).strip()
        
        if not product_id:
            return jsonify(error="Product ID is required"), 400
        
        warehouse = db.get("Warehouse", pd.DataFrame())
        
        if warehouse.empty:
            return jsonify(error="Warehouse is empty"), 404
        
        mask = warehouse["Product_ID"].astype(str) == product_id
        
        if not mask.any():
            return jsonify(error=f"Product {product_id} not found in warehouse"), 404
        
        db["Warehouse"] = warehouse[~mask].reset_index(drop=True)
        save_all()
        
        return jsonify(success=True, message=f"Product {product_id} removed from warehouse")
    except Exception as e:
        return jsonify(error=str(e)), 500

@app.route("/api/warehouse/recommendation", methods=["GET"])
def warehouse_recommendation():
    """Get warehouse stock recommendations for PO planning"""
    try:
        product_id = request.args.get("product_id", "").strip()
        
        warehouse = db.get("Warehouse", pd.DataFrame())
        products = db.get("Products", pd.DataFrame())
        
        recommendations = []
        
        if product_id:
            # Single product recommendation
            if not warehouse.empty:
                mask = warehouse["Product_ID"].astype(str) == product_id
                if mask.any():
                    row = warehouse[mask].iloc[0]
                    recommendations.append({
                        "product_id": product_id,
                        "available_units": int(row.get("Available_Units") or 0),
                        "units_per_case": int(row.get("Units_Per_Case") or 1),
                        "product_name": row.get("Product_Name", "")
                    })
        else:
            # All products recommendation
            if not warehouse.empty:
                for _, row in warehouse.iterrows():
                    recommendations.append({
                        "product_id": str(row.get("Product_ID", "")),
                        "product_name": row.get("Product_Name", ""),
                        "available_units": int(row.get("Available_Units") or 0),
                        "units_per_case": int(row.get("Units_Per_Case") or 1)
                    })
        
        return jsonify(recommendations=recommendations)
    except Exception as e:
        return jsonify(error=str(e)), 500


# --------------------------------------------------
# RUN SERVER
# --------------------------------------------------
if __name__ == "__main__":
    app.run(host="0.0.0.0", port=PORT, debug=False)