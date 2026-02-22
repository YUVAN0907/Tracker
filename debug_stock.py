import pandas as pd

file = r'C:\Users\Bharani\OneDrive\Desktop\Tracker\backend\temp_update.xlsx'

pm = pd.read_excel(file, 'Product_Master')
stock = pd.read_excel(file, 'Current_Stock')

# Create lookups
cost_lookup = pm.dropna(subset=['PRODUCT_ID']).set_index('PRODUCT_ID')['PO'].to_dict()
mrp_lookup = pm.dropna(subset=['PRODUCT_ID']).set_index('PRODUCT_ID')['MRP'].to_dict()

# Filter for VM001
vm001 = stock[stock['Machine_ID'] == 'VM001'].copy()
vm001['po'] = vm001['Product_ID'].map(cost_lookup).fillna(0)
vm001['mrp'] = vm001['Product_ID'].map(mrp_lookup).fillna(0)
vm001['val_po'] = vm001['Current_Stock'] * vm001['po']
vm001['val_mrp'] = vm001['Current_Stock'] * vm001['mrp']

print('VM001 Stock breakdown:')
print(vm001[['Product_ID', 'Current_Stock', 'po', 'mrp', 'val_po', 'val_mrp']].to_string())
print()
print(f'Total Stock Value for VM001 (using PO): {vm001["val_po"].sum():,.2f}')
print(f'Total Stock Value for VM001 (using MRP): {vm001["val_mrp"].sum():,.2f}')
