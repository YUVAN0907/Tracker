import os
import time
import pandas as pd
from flask import Flask, jsonify, request
from flask_cors import CORS
from datetime import datetime
import threading

app = Flask(__name__)
CORS(app)


EXCEL_FILE = r'C:\Users\YUVANSANKAR R\Inv\Inventory\vendbees_app\ventory_sheet.xlsx'
PORT = 3001


SHEET_MAP = {
    'Products': 'Product_Master',
    'Machines': 'Machine_Master',
    'Stock': 'Current_Stock',
    'Sales': 'Sales_Log',
    'Purchases': 'Vendor_Purchase',
    'Refills': 'Machine_Refill_Log'
}


db = {}
last_file_mtime = 0

def get_timestamp():
    return datetime.now().strftime('%Y-%m-%d %H:%M:%S')

def load_data():
    """Reads the Excel file and populates the in-memory db."""
    global db, last_file_mtime
    
    if not os.path.exists(EXCEL_FILE):
        print(f"Error: Excel file not found at {EXCEL_FILE}")
        return False

    try:
        # Check if file has actually changed
        current_mtime = os.path.getmtime(EXCEL_FILE)
        if current_mtime == last_file_mtime:
            return True # No change

        print("Reloading data from Excel...")
        # Read all sheets
        with pd.ExcelFile(EXCEL_FILE) as xls:
            for internal_key, sheet_name in SHEET_MAP.items():
                if sheet_name in xls.sheet_names:
                    df = pd.read_excel(xls, sheet_name=sheet_name)
                    # Force conversion to ensuring NaNs can be replaced by None
                    df = df.astype(object).where(pd.notnull(df), None)
                    # Clean column names (strip spaces from headers)
                    df.columns = df.columns.astype(str).str.strip()
                    db[internal_key] = df
                else:
                    print(f"Warning: Sheet '{sheet_name}' not found.")
                    db[internal_key] = pd.DataFrame()
        
        last_file_mtime = current_mtime
        print("Data loaded successfully.")
        return True
    except Exception as e:
        print(f"Error reading Excel: {e}")
        return False

def save_sheet(internal_key):
    """Saves a specific dataframe back to the Excel sheet."""
    global last_file_mtime
    
    df = db.get(internal_key)
    if df is None:
        return

    sheet_name = SHEET_MAP[internal_key]
    
    try:
        # Use ExcelWriter with mode='a' and if_sheet_exists='replace'
        # This preserves other sheets
        with pd.ExcelWriter(EXCEL_FILE, engine='openpyxl', mode='a', if_sheet_exists='replace') as writer:
            df.to_excel(writer, sheet_name=sheet_name, index=False)
        
        # Update timestamp to prevent reload from seeing this as an external change immediately
        last_file_mtime = os.path.getmtime(EXCEL_FILE)
        print(f"Saved sheet '{sheet_name}' to Excel.")
    except Exception as e:
        print(f"Error saving to Excel: {e}")

# Initial Load
load_data()

# Background Polling for External Changes
def poll_excel():
    while True:
        try:
            if os.path.exists(EXCEL_FILE):
                current_mtime = os.path.getmtime(EXCEL_FILE)
                if current_mtime > last_file_mtime:
                    load_data()
        except Exception:
            pass
        time.sleep(2) # Poll every 2 seconds

# Start Polling Thread
threading.Thread(target=poll_excel, daemon=True).start()

# --- Routes ---

@app.route('/api/dashboard', methods=['GET'])
def get_dashboard():
    # Ensure fresh data (or rely on poll)
    # load_data() # Uncomment if you want strict immediate consistency vs polling
    
    products_df = db.get('Products', pd.DataFrame())
    machines_df = db.get('Machines', pd.DataFrame())
    stock_df = db.get('Stock', pd.DataFrame())
    sales_df = db.get('Sales', pd.DataFrame())
    
    # --- Metrics Logic ---
    total_stock_value = 0
    total_units = 0
    
    # Flexible column selection
    pid_col = 'PRODUCT_ID' if 'PRODUCT_ID' in products_df.columns else ('Product_ID' if 'Product_ID' in products_df.columns else 'PRODUCT_ID')
    cost_col = 'PO' if 'PO' in products_df.columns else ('Unit_Cost' if 'Unit_Cost' in products_df.columns else None)
    
    # Create Cost Map
    if pid_col in products_df.columns:
        products_df[pid_col] = products_df[pid_col].astype(str)
        if cost_col:
            cost_map = dict(zip(products_df[pid_col], products_df[cost_col]))
        else:
            cost_map = {}
    else:
        cost_map = {}
    
    # Calculate Value
    if not stock_df.empty:
        s_pid_col = 'Product_ID' if 'Product_ID' in stock_df.columns else 'PRODUCT_ID'
        stock_df[s_pid_col] = stock_df[s_pid_col].astype(str)
        
        # Iterate over stock rows
        for _, row in stock_df.iterrows():
            pid = str(row[s_pid_col])
            qty = row['Current_Stock'] if 'Current_Stock' in row and pd.notna(row['Current_Stock']) else 0
            cost = cost_map.get(pid, 0)
            try:
                # Handle "-" or non-numeric cost
                if isinstance(cost, str):
                    clean_cost = cost.replace(',', '').strip()
                    if clean_cost == '-' or clean_cost == '':
                        cost = 0
                    else:
                        cost = float(clean_cost)
                else:
                    cost = float(cost) if cost is not None else 0
                
                # Check for nan
                if pd.isna(cost): cost = 0

                qty = float(qty) if pd.notna(qty) else 0

                total_stock_value += (qty * cost)
                total_units += qty
            except (ValueError, TypeError):
                continue # Skip invalid rows

    active_machines = len(machines_df[machines_df['Status'] == 'Active']) if not machines_df.empty else 0
    out_of_stock = len(stock_df[stock_df['Current_Stock'] <= 0]) if not stock_df.empty else 0

    purchases_df = db.get('Purchases', pd.DataFrame())
    refills_df = db.get('Refills', pd.DataFrame())

    return jsonify({
        'products': products_df.to_dict(orient='records'),
        'machines': machines_df.to_dict(orient='records'),
        'stock': stock_df.to_dict(orient='records'),
        'sales': sales_df.to_dict(orient='records'),
        'purchases': purchases_df.to_dict(orient='records'),
        'refills': refills_df.to_dict(orient='records'),
        'metrics': {
            'totalStockValue': total_stock_value,
            'totalUnits': int(total_units),
            'activeMachines': active_machines,
            'outOfStock': out_of_stock
        }
    })

@app.route('/api/sell', methods=['POST'])
def sell_product():
    data = request.json
    machine_id = data.get('machineId')
    product_id = data.get('productId')
    qty = int(data.get('qty', 1))
    price = data.get('price', 0)
    
    stock_df = db.get('Stock')
    
    # Find row
    # Ensure types match
    mask = (stock_df['Machine_ID'] == machine_id) & (stock_df['Product_ID'] == product_id)
    
    if not stock_df[mask].empty:
        current_idx = stock_df[mask].index[0]
        current_stock = stock_df.at[current_idx, 'Current_Stock']
        
        if current_stock >= qty:
            # Update Stock
            stock_df.at[current_idx, 'Current_Stock'] = current_stock - qty
            db['Stock'] = stock_df
            save_sheet('Stock')
            
            # Log Sale
            sales_df = db.get('Sales')
            new_sale = {
                'Date': datetime.now().strftime('%Y-%m-%d'),
                'Machine_ID': machine_id,
                'Product_ID': product_id,
                'Qty Sold': qty, # Stripped to match load_data behavior
                'Selling_Price': price
            }
            # Append to sales log
            if sales_df.empty:
                db['Sales'] = pd.DataFrame([new_sale])
            else:
                 db['Sales'] = pd.concat([sales_df, pd.DataFrame([new_sale])], ignore_index=True)
            
            save_sheet('Sales')
            
            return jsonify({'success': True, 'newStock': int(current_stock - qty)})
        else:
            return jsonify({'error': 'Insufficient stock'}), 400
    else:
        return jsonify({'error': 'Item not found'}), 404

@app.route('/api/refill', methods=['POST'])
def refill_product():
    data = request.json
    machine_id = data.get('machineId')
    product_id = data.get('productId')
    qty = int(data.get('qty', 0))
    refiller_id = data.get('refillerId', 'REF-001')
    
    stock_df = db.get('Stock')
    
    mask = (stock_df['Machine_ID'] == machine_id) & (stock_df['Product_ID'] == product_id)
    
    if not stock_df[mask].empty:
        # Update existing
        current_idx = stock_df[mask].index[0]
        stock_df.at[current_idx, 'Current_Stock'] += qty
        current_val = stock_df.at[current_idx, 'Current_Stock']
    else:
        # Add new entry
        new_row = {
            'Machine_ID': machine_id,
            'Product_ID': product_id,
            'Current_Stock': qty
        }
        stock_df = pd.concat([stock_df, pd.DataFrame([new_row])], ignore_index=True)
        current_val = qty
    
    db['Stock'] = stock_df
    save_sheet('Stock')
    
    # Log Refill
    refills_df = db.get('Refills')
    new_refill = {
        'Date': datetime.now().strftime('%Y-%m-%d'),
        'Refiller_ID': refiller_id,
        'Machine_ID': machine_id,
        'Product_ID': product_id,
        'Qty': qty
    }
    if refills_df.empty:
        db['Refills'] = pd.DataFrame([new_refill])
    else:
        db['Refills'] = pd.concat([refills_df, pd.DataFrame([new_refill])], ignore_index=True)
    
    save_sheet('Refills')
    
    return jsonify({'success': True, 'newStock': int(current_val)})

if __name__ == '__main__':
    print(f"Starting Python Backend on port {PORT}")
    app.run(host='0.0.0.0', port=PORT, debug=True)
