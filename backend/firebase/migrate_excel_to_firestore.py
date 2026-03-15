"""
Migration Script: Excel/SharePoint → Firebase Firestore
Reads from existing Excel file and writes each sheet as a Firestore collection.
Run once: python migrate_excel_to_firestore.py <path_to_excel>
"""
import os
import sys
import numpy as np
import pandas as pd

sys.path.insert(0, os.path.dirname(__file__))
from firebase_config import db

# Sheet → Collection mapping (same as server.py SHEET_MAP)
SHEET_MAP = {
    "Product_Master": "Products",
    "Machine_Master": "Machines",
    "Current_Stock": "Stock",
    "Sales_Log": "Sales",
    "Vendor_Purchase": "Purchases",
    "Machine_Refill_Log": "Refills",
    "Vendor_Master": "Vendors",
    "Warehouse_Stock": "Warehouse",
    "Purchased_Products": "Purchased_Products",
    "Stocks": "Stocks",
    "Stock_Products": "Stock_Products",
    "Stock_Assignments": "Stock_Assignments",
    "OUR_PO": "OUR_PO"
}

# Document ID field for collections (use as Firestore doc ID if present)
DOC_ID_FIELDS = {
    "Products": "PRODUCT_ID",
    "Warehouse": "Product_ID",
    "Purchased_Products": "EXP_Id"
}


def clean_value(val):
    """Convert pandas NaN/NaT/Inf to None for Firestore compatibility."""
    if val is None:
        return None
    if isinstance(val, float) and (np.isnan(val) or np.isinf(val)):
        return None
    if isinstance(val, pd.Timestamp):
        return val.strftime("%Y-%m-%d %H:%M:%S")
    if isinstance(val, np.integer):
        return int(val)
    if isinstance(val, np.floating):
        return float(val)
    if isinstance(val, str):
        stripped = val.strip()
        return stripped if stripped else None
    return val


def clean_row(row_dict):
    """Clean all values in a row dict."""
    return {k: clean_value(v) for k, v in row_dict.items()}


def migrate(excel_path, dry_run=False):
    """Migrate Excel sheets to Firestore collections."""
    if not os.path.exists(excel_path):
        print(f"❌ File not found: {excel_path}")
        sys.exit(1)

    print(f"📂 Reading Excel file: {excel_path}")
    xls = pd.ExcelFile(excel_path, engine="openpyxl")
    print(f"   Found sheets: {xls.sheet_names}")

    total_docs = 0

    for sheet_name, collection_name in SHEET_MAP.items():
        if sheet_name not in xls.sheet_names:
            print(f"   ⚠️  Sheet '{sheet_name}' not found, skipping")
            continue

        df = pd.read_excel(xls, sheet_name)
        df.columns = df.columns.astype(str).str.strip()

        # Drop completely empty rows
        df = df.dropna(how="all")

        if df.empty:
            print(f"   📋 {sheet_name} → {collection_name}: 0 rows (empty)")
            continue

        print(f"   📋 {sheet_name} → {collection_name}: {len(df)} rows")

        doc_id_field = DOC_ID_FIELDS.get(collection_name)
        batch = db.batch()
        batch_count = 0

        for idx, row in df.iterrows():
            row_dict = clean_row(row.to_dict())

            # Remove all-None rows
            if all(v is None for v in row_dict.values()):
                continue

            # Determine document ID
            doc_id = None
            if doc_id_field and row_dict.get(doc_id_field):
                doc_id = str(row_dict[doc_id_field]).strip()

            if dry_run:
                print(f"      [DRY RUN] Would write doc: {doc_id or 'auto'} → {row_dict}")
            else:
                if doc_id:
                    ref = db.collection(collection_name).document(doc_id)
                else:
                    ref = db.collection(collection_name).document()

                batch.set(ref, row_dict)
                batch_count += 1
                total_docs += 1

                # Firestore batch limit is 500
                if batch_count >= 450:
                    batch.commit()
                    batch = db.batch()
                    batch_count = 0

        # Commit remaining
        if batch_count > 0 and not dry_run:
            batch.commit()

    print(f"\n✅ Migration complete! Total documents written: {total_docs}")


if __name__ == "__main__":
    if len(sys.argv) < 2:
        # Default to the Excel file in backend directory
        default_path = os.path.join(os.path.dirname(__file__), "..", "ventory_sheet.xlsx")
        if os.path.exists(default_path):
            excel_path = default_path
        else:
            print("Usage: python migrate_excel_to_firestore.py <path_to_excel>")
            print("   Or place ventory_sheet.xlsx in the backend directory")
            sys.exit(1)
    else:
        excel_path = sys.argv[1]

    dry_run = "--dry-run" in sys.argv
    if dry_run:
        print("🔍 DRY RUN MODE — no data will be written\n")

    migrate(excel_path, dry_run=dry_run)
