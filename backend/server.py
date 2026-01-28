import os
import time
import pandas as pd
import numpy as np
from flask import Flask, jsonify, request
from flask_cors import CORS
from datetime import datetime
import threading

app = Flask(__name__)
# Enable CORS for all routes (important for localhost:3000 to hit localhost:3001)
CORS(app, resources={r"/api/*": {"origins": "*"}})

EXCEL_FILE = r'C:\Users\YUVANSANKAR R\Inv\Inventory\vendbees_app\ventory_sheet.xlsx'
PORT = 3001

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
last_file_mtime = 0

def clean_df(df):
    """Cleans a dataframe: strips headers, strips string values, drops fully empty rows, and replaces NaNs."""
    if df.empty: return df
    # Clean headers
    df.columns = df.columns.astype(str).str.strip()
    # Replace NaN/Inf with None (becomes null in JSON)
    df = df.replace({np.nan: None, np.inf: None, -np.inf: None})
    # Strip string values
    for col in df.columns:
        if df[col].dtype == "object":
            df[col] = df[col].apply(lambda x: x.strip() if isinstance(x, str) else x)
    # Drop rows that are completely None
    df = df.dropna(how='all')
    return df

def df_to_safe_dict(df):
    """Converts a dataframe to a list of dicts, ensuring all values are JSON serializable (no NaN/Inf)."""
    if df.empty: return []
    # Final safety check for NaN/Inf before conversion
    return df.replace({np.nan: None, np.inf: None, -np.inf: None}).to_dict(orient='records')

def load_data():
    """Reads the Excel file and populates the in-memory db."""
    global db, last_file_mtime
    
    if not os.path.exists(EXCEL_FILE):
        print(f"[{datetime.now()}] Error: Excel file not found at {EXCEL_FILE}")
        return False

    try:
        current_mtime = os.path.getmtime(EXCEL_FILE)
        if current_mtime == last_file_mtime:
            return True

        print(f"[{datetime.now()}] Reloading data from Excel...")
        with pd.ExcelFile(EXCEL_FILE) as xls:
            for internal_key, sheet_name in SHEET_MAP.items():
                if sheet_name in xls.sheet_names:
                    df = pd.read_excel(xls, sheet_name=sheet_name)
                    df = clean_df(df)
                    
                    # Special check for products: skip rows until we find valid PRODUCT_ID
                    if internal_key == 'Products' and not df.empty:
                        # Find first row with a P... ID or similar non-null ID
                        # In the inspection, row 0 was CHIPS but ID was nan.
                        # So we filter rows where PRODUCT_ID is missing.
                        df = df[df['PRODUCT_ID'].notna()].reset_index(drop=True)
                    
                    db[internal_key] = df
                else:
                    print(f"Warning: Sheet '{sheet_name}' not found.")
                    db[internal_key] = pd.DataFrame()
        
        # --- Derived Stock Logic ---
        # Derive stock even if sheet exists but is actually empty
        stock_df = db.get('Stock', pd.DataFrame())
        if stock_df.empty or len(stock_df) == 0:
            print(f"[{datetime.now()}] Current_Stock sheet is empty. Deriving stock from logs...")
            refills = db.get('Refills', pd.DataFrame())
            sales = db.get('Sales', pd.DataFrame())
            
            stock_map = {} # (machine, product) -> qty
            
            # Add refills
            if not refills.empty:
                for _, r in refills.iterrows():
                    mid = str(r.get('Machine_ID', '')).strip()
                    pid = str(r.get('Product_ID', '')).strip()
                    qty = r.get('Qty', 0)
                    if mid and pid and pid.lower() != 'nan' and pd.notna(qty):
                        key = (mid, pid)
                        stock_map[key] = stock_map.get(key, 0) + float(qty)
            
            # Subtract sales
            if not sales.empty:
                # Use cleaned names for sales (Qty Sold)
                for _, s in sales.iterrows():
                    mid = str(s.get('Machine_ID', '')).strip()
                    pid = str(s.get('Product_ID', '')).strip()
                    # Try both variants due to previous inspection showing "Qty Sold "
                    qty = s.get('Qty Sold', s.get('Qty', 0))
                    if mid and pid and pid.lower() != 'nan' and pd.notna(qty):
                        key = (mid, pid)
                        stock_map[key] = stock_map.get(key, 0) - float(qty)
            
            # Convert map back to DF
            new_stock_rows = []
            for (mid, pid), qty in stock_map.items():
                new_stock_rows.append({'Machine_ID': mid, 'Product_ID': pid, 'Current_Stock': max(0, qty)})
            
            db['Stock'] = pd.DataFrame(new_stock_rows) if new_stock_rows else pd.DataFrame(columns=['Machine_ID', 'Product_ID', 'Current_Stock'])
            print(f"[{datetime.now()}] Derived stock for {len(stock_map)} items.")

        last_file_mtime = current_mtime
        print(f"[{datetime.now()}] Data loaded successfully.")
        return True
    except Exception as e:
        print(f"[{datetime.now()}] Error reading Excel: {e}")
        import traceback
        traceback.print_exc()
        return False

def save_sheet(internal_key):
    """Saves a dataframe back to Excel."""
    global last_file_mtime
    df = db.get(internal_key)
    if df is None: return
    sheet_name = SHEET_MAP[internal_key]
    try:
        with pd.ExcelWriter(EXCEL_FILE, engine='openpyxl', mode='a', if_sheet_exists='replace') as writer:
            df.to_excel(writer, sheet_name=sheet_name, index=False)
        last_file_mtime = os.path.getmtime(EXCEL_FILE)
    except Exception as e:
        print(f"Error saving to Excel: {e}")

# Initial Load
load_data()

def poll_excel():
    while True:
        try:
            if os.path.exists(EXCEL_FILE):
                current_mtime = os.path.getmtime(EXCEL_FILE)
                if current_mtime > last_file_mtime:
                    load_data()
        except Exception: pass
        time.sleep(5) # Poll every 5s

threading.Thread(target=poll_excel, daemon=True).start()

@app.route('/api/dashboard', methods=['GET'])
def get_dashboard():
    # Fresh references
    products_df = db.get('Products', pd.DataFrame())
    machines_df = db.get('Machines', pd.DataFrame())
    stock_df = db.get('Stock', pd.DataFrame())
    sales_df = db.get('Sales', pd.DataFrame())
    purchases_df = db.get('Purchases', pd.DataFrame())
    refills_df = db.get('Refills', pd.DataFrame())
    vendors_df = db.get('Vendors', pd.DataFrame())

    # Calculate basic summary metrics
    cost_map = {}
    for _, p in products_df.iterrows():
        pid = str(p.get('PRODUCT_ID', '')).strip()
        if not pid or pid.lower() == 'nan': continue
        cost = p.get('PO', 0)
        try: cost_map[pid] = float(cost) if pd.notna(cost) else 0
        except: cost_map[pid] = 0

    total_stock_value = 0
    total_units = 0
    for _, s in stock_df.iterrows():
        pid = str(s.get('Product_ID', '')).strip()
        qty = s.get('Current_Stock', 0)
        qty = float(qty) if pd.notna(qty) else 0
        total_units += qty
        total_stock_value += (qty * cost_map.get(pid, 0))

    active_machines = len(machines_df[machines_df['Status'].str.strip() == 'Active']) if not machines_df.empty else 0
    out_of_stock = len(stock_df[stock_df['Current_Stock'] <= 0]) if not stock_df.empty else 0

    return jsonify({
        'products': df_to_safe_dict(products_df),
        'machines': df_to_safe_dict(machines_df),
        'stock': df_to_safe_dict(stock_df),
        'sales': df_to_safe_dict(sales_df),
        'purchases': df_to_safe_dict(purchases_df),
        'refills': df_to_safe_dict(refills_df),
        'vendors': df_to_safe_dict(vendors_df),
        'metrics': {
            'totalStockValue': float(total_stock_value) if pd.notna(total_stock_value) else 0,
            'totalUnits': int(total_units) if pd.notna(total_units) else 0,
            'activeMachines': int(active_machines),
            'outOfStock': int(out_of_stock)
        }
    })

@app.route('/api/sell', methods=['POST'])
def sell_product():
    data = request.json
    mid, pid, qty = data.get('machineId'), data.get('productId'), int(data.get('qty', 1))
    stock_df = db.get('Stock')
    mask = (stock_df['Machine_ID'].astype(str) == str(mid)) & (stock_df['Product_ID'].astype(str) == str(pid))
    if not stock_df[mask].empty:
        idx = stock_df[mask].index[0]
        if stock_df.at[idx, 'Current_Stock'] >= qty:
            stock_df.at[idx, 'Current_Stock'] -= qty
            db['Sales'] = pd.concat([db.get('Sales'), pd.DataFrame([{
                'Date': datetime.now().strftime('%Y-%m-%d'),
                'Machine_ID': mid, 'Product_ID': pid, 'Qty Sold': qty, 'Selling_Price': data.get('price', 0)
            }])], ignore_index=True)
            save_sheet('Stock'); save_sheet('Sales')
            return jsonify({'success': True})
    return jsonify({'error': 'Insufficient stock or not found'}), 400

@app.route('/api/refill', methods=['POST'])
def refill_product():
    data = request.json
    mid, pid, qty = data.get('machineId'), data.get('productId'), int(data.get('qty', 0))
    stock_df = db.get('Stock')
    mask = (stock_df['Machine_ID'].astype(str) == str(mid)) & (stock_df['Product_ID'].astype(str) == str(pid))
    if not stock_df[mask].empty:
        stock_df.at[stock_df[mask].index[0], 'Current_Stock'] += qty
    else:
        stock_df = pd.concat([stock_df, pd.DataFrame([{'Machine_ID': mid, 'Product_ID': pid, 'Current_Stock': qty}])], ignore_index=True)
    db['Stock'] = stock_df
    db['Refills'] = pd.concat([db.get('Refills'), pd.DataFrame([{
        'Date': datetime.now().strftime('%Y-%m-%d'),
        'Refiller_ID': data.get('refillerId', 'R001'),
        'Machine_ID': mid, 'Product_ID': pid, 'Qty': qty
    }])], ignore_index=True)
    save_sheet('Stock'); save_sheet('Refills')
    return jsonify({'success': True})

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=PORT, debug=True)
