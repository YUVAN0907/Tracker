import pandas as pd
import json

EXCEL_FILE = r'C:\Users\YUVANSANKAR R\Inv\Inventory\vendbees_app\ventory_sheet.xlsx'

result = {}

with pd.ExcelFile(EXCEL_FILE) as xls:
    for sheet_name in xls.sheet_names:
        df = pd.read_excel(xls, sheet_name=sheet_name)
        result[sheet_name] = {
            "columns": df.columns.tolist(),
            "sample": df.head(5).to_dict(orient='records')
        }

print(json.dumps(result, indent=2))
