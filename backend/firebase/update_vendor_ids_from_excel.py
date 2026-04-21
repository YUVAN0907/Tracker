import argparse
from pathlib import Path
import pandas as pd

from dataconnect_db import execute_graphql

SHEET_NAME = "Product_Master"
VENDOR_SHEET_NAME = "Vendor_Master"
DEFAULT_EXCEL = Path(__file__).resolve().parents[1].parent / "Inventory_sheet.xlsx"
FALLBACK_EXCEL = Path(__file__).resolve().parents[1].parent / "Inventory_sheet_copy.xlsx"


def clean_value(value):
    if pd.isna(value):
        return None
    if isinstance(value, float) and value.is_integer():
        value = int(value)
    return str(value).strip()


def parse_int(value):
    if pd.isna(value):
        return None
    if isinstance(value, (int, float)):
        if float(value).is_integer():
            return int(value)
        return int(value)
    value = str(value).strip()
    if not value:
        return None
    try:
        return int(float(value))
    except ValueError:
        return None


def parse_float(value):
    if pd.isna(value):
        return None
    value = str(value).strip()
    if not value:
        return None
    try:
        return float(value)
    except ValueError:
        return None


def normalize_vendor_id(vendor_id):
    if not vendor_id:
        return None
    vendor_id = clean_value(vendor_id)
    return vendor_id.replace("/", "_")


def load_excel(excel_path: Path):
    try:
        return pd.ExcelFile(excel_path, engine="openpyxl")
    except PermissionError:
        if FALLBACK_EXCEL.exists():
            print(f"WARNING: cannot open {excel_path}; using fallback {FALLBACK_EXCEL}")
            return pd.ExcelFile(FALLBACK_EXCEL, engine="openpyxl")
        raise


def load_product_master(excel_path: Path):
    xls = load_excel(excel_path)
    df = pd.read_excel(xls, sheet_name=SHEET_NAME, engine="openpyxl")
    df.columns = [str(c).strip().upper() for c in df.columns]
    if "PRODUCT_ID" not in df.columns or "VENDOR_ID" not in df.columns:
        raise ValueError(f"Sheet '{SHEET_NAME}' must contain PRODUCT_ID and VENDOR_ID columns.")

    rows_by_id = {}
    for _, row in df.iterrows():
        product_id = clean_value(row.get("PRODUCT_ID"))
        if not product_id:
            continue
        raw_vendor_id = clean_value(row.get("VENDOR_ID"))
        rows_by_id[product_id] = {
            "productId": product_id,
            "productName": clean_value(row.get("PRODUCT_NAME")),
            "category": clean_value(row.get("CATEGORY")),
            "sourceVendorId": raw_vendor_id,
            "vendorId": normalize_vendor_id(raw_vendor_id),
            "mrp": parse_float(row.get("MRP")) or 0.0,
            "gst": parse_float(row.get("GST")) or 0.0,
            "units": parse_int(row.get("UNITS")) or 0,
            "unitCost": parse_float(row.get("PO")) or 0.0,
        }

    rows = list(rows_by_id.values())
    for item in rows:
        unit_cost = item["unitCost"]
        gst = item["gst"]
        item["landedCost"] = round(unit_cost + (unit_cost * gst / 100) if gst > 1 else unit_cost + (unit_cost * gst), 2)
    return rows


def load_vendor_master(excel_path: Path):
    xls = load_excel(excel_path)
    df = pd.read_excel(xls, sheet_name=VENDOR_SHEET_NAME, engine="openpyxl")
    df.columns = [str(c).strip().upper() for c in df.columns]
    if "VENDOR ID" not in df.columns or "VENDOR" not in df.columns:
        raise ValueError(f"Sheet '{VENDOR_SHEET_NAME}' must contain VENDOR ID and VENDOR columns.")

    vendor_map = {}
    for _, row in df.iterrows():
        vendor_id = clean_value(row.get("VENDOR ID"))
        if not vendor_id:
            continue
        vendor_map[vendor_id] = {
            "vendorId": vendor_id,
            "vendorName": clean_value(row.get("VENDOR")) or vendor_id,
            "address": clean_value(row.get("ADDRESS")),
            "mobileNumber": clean_value(row.get("MOBILE NUMBER (1*)")),
            "secondaryNumber": clean_value(row.get("SECONDARY NUMBER")),
            "email": clean_value(row.get("E-MAIL ID")),
            "gstNo": clean_value(row.get("GST")),
        }
    return vendor_map


def make_combined_vendor(vendor_id: str, vendor_rows: dict):
    parts = [clean_value(part) for part in vendor_id.split("/") if clean_value(part)]
    if len(parts) < 2:
        return None
    vendor_names = []
    for part in parts:
        if part in vendor_rows:
            vendor_names.append(vendor_rows[part]["vendorName"])
        else:
            vendor_names.append(part)
    combined_name = " / ".join(vendor_names)
    return {
        "vendorId": normalize_vendor_id(vendor_id),
        "vendorName": combined_name,
        "address": None,
        "mobileNumber": None,
        "secondaryNumber": None,
        "email": None,
        "gstNo": None,
    }


def fetch_all_products():
    query = """
    query GetProducts {
      products(limit: 10000) {
        productId
        vendorId
        productName
      }
    }
    """
    data = execute_graphql(query)
    return data.get("products", [])


def fetch_valid_vendor_ids():
    query = """
    query GetVendors {
      vendors(limit: 1000) {
        vendorId
      }
    }
    """
    data = execute_graphql(query)
    return {clean_value(v.get("vendorId")) for v in data.get("vendors", []) if v.get("vendorId")}


def upsert_vendor(vendor_data: dict):
    mutation = """
    mutation UpsertVendor(
      $vendorId: String!,
      $vendorName: String,
      $address: String,
      $mobileNumber: String,
      $secondaryNumber: String,
      $email: String,
      $gstNo: String
    ) {
      vendor_upsert(data: {
        vendorId: $vendorId,
        vendorName: $vendorName,
        address: $address,
        mobileNumber: $mobileNumber,
        secondaryNumber: $secondaryNumber,
        email: $email,
        gstNo: $gstNo
      })
    }
    """
    return execute_graphql(mutation, vendor_data)


def upsert_product(product_data: dict):
    allowed_keys = {
        "productId",
        "productName",
        "category",
        "vendorId",
        "mrp",
        "gst",
        "units",
        "unitCost",
        "landedCost",
    }
    product_data = {k: v for k, v in product_data.items() if k in allowed_keys}
    mutation = """
    mutation UpsertProduct(
      $productId: String!,
      $productName: String,
      $category: String,
      $vendorId: String!,
      $mrp: Float,
      $gst: Float,
      $units: Int,
      $unitCost: Float,
      $landedCost: Float
    ) {
      product_upsert(data: {
        productId: $productId,
        productName: $productName,
        category: $category,
        vendorId: $vendorId,
        mrp: $mrp,
        gst: $gst,
        units: $units,
        unitCost: $unitCost,
        landedCost: $landedCost
      })
    }
    """
    return execute_graphql(mutation, product_data)


def main():
    parser = argparse.ArgumentParser(description="Sync products and vendor IDs from Inventory_sheet.xlsx.")
    parser.add_argument("--excel", type=Path, default=DEFAULT_EXCEL, help="Path to Inventory_sheet.xlsx")
    parser.add_argument("--apply", action="store_true", help="Apply changes to Firebase Data Connect")
    parser.add_argument("--dry-run", action="store_true", help="Show planned changes without applying them")
    args = parser.parse_args()

    excel_path = args.excel
    product_rows = load_product_master(excel_path)
    vendor_rows = load_vendor_master(excel_path)
    print(f"Loaded {len(product_rows)} products from '{SHEET_NAME}' sheet.")
    print(f"Loaded {len(vendor_rows)} vendors from '{VENDOR_SHEET_NAME}' sheet.")

    current_products = fetch_all_products()
    existing_product_ids = {clean_value(p.get("productId")) for p in current_products if p.get("productId")}
    current_vendor_ids = fetch_valid_vendor_ids()
    print(f"Fetched {len(current_products)} products from Data Connect.")
    print(f"Fetched {len(current_vendor_ids)} vendors from Data Connect.")

    referenced_vendor_ids = {
        clean_value(row.get("sourceVendorId"))
        for row in product_rows
        if clean_value(row.get("sourceVendorId"))
    }

    vendors_to_insert = {}
    vendor_missing_info = []

    for raw_vendor_id in referenced_vendor_ids:
        normalized_vendor_id = normalize_vendor_id(raw_vendor_id)
        if normalized_vendor_id in current_vendor_ids:
            continue
        if raw_vendor_id in vendor_rows:
            vendor_data = vendor_rows[raw_vendor_id].copy()
            vendor_data["vendorId"] = normalized_vendor_id
            vendors_to_insert[normalized_vendor_id] = vendor_data
            continue
        if "/" in raw_vendor_id:
            combined = make_combined_vendor(raw_vendor_id, vendor_rows)
            if combined:
                vendors_to_insert[combined["vendorId"]] = combined
            else:
                vendor_missing_info.append(raw_vendor_id)
            continue
        vendor_missing_info.append(raw_vendor_id)

    valid_vendor_ids = current_vendor_ids.union(vendors_to_insert.keys())

    missing_products = []
    updates = []
    skipped_invalid_vendor = []

    for row in product_rows:
        product_id = row["productId"]
        vendor_id = clean_value(row.get("vendorId"))
        if not vendor_id:
            skipped_invalid_vendor.append((product_id, row.get("productName"), "missing vendorId"))
            continue
        if vendor_id not in valid_vendor_ids:
            skipped_invalid_vendor.append((product_id, row.get("productName"), vendor_id))
            continue

        if product_id not in existing_product_ids:
            missing_products.append(row)
            continue

        current_vendor = clean_value(next((p.get("vendorId") for p in current_products if clean_value(p.get("productId")) == product_id), None))
        if current_vendor != vendor_id:
            updates.append((product_id, current_vendor, vendor_id, row.get("productName")))

    print(f"\nVendor rows to insert: {len(vendors_to_insert)}")
    for vendor_id, vendor_data in vendors_to_insert.items():
        print(f"  - {vendor_id}: {vendor_data.get('vendorName')}")
    if vendor_missing_info:
        print(f"\nMissing vendor details in Excel for: {vendor_missing_info}")

    print(f"\nMissing products to insert: {len(missing_products)}")
    for row in missing_products[:50]:
        print(f"  - {row['productId']} ({row.get('productName')}) vendor={row.get('sourceVendorId')} -> db={row.get('vendorId')}")
    if len(missing_products) > 50:
        print(f"  ... and {len(missing_products)-50} more")

    print(f"\nExisting products needing vendorId update: {len(updates)}")
    for product_id, old_vendor, new_vendor, name in updates[:50]:
        print(f"  - {product_id} ({name}): {old_vendor!r} -> {new_vendor!r}")
    if len(updates) > 50:
        print(f"  ... and {len(updates)-50} more")

    if skipped_invalid_vendor:
        print(f"\nProducts skipped because vendorId is not valid or not present in vendor master: {len(skipped_invalid_vendor)}")
        for product_id, name, bad_vendor in skipped_invalid_vendor[:50]:
            print(f"  - {product_id} ({name}) vendor={bad_vendor}")
        if len(skipped_invalid_vendor) > 50:
            print(f"  ... and {len(skipped_invalid_vendor)-50} more")

    if args.apply:
        if vendors_to_insert:
            print("\nInserting missing vendors...")
            for vendor_id, vendor_data in vendors_to_insert.items():
                try:
                    upsert_vendor(vendor_data)
                    print(f"  Inserted vendor {vendor_id}")
                except Exception as e:
                    print(f"  Failed to insert vendor {vendor_id}: {e}")
        else:
            print("\nNo vendor inserts required.")

        if missing_products:
            print("\nInserting missing products...")
            inserted = 0
            for row in missing_products:
                try:
                    upsert_product(row)
                    inserted += 1
                    print(f"  Inserted product {row['productId']}")
                except Exception as e:
                    print(f"  Failed to insert product {row['productId']}: {e}")
            print(f"Inserted {inserted}/{len(missing_products)} missing products.")
        else:
            print("\nNo missing products to insert.")

        if updates:
            print("\nUpdating vendorId on existing products...")
            updated = 0
            for product_id, _, vendor_id, _ in updates:
                try:
                    upsert_product({"productId": product_id, "vendorId": vendor_id})
                    updated += 1
                    print(f"  Updated product {product_id} vendorId={vendor_id}")
                except Exception as e:
                    print(f"  Failed to update {product_id}: {e}")
            print(f"Updated {updated}/{len(updates)} products.")
        else:
            print("\nNo existing product vendor updates required.")
    else:
        print("\nDry run mode: no changes were applied. Use --apply to perform inserts/updates.")


if __name__ == "__main__":
    main()
