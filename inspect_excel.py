import pandas as pd

EXCEL_FILE = r'C:\Users\YUVANSANKAR R\Inv\Inventory\vendbees_app\ventory_sheet.xlsx'

with pd.ExcelFile(EXCEL_FILE) as xls:
    for sheet_name in xls.sheet_names:
        print(f"--- Sheet: {sheet_name} ---")
        df = pd.read_excel(xls, sheet_name=sheet_name)
        print(df.columns.tolist())
        print(df.head(2))
        print("\n")
