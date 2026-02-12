import pandas as pd

EXCEL_FILE = r'C:\Users\YUVANSANKAR R\Inv\Inventory\vendbees_app\ventory_sheet.xlsx'

with pd.ExcelFile(EXCEL_FILE) as xls:
    if 'Product_Master' in xls.sheet_names:
        df = pd.read_excel(xls, sheet_name='Product_Master')
        print("GST Values Sample:", df['GST'].head(10).tolist())
