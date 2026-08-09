from pathlib import Path
import json
from dataconnect_db import execute_graphql
import pandas as pd

EXCEL_PATH = Path(__file__).resolve().parents[1].parent / "Inventory_sheet.xlsx"
SHEET_NAME = "Product_Master"

def clean_name(n):
    if pd.isna(n):
        return ""
    s = str(n).strip()
    if not s:
        return ""
    placeholders = {"-", "--", "—", "–", "na", "n/a", "none", "."}
    if s.lower() in placeholders:
        return ""
    return s


MUTATION = '''
mutation UpsertProduct($productId: String!, $aliasName: String, $vendorId: String!) {
    product_upsert(data: { productId: $productId, aliasName: $aliasName, vendorId: $vendorId })
}
'''


def load_excel_map():
    df = pd.read_excel(EXCEL_PATH, sheet_name=SHEET_NAME, engine='openpyxl')
    prod_col = None
    alias_col = None
    cols = {c.lower().strip(): c for c in df.columns}
    for cand in ["Product Name", "PRODUCT NAME", "product_name", "product name"]:
        if cand.lower() in cols:
            prod_col = cols[cand.lower()]
            break
    for cand in ["Alias Name", "AliasName", "alias_name", "alias name", "ALIAS NAME"]:
        if cand.lower() in cols:
            alias_col = cols[cand.lower()]
            break

    excel_map = {}
    for _, row in df.iterrows():
        pname = clean_name(row.get(prod_col))
        if not pname:
            continue
        alias = clean_name(row.get(alias_col)) if alias_col else ""
        if alias:
            excel_map[pname.lower()] = alias
    return excel_map


def main():
    excel_map = load_excel_map()

    PRODUCTS_QUERY = """query GetProducts { products(limit: 10000) { productId productName aliasName vendorId } }"""
    res = execute_graphql(PRODUCTS_QUERY)
    products = res.get('products', []) if res else []

    to_update = []
    for p in products:
        pname = clean_name(p.get('productName'))
        if not pname:
            continue
        key = pname.lower()
        alias = excel_map.get(key)
        if alias:
            current_alias = p.get('aliasName')
            if not current_alias or clean_name(current_alias)=="":
                vendor = p.get('vendorId') or 'UNKNOWN'
                to_update.append((p.get('productId'), alias, vendor))

    print(f"Applying {len(to_update)} alias updates...")
    success = 0
    failures = []
    for pid, alias, vendor in to_update:
        try:
            variables = {"productId": pid, "aliasName": alias, "vendorId": vendor}
            execute_graphql(MUTATION, variables)
            success += 1
            print(f"Updated {pid} -> {alias}")
        except Exception as e:
            failures.append((pid, str(e)))
            print(f"Failed {pid}: {e}")

    print(f"Done. Success: {success}, Failures: {len(failures)}")
    if failures:
        print(json.dumps(failures, indent=2))


if __name__ == '__main__':
    main()
