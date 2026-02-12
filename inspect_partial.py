import pandas as pd
import json

EXCEL_FILE = r'C:\Users\YUVANSANKAR R\Inv\Inventory\vendbees_app\ventory_sheet.xlsx'

with pd.ExcelFile(EXCEL_FILE) as xls:
    if 'Product_Master' in xls.sheet_names:
        df = pd.read_excel(xls, sheet_name='Product_Master')
        print("Product_Master Columns:", df.columns.tolist())
        print("Sample:", df.head(1).to_dict(orient='records'))
    
    if 'Sales_Log' in xls.sheet_names:
        df = pd.read_excel(xls, sheet_name='Sales_Log')
        print("Sales_Log Columns:", df.columns.tolist())
        print("Sample:", df.head(1).to_dict(orient='records'))
