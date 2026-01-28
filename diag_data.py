import pandas as pd
import os
import numpy as np

EXCEL_FILE = r'C:\Users\YUVANSANKAR R\Inv\Inventory\vendbees_app\ventory_sheet.xlsx'

SHEET_MAP = {
    'Products': 'Product_Master',
    'Machines': 'Machine_Master',
    'Stock': 'Current_Stock',
    'Sales': 'Sales_Log',
    'Purchases': 'Vendor_Purchase',
    'Refills': 'Machine_Refill_Log',
    'Vendors': 'Vendor_Master'
}

def clean_df(df):
    if df.empty: return df
    df.columns = df.columns.astype(str).str.strip()
    return df

with pd.ExcelFile(EXCEL_FILE) as xls:
    for key, sname in SHEET_MAP.items():
        if sname in xls.sheet_names:
            df = pd.read_excel(xls, sheet_name=sname)
            df = clean_df(df)
            print(f"--- {sname} ---")
            print(f"Columns: {df.columns.tolist()}")
            if key == 'Machines':
                print(f"Status values: {df['Status'].unique().tolist()}")
                print(f"Active count: {len(df[df['Status'] == 'Active'])}")
            if key == 'Products':
                print(f"First 5 Product IDs: {df.iloc[:5]['PRODUCT_ID'].tolist()}")
            if key == 'Refills':
                print(f"First 5 Machine IDs: {df.iloc[:5]['Machine_ID'].tolist()}")
            if key == 'Sales':
                print(f"Columns: {df.columns.tolist()}")
            print("\n")
