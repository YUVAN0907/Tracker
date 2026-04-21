import pandas as pd
from pathlib import Path
path = Path(__file__).resolve().parent / 'Inventory_sheet.xlsx'
df = pd.read_excel(path, sheet_name='Product_Master', engine='openpyxl')
cols = [str(c).strip().upper() for c in df.columns]
df.columns = cols
print('total rows:', len(df))
print('columns:', cols)
product_ids = df['PRODUCT_ID'].astype(str).str.strip().replace('nan', '')
product_ids = product_ids[product_ids != '']
print('unique PRODUCT_ID:', product_ids.nunique())
print('missing PRODUCT_ID rows:', df['PRODUCT_ID'].isna().sum())
dup = product_ids[product_ids.duplicated(keep=False)]
print('duplicate PRODUCT_ID count:', len(dup))
print('sample duplicates:', dup.unique().tolist())
