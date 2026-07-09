import openpyxl

excel_file = r"C:\Users\Bharani\OneDrive\Documents\Tracker1\Inventory_sheet.xlsx"
wb = openpyxl.load_workbook(excel_file, data_only=True)

print("Sheet names in workbook:")
for sheet_name in wb.sheetnames:
    print(f"  - {sheet_name}")
