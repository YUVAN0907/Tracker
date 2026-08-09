import pandas as pd
import json
from dataconnect_db import execute_graphql
import sys
from pathlib import Path

EXCEL_PATH = Path(__file__).resolve().parents[1].parent / "Inventory_sheet.xlsx"
SHEET_NAME = "Product_Master"

PRODUCTS_QUERY = """query GetProducts { products(limit: 10000) { productId productName category vendorId mrp quantity units gst unitCost landedCost eanNo selfLife } }"""


def clean_name(n):
    # Treat NaN, empty, and common placeholders as empty
    if pd.isna(n):
        return ""
    s = str(n).strip()
    if not s:
        return ""
    # common placeholders that mean 'no value'
    placeholders = {"-", "--", "—", "–", "na", "n/a", "none", "."}
    if s.lower() in placeholders:
        return ""
    return s


def find_column(df, candidates):
    cols = {c.lower().strip(): c for c in df.columns}
    for cand in candidates:
        key = cand.lower().strip()
        if key in cols:
            return cols[key]
    # try fuzzy contains
    for col in df.columns:
        low = col.lower()
        for cand in candidates:
            if cand.lower().strip() in low:
                return col
    return None


def main():
    if not EXCEL_PATH.exists():
        print(f"Excel file not found: {EXCEL_PATH}")
        sys.exit(1)

    df = pd.read_excel(EXCEL_PATH, sheet_name=SHEET_NAME, engine='openpyxl')
    # identify product name and alias columns
    prod_col = find_column(df, ["Product Name", "PRODUCT NAME", "product_name", "product name"])
    alias_col = find_column(df, ["Alias Name", "AliasName", "alias_name", "alias name"])

    if prod_col is None:
        print("Could not find Product Name column in Excel. Columns:", list(df.columns))
        sys.exit(1)

    print(f"Using product column: '{prod_col}' and alias column: '{alias_col}'")

    excel_map = {}
    excel_no_alias = []
    for _, row in df.iterrows():
        pname = clean_name(row.get(prod_col))
        if not pname:
            continue
        alias = clean_name(row.get(alias_col)) if alias_col else ""
        if alias:
            excel_map[pname.lower()] = alias
        else:
            excel_no_alias.append(pname)

    print(f"Excel rows with alias: {len(excel_map)}")
    print(f"Excel rows without alias: {len(excel_no_alias)}")

    # Fetch products from dataconnect
    print("Fetching products from Data Connect...")
    res = execute_graphql(PRODUCTS_QUERY)
    products = res.get('products', []) if res else []
    print(f"Products fetched: {len(products)}")

    to_update = []
    db_no_match = []

    # index excel_map keys for matching
    for p in products:
        pname = clean_name(p.get('productName'))
        if not pname:
            db_no_match.append({'productId': p.get('productId'), 'reason': 'no productName'})
            continue
        alias = excel_map.get(pname.lower())
        if alias:
            current_alias = p.get('aliasName')
            if not current_alias or current_alias.strip() == "":
                to_update.append({
                    'productId': p.get('productId'),
                    'productName': pname,
                    'currentAlias': current_alias,
                    'newAlias': alias
                })
        else:
            # not found in excel with alias
            db_no_match.append({'productId': p.get('productId'), 'productName': pname})

    # Excel entries that didn't match any DB product
    excel_unmatched = []
    db_names = {clean_name(p.get('productName')).lower() for p in products if p.get('productName')}
    for name_lower, alias in excel_map.items():
        if name_lower not in db_names:
            excel_unmatched.append({'productName': name_lower, 'alias': alias})

    result = {
        'excel_alias_count': len(excel_map),
        'excel_no_alias_count': len(excel_no_alias),
        'excel_no_alias_sample': excel_no_alias[:50],
        'products_fetched': len(products),
        'to_update_count': len(to_update),
        'to_update_sample': to_update[:50],
        'db_no_match_sample': db_no_match[:50],
        'excel_unmatched_sample': excel_unmatched[:50]
    }

    out_path = Path(__file__).resolve().parent / 'alias_analysis_result.json'
    with open(out_path, 'w', encoding='utf-8') as f:
        json.dump(result, f, indent=2, ensure_ascii=False)

    print(json.dumps(result, indent=2, ensure_ascii=False))
    print(f"Wrote analysis result to: {out_path}")


if __name__ == '__main__':
    main()
