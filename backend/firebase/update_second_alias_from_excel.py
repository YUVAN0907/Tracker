import argparse
from pathlib import Path
import pandas as pd

from dataconnect_db import execute_graphql

SHEET_NAME = "Product_Master"
DEFAULT_EXCEL = Path(__file__).resolve().parents[1].parent / "Inventory_sheet.xlsx"
FALLBACK_EXCEL = Path(__file__).resolve().parents[1].parent / "Inventory_sheet_copy.xlsx"


def clean_value(value):
    if pd.isna(value):
        return None
    return str(value).strip()


def load_excel(excel_path: Path):
    try:
        return pd.ExcelFile(excel_path, engine="openpyxl")
    except PermissionError:
        if FALLBACK_EXCEL.exists():
            print(f"WARNING: cannot open {excel_path}; using fallback {FALLBACK_EXCEL}")
            return pd.ExcelFile(FALLBACK_EXCEL, engine="openpyxl")
        raise


def find_second_alias_column(columns):
    candidates = [
        "SECOND ALIAS NAME",
        "SECOND_ALIAS_NAME",
        "SECONDALIAS",
        "ALIAS2",
        "ALIAS 2",
        "SECOND ALIAS",
        "ALIAS NAME 2",
    ]
    for c in columns:
        uc = str(c).strip().upper()
        if uc in candidates:
            return c
    # try contains
    for c in columns:
        uc = str(c).strip().upper()
        if "SECOND" in uc and "ALIAS" in uc:
            return c
    return None


def load_product_master(excel_path: Path):
    xls = load_excel(excel_path)
    df = pd.read_excel(xls, sheet_name=SHEET_NAME, engine="openpyxl")
    df_original_cols = list(df.columns)
    df.columns = [str(c).strip().upper() for c in df.columns]

    if "PRODUCT_ID" not in df.columns:
        raise ValueError(f"Sheet '{SHEET_NAME}' must contain PRODUCT_ID column.")

    # Find the original column name for second alias
    second_col = find_second_alias_column(df_original_cols)
    # If not found by original names, try uppercase header keys
    if not second_col:
        # map back from uppercase columns
        for orig, up in zip(df_original_cols, df.columns):
            if up in ["SECOND ALIAS NAME", "SECOND_ALIAS_NAME", "SECONDALIAS", "ALIAS2", "ALIAS 2", "SECOND ALIAS", "ALIAS NAME 2"]:
                second_col = orig
                break

    rows_by_id = {}
    for _, row in df.iterrows():
        product_id = clean_value(row.get("PRODUCT_ID"))
        if not product_id:
            continue
        second_alias = None
        if second_col:
            # try using original df (before uppercasing)
            try:
                second_alias = clean_value(row.get(second_col))
            except Exception:
                second_alias = clean_value(row.get(str(second_col).upper()))
        # fallback: try common column names in uppercase
        if not second_alias:
            for cand in ["SECOND ALIAS NAME", "SECOND_ALIAS_NAME", "SECONDALIAS", "ALIAS2", "ALIAS 2"]:
                if cand in df.columns:
                    second_alias = clean_value(row.get(cand))
                    break

        rows_by_id[product_id] = {
            "productId": product_id,
            "secondAliasName": second_alias or "",
        }

    return list(rows_by_id.values())


def fetch_all_products():
    query = """
    query GetProducts {
      products(limit: 10000) {
                productId
                aliasName
                vendorId
                # include secondAliasName if server supports it
                secondAliasName
      }
    }
    """
    data = execute_graphql(query)
    return data.get("products", [])


def upsert_product_alias(product_data: dict):
        # product_upsert requires non-null vendorId in Product_Data; include it
        mutation = """
        mutation UpsertProduct($productId: String!, $vendorId: String!, $secondAliasName: String) {
            product_upsert(data: { productId: $productId, vendorId: $vendorId, secondAliasName: $secondAliasName })
        }
        """
        return execute_graphql(mutation, product_data)


def main():
    parser = argparse.ArgumentParser(description="Sync second alias name from Inventory_sheet.xlsx to products.")
    parser.add_argument("--excel", type=Path, default=DEFAULT_EXCEL, help="Path to Inventory_sheet.xlsx")
    parser.add_argument("--apply", action="store_true", help="Apply changes to Data Connect")
    parser.add_argument("--dry-run", action="store_true", help="Show planned changes without applying them")
    args = parser.parse_args()

    excel_path = args.excel
    product_rows = load_product_master(excel_path)
    print(f"Loaded {len(product_rows)} rows from '{SHEET_NAME}' sheet.")

    current_products = fetch_all_products()
    existing_product_ids = {p.get("productId"): p for p in current_products if p.get("productId")}
    print(f"Fetched {len(current_products)} products from Data Connect.")

    updates = []
    missing = []

    for row in product_rows:
        pid = row["productId"]
        new_alias = row.get("secondAliasName") or ""
        if pid not in existing_product_ids:
            missing.append(row)
            continue
        current = existing_product_ids.get(pid)
        current_alias = (current.get("secondAliasName") or "") if current else ""
        if new_alias and new_alias != current_alias:
            updates.append((pid, current_alias, new_alias))

    print(f"\nPlanned updates: {len(updates)}")
    for pid, old, new in updates[:50]:
        print(f"  - {pid}: {old!r} -> {new!r}")
    if len(updates) > 50:
        print(f"  ... and {len(updates)-50} more")

    print(f"\nRows with missing products in DB: {len(missing)}")
    for row in missing[:50]:
        print(f"  - {row['productId']} secondAlias={row.get('secondAliasName')}")
    if len(missing) > 50:
        print(f"  ... and {len(missing)-50} more")

    if args.apply:
        if not updates:
            print("No updates to apply.")
            return
        applied = 0
        for pid, _, new in updates:
            current = existing_product_ids.get(pid) or {}
            vendor_id = current.get("vendorId")
            if not vendor_id:
                print(f"Skipping {pid}: vendorId missing for product in DB")
                continue
            try:
                upsert_product_alias({"productId": pid, "vendorId": vendor_id, "secondAliasName": new})
                applied += 1
                print(f"Applied {pid}")
            except Exception as e:
                print(f"Failed to apply {pid}: {e}")
        print(f"Applied {applied}/{len(updates)} updates.")
    else:
        print("\nDry run mode: no changes were applied. Use --apply to perform inserts/updates.")


if __name__ == "__main__":
    main()
