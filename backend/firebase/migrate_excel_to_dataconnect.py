"""
Migration Script: Inventory_sheet.xlsx -> Firebase Data Connect (PostgreSQL)
Steps:
  1. CLEAR existing data (children-first to respect FK constraints)
  2. INSERT from Excel in dependency order (parents first)

Usage:
  python migrate_excel_to_dataconnect.py [path_to_excel] [--dry-run]

Defaults to: ../Inventory_sheet.xlsx (relative to this script)
--dry-run : prints what would be done without touching Data Connect
"""

import os
import sys

# Ensure UTF-8 output on Windows (prevents charmap encoding errors)
if sys.platform == 'win32':
    os.environ.setdefault('PYTHONIOENCODING', 'utf-8')
    try:
        sys.stdout.reconfigure(encoding='utf-8', errors='replace')
        sys.stderr.reconfigure(encoding='utf-8', errors='replace')
    except AttributeError:
        pass  # Python < 3.7 fallback
import re
import uuid
import pandas as pd
from datetime import datetime

sys.path.insert(0, os.path.dirname(__file__))
from dataconnect_db import execute_graphql, format_timestamp

# ──────────────────────────────────────────────────────────────────────────────
# HELPERS
# ──────────────────────────────────────────────────────────────────────────────

def clean_str(val):
    if val is None: return None
    try:
        if pd.isna(val): return None
    except (TypeError, ValueError):
        pass
    v = str(val).strip()
    return v if v and v.lower() not in ("none", "nan", "-") else None

def clean_float(val, default=None):
    if val is None: return default
    try:
        if pd.isna(val): return default
    except (TypeError, ValueError):
        pass
    try: return float(val)
    except: return default

def clean_int(val, default=None):
    if val is None: return default
    try:
        if pd.isna(val): return default
    except (TypeError, ValueError):
        pass
    try: return int(float(val))
    except: return default

def clean_bool(val):
    if val is None: return None
    try:
        if pd.isna(val): return None
    except (TypeError, ValueError):
        pass
    s = str(val).strip().lower()
    return True if s in ("true", "yes", "1", "filed") else False if s in ("false", "no", "0", "not filed", "unfiled") else None

def parse_timestamp(val):
    """Convert various date formats to RFC3339 UTC string."""
    if val is None: return None
    try:
        if pd.isna(val): return None
    except (TypeError, ValueError):
        pass
    if isinstance(val, datetime):
        return val.strftime("%Y-%m-%dT%H:%M:%SZ")
    s = str(val).strip()
    for fmt in ("%Y-%m-%d %H:%M:%S", "%Y-%m-%d", "%d-%m-%Y", "%d/%m/%Y"):
        try:
            return datetime.strptime(s, fmt).strftime("%Y-%m-%dT%H:%M:%SZ")
        except ValueError:
            pass
    return None

def parse_self_life(val):
    """Extract integer from strings like '3 MONTH' or '6'."""
    if val is None: return None
    try:
        if pd.isna(val): return None
    except (TypeError, ValueError):
        pass
    s = str(val).strip()
    m = re.search(r"\d+", s)
    return int(m.group()) if m else None

def clean_ean(val):
    if pd.isna(val) or str(val).strip().lower() in ['nan', 'none', '']: return None
    s = str(val).strip()
    try:
        if 'e+' in s.lower():
            return str(int(float(s)))
        return s
    except:
        return s

def gen_uuid():
    return str(uuid.uuid4())

def forward_fill(series):
    """Forward-fill None/NaN values in a column (for merged Excel cells)."""
    result = []
    last = None
    for v in series:
        try:
            is_na = pd.isna(v)
        except (TypeError, ValueError):
            is_na = False
        if v is None or is_na:
            result.append(last)
        else:
            last = v
            result.append(v)
    return result


# ──────────────────────────────────────────────────────────────────────────────
# STEP 1 — CLEAR EXISTING DATA (children-first)
# ──────────────────────────────────────────────────────────────────────────────

CLEAR_MUTATIONS = [
    # children first
    # UUID-keyed tables use "all: true" to delete all; String-keyed use ne filter
    ("RefillLog",               "refillLog_deleteMany(all: true)"),
    ("Sale",                    "sale_deleteMany(all: true)"),
    ("MachineStockAssignment",  "machineStockAssignment_deleteMany(all: true)"),
    ("MachineInventory",        "machineInventory_deleteMany(where: {machineId: {ne: \"\"}})"),
    ("WarehouseInventory",      "warehouseInventory_deleteMany(where: {productId: {ne: \"\"}})"),
    ("PurchasedProduct",        "purchasedProduct_deleteMany(all: true)"),
    ("VendorPurchase",          "vendorPurchase_deleteMany(all: true)"),
    ("PurchaseOrderLine",       "purchaseOrderLine_deleteMany(where: {poId: {ne: \"\"}})"),
    ("PurchaseOrderHeader",     "purchaseOrderHeader_deleteMany(where: {poId: {ne: \"\"}})"),
    ("PurchaseOrder",           "purchaseOrder_deleteMany(where: {poId: {ne: \"\"}})"),
    ("Product",                 "product_deleteMany(where: {productId: {ne: \"\"}})"),
    ("Machine",                 "machine_deleteMany(where: {machineId: {ne: \"\"}})"),
    ("Vendor",                  "vendor_deleteMany(where: {vendorId: {ne: \"\"}})"),
]

def clear_all_data(dry_run):
    print("\n[CLEAR] CLEARING EXISTING DATA (structure preserved)")
    print("-" * 50)
    for table_name, mutation_body in CLEAR_MUTATIONS:
        query = f"mutation ClearAll {{ {mutation_body} }}"
        if dry_run:
            print(f"  [DRY-RUN] Would clear: {table_name}")
        else:
            try:
                result = execute_graphql(query)
                count = 0
                # Extract count from result
                for key in result:
                    if isinstance(result[key], dict) and "count" in result[key]:
                        count = result[key]["count"]
                print(f"  [OK] {table_name:<28} deleted {count} rows")
            except Exception as e:
                print(f"  [WARN] {table_name:<28} clear failed: {e}")
    print()


# ──────────────────────────────────────────────────────────────────────────────
# STEP 2 — INSERT FROM EXCEL
# ──────────────────────────────────────────────────────────────────────────────

def migrate_vendors(xls, dry_run, stats):
    """Vendor_Master → Vendor"""
    if "Vendor_Master" not in xls.sheet_names:
        print("  ⚠️  Sheet 'Vendor_Master' not found, skipping.")
        return

    print("[INSERT] Migrating Vendors (Vendor_Master -> Vendor)...")
    df = pd.read_excel(xls, "Vendor_Master", dtype=str)

    # Accept both 'MOBILE NUMBER (1*)' and 'MOBILE NUMBER' as mobile number column
    mobile_col = None
    for candidate in ["MOBILE NUMBER (1*)", "MOBILE NUMBER"]:
        if candidate in df.columns:
            mobile_col = candidate
            break

    # Deduplicate on vendor ID
    seen = set()
    ok = skip = 0
    for _, row in df.iterrows():
        vid = clean_str(row.get("VENDOR ID"))
        if not vid or vid == "VENDOR ID":
            skip += 1
            continue
        if vid in seen:
            continue  # already processed this vendor
        seen.add(vid)

        query = """mutation M(
            $id: String!, $name: String, $address: String,
            $mob: String, $sec: String, $email: String, $gst: String
        ) {
          vendor_upsert(data: {
            vendorId: $id, vendorName: $name, address: $address,
            mobileNumber: $mob, secondaryNumber: $sec, email: $email, gstNo: $gst
          })
        }"""
        variables = {
            "id": vid,
            "name":    clean_str(row.get("VENDOR")),
            "address": clean_str(row.get("ADDRESS")),
            "mob":     clean_str(row.get(mobile_col)) if mobile_col else None,
            "sec":     clean_str(row.get("SECONDARY NUMBER")),
            "email":   clean_str(row.get("E-Mail ID")),
            "gst":     clean_str(row.get("GST")),
        }
        if not dry_run:
            try:
                execute_graphql(query, variables)
                ok += 1
            except Exception as e:
                print(f"    ⚠️  Vendor {vid}: {e}")
                skip += 1
        else:
            ok += 1

    print(f"    [DONE] Inserted: {ok}  |  Skipped: {skip}")
    stats["Vendor"] = {"ok": ok, "skip": skip}


def migrate_machines(xls, dry_run, stats):
    """Machine_Master → Machine"""
    if "Machine_Master" not in xls.sheet_names:
        print("  ⚠️  Sheet 'Machine_Master' not found, skipping.")
        return

    print("[INSERT] Migrating Machines (Machine_Master -> Machine)...")
    df = pd.read_excel(xls, "Machine_Master", dtype=str).dropna(how="all")
    ok = skip = 0

    query = """mutation M($id: String!, $loc: String, $status: String) {
      machine_upsert(data: {machineId: $id, location: $loc, status: $status})
    }"""

    for _, row in df.iterrows():
        mid = clean_str(row.get("Machine_ID"))
        if not mid:
            skip += 1
            continue
        variables = {
            "id":     mid,
            "loc":    clean_str(row.get("Location")),
            "status": clean_str(row.get("Status")) or "Active",
        }
        if not dry_run:
            try:
                execute_graphql(query, variables)
                ok += 1
            except Exception as e:
                print(f"    ⚠️  Machine {mid}: {e}")
                skip += 1
        else:
            ok += 1

    print(f"    [DONE] Inserted: {ok}  |  Skipped: {skip}")
    stats["Machine"] = {"ok": ok, "skip": skip}


def migrate_products(xls, dry_run, stats):
    """Product_Master → Product"""
    if "Product_Master" not in xls.sheet_names:
        print("  ⚠️  Sheet 'Product_Master' not found, skipping.")
        return

    print("[INSERT] Migrating Products (Product_Master -> Product)...")
    df = pd.read_excel(xls, "Product_Master", dtype=str).dropna(how="all")
    ok = skip = 0

    # Insert a placeholder vendor so products with no VENDOR_ID don't fail FK constraint
    if not dry_run:
        placeholder_q = """mutation M {
          vendor_upsert(data: {vendorId: "UNKNOWN", vendorName: "Unknown Vendor"})
        }"""
        try:
            execute_graphql(placeholder_q)
        except Exception:
            pass  # Ignore if already exists or any error


    query = """mutation M(
        $id: String!, $name: String, $cat: String, $vid: String!,
        $mrp: Float, $qty: String, $units: Int, $gst: Float, $ean: String, $life: Int,
        $unitCost: Float, $landedCost: Float
    ) {
      product_upsert(data: {
        productId: $id, productName: $name, category: $cat, vendorId: $vid,
        mrp: $mrp, quantity: $qty, units: $units, gst: $gst, eanNo: $ean, selfLife: $life,
        unitCost: $unitCost, landedCost: $landedCost
      })
    }"""

    for _, row in df.iterrows():
        pid = clean_str(row.get("PRODUCT_ID"))
        if not pid:
            skip += 1
            continue
        vid = clean_str(row.get("VENDOR_ID")) or "UNKNOWN"
        unit_cost = clean_float(row.get("UNIT_COST", row.get("UNIT COST", row.get("PO"))))
        gst = clean_float(row.get("GST"))
        landed_cost = None
        if unit_cost is not None and gst is not None:
            # Gst might be '5' or '0.05' from excel
            actual_gst = gst / 100 if gst > 1 else gst
            landed_cost = round(unit_cost + (unit_cost * actual_gst), 2)
        variables = {
            "id":    pid,
            "name":  clean_str(row.get("PRODUCT_NAME")),
            "cat":   clean_str(row.get("CATEGORY")),
            "vid":   vid,
            "mrp":   clean_float(row.get("MRP")),
            "qty":   clean_str(row.get("QUANTITY")),
            "units": clean_int(row.get("UNITS")),
            "gst":   gst,
            "ean":   clean_ean(row.get("EAN NO")),
            "life":  parse_self_life(row.get("SELF LIFE")),
            "unitCost": unit_cost,
            "landedCost": landed_cost
        }
        if not dry_run:
            try:
                execute_graphql(query, variables)
                ok += 1
            except Exception as e:
                print(f"    ⚠️  Product {pid} (vendor={vid}): {e}")
                skip += 1
        else:
            ok += 1

    print(f"    [DONE] Inserted: {ok}  |  Skipped: {skip}")
    stats["Product"] = {"ok": ok, "skip": skip}


def migrate_purchase_orders(xls, dry_run, stats):
    """OUR_PO → PurchaseOrderHeader + PurchaseOrderLine (Normalized)"""
    if "OUR_PO" not in xls.sheet_names:
        print("  ⚠️  Sheet 'OUR_PO' not found, skipping.")
        return

    print("[INSERT] Migrating Purchase Orders (OUR_PO -> PurchaseOrderHeader + PurchaseOrderLine)...")
    df = pd.read_excel(xls, "OUR_PO", dtype=str)

    # Forward-fill merged PO_ID, Vendor_ID, Created_Date, Total_Amount, Status
    for col in ["PO_ID", "Vendor_ID", "Created_Date", "Total_Amount", "Status"]:
        if col in df.columns:
            df[col] = forward_fill(df[col].tolist())

    df = df.dropna(subset=["PO_ID"], how="all")
    
    # Group by PO_ID to track headers
    po_groups = df.groupby("PO_ID")
    headers_inserted = set()
    ok = skip = 0

    # Header mutation (once per PO)
    header_query = """mutation M(
        $poId: String!, $vid: String!,
        $date: Timestamp, $total: Float, $status: String
    ) {
      purchaseOrderHeader_upsert(data: {
        poId: $poId, vendorId: $vid,
        createdDate: $date, totalAmount: $total, status: $status
      })
    }"""

    # Line mutation (once per product in PO)
    line_query = """mutation M(
        $poId: String!, $pid: String!,
        $cases: Int, $upc: Int, $poPrice: Float, $lineTotal: Float
    ) {
      purchaseOrderLine_upsert(data: {
        poId: $poId, productId: $pid,
        noOfCases: $cases, unitsPerCase: $upc,
        poPrice: $poPrice, lineTotal: $lineTotal
      })
    }"""

    for po_id, group in po_groups:
        po_id = clean_str(po_id)
        if not po_id:
            skip += len(group)
            continue

        # Get header info from first row
        first_row = group.iloc[0]
        vid = clean_str(first_row.get("Vendor_ID"))
        if not vid:
            skip += len(group)
            continue

        # Insert header only once
        if po_id not in headers_inserted:
            header_vars = {
                "poId": po_id,
                "vid": vid,
                "date": parse_timestamp(first_row.get("Created_Date")),
                "total": clean_float(first_row.get("Total_Amount")),
                "status": clean_str(first_row.get("Status")) or "Pending",
            }
            if not dry_run:
                try:
                    execute_graphql(header_query, header_vars)
                    headers_inserted.add(po_id)
                except Exception as e:
                    print(f"    ⚠️  PO {po_id} header: {e}")
                    skip += len(group)
                    continue
            else:
                headers_inserted.add(po_id)

        # Insert line items for each product
        for _, row in group.iterrows():
            pid = clean_str(row.get("Product_ID"))
            if not pid:
                skip += 1
                continue

            line_vars = {
                "poId": po_id,
                "pid": pid,
                "cases": clean_int(row.get("No_of_Cases")),
                "upc": clean_int(row.get("Units_Per_Case")),
                "poPrice": clean_float(row.get("PO_Price")),
                "lineTotal": clean_float(row.get("Line_Total")),
            }
            if not dry_run:
                try:
                    execute_graphql(line_query, line_vars)
                    ok += 1
                except Exception as e:
                    print(f"    ⚠️  PO {po_id}/{pid}: {e}")
                    skip += 1
            else:
                ok += 1

    print(f"    [DONE] Inserted: {ok}  |  Skipped: {skip}")
    stats["PurchaseOrder"] = {"ok": ok, "skip": skip}


def migrate_vendor_purchases(xls, dry_run, stats):
    """Vendor_Purchase → VendorPurchase"""
    if "Vendor_Purchase" not in xls.sheet_names:
        print("  ⚠️  Sheet 'Vendor_Purchase' not found, skipping.")
        return

    print("[INSERT] Migrating Vendor Purchases (Vendor_Purchase -> VendorPurchase)...")
    df = pd.read_excel(xls, "Vendor_Purchase", dtype=str)

    # Forward-fill merged PO ID, VENDOR ID, PRODUCT ID
    for col in ["PO ID", "VENDOR ID", "PRODUCT ID", "BATCH"]:
        if col in df.columns:
            df[col] = forward_fill(df[col].tolist())

    df = df.dropna(how="all")
    ok = skip = 0

    query = """mutation M(
        $id: UUID!, $poId: String!, $vid: String!, $pid: String!,
        $batch: Int, $upc: Int, $cases: Int, $total: Int,
        $mrp: Float, $poPrice: Float, $payMode: String, $payStat: String, $gst: Boolean
    ) {
      vendorPurchase_upsert(data: {
        purchaseId: $id, poId: $poId, vendorId: $vid, productId: $pid,
        batch: $batch, unitsPerCase: $upc, caseCount: $cases, totalUnits: $total,
        mrp: $mrp, poPrice: $poPrice, paymentMode: $payMode,
        paymentStatus: $payStat, gstFiled: $gst
      })
    }"""

    for _, row in df.iterrows():
        po_id = clean_str(row.get("PO ID"))
        vid   = clean_str(row.get("VENDOR ID"))
        pid   = clean_str(row.get("PRODUCT ID"))
        if not po_id or not vid or not pid:
            # NOTE: Many rows in Vendor_Purchase are missing PRODUCT ID — skipped (FK constraint)
            skip += 1
            continue
        variables = {
            "id":      gen_uuid(),
            "poId":    po_id,
            "vid":     vid,
            "pid":     pid,
            "batch":   clean_int(row.get("BATCH")),
            "upc":     clean_int(row.get("UNIT/CASE")),
            "cases":   clean_int(row.get("CASE COUNT")),
            "total":   clean_int(row.get("QUANTITY")),
            "mrp":     clean_float(row.get("MRP")),
            "poPrice": clean_float(row.get("PO PRICE")),
            "payMode": clean_str(row.get("PAYMENT MODE")),
            "payStat": clean_str(row.get("PAYMENT STATUS")),
            "gst":     clean_bool(row.get("GST FILED")),
            # NOTE: DATE / PURCHASE DATE / PRODUCT NAME have no matching schema field — ignored
        }
        if not dry_run:
            try:
                execute_graphql(query, variables)
                ok += 1
            except Exception as e:
                print(f"    ⚠️  VendorPurchase {po_id}/{pid}: {e}")
                skip += 1
        else:
            ok += 1

    print(f"    [DONE] Inserted: {ok}  |  Skipped: {skip}")
    stats["VendorPurchase"] = {"ok": ok, "skip": skip}


def migrate_purchased_products(xls, dry_run, stats):
    """Purchased_Products → PurchasedProduct"""
    if "Purchased_Products" not in xls.sheet_names:
        print("  ⚠️  Sheet 'Purchased_Products' not found, skipping.")
        return

    print("[INSERT] Migrating Purchased Products (Purchased_Products -> PurchasedProduct)...")
    df = pd.read_excel(xls, "Purchased_Products", dtype=str)

    # Forward-fill PO_ID (merged cells)
    if "PO_ID" in df.columns:
        df["PO_ID"] = forward_fill(df["PO_ID"].tolist())

    df = df.dropna(how="all")
    ok = skip = 0

    query = """mutation M(
        $id: UUID!, $poId: String, $pid: String,
        $upc: Int, $caseLabel: String, $uic: Int,
        $mfd: Timestamp, $expd: Timestamp,
        $avail: Int, $batch: Int, $recvd: Timestamp, $notes: String
    ) {
      purchasedProduct_upsert(data: {
        id: $id, poId: $poId, productId: $pid,
        unitsPerCase: $upc, caseLabel: $caseLabel, unitsInCase: $uic,
        mfd: $mfd, expd: $expd, availableUnits: $avail,
        batch: $batch, receivedDate: $recvd, notes: $notes
      })
    }"""

    for _, row in df.iterrows():
        pid = clean_str(row.get("Product_ID"))
        if not pid:
            skip += 1
            continue
        variables = {
            "id":        gen_uuid(),
            "poId":      clean_str(row.get("PO_ID")),
            "pid":       pid,
            "upc":       clean_int(row.get("Units_Per_Case")),
            "caseLabel": clean_str(row.get("Case")),
            "uic":       clean_int(row.get("Units_in_Case")),
            "mfd":       parse_timestamp(row.get("MFD")),
            "expd":      parse_timestamp(row.get("EXPD")),
            "avail":     clean_int(row.get("Available_Units")),
            "batch":     clean_int(row.get("Batch")),
            "recvd":     parse_timestamp(row.get("Received_Date")),
            "notes":     clean_str(row.get("Notes")),
            # NOTE: Product_Name and Unnamed: 4 have no schema field — ignored
        }
        if not dry_run:
            try:
                execute_graphql(query, variables)
                ok += 1
            except Exception as e:
                print(f"    ⚠️  PurchasedProduct {pid}: {e}")
                skip += 1
        else:
            ok += 1

    print(f"    [DONE] Inserted: {ok}  |  Skipped: {skip}")
    stats["PurchasedProduct"] = {"ok": ok, "skip": skip}


def migrate_warehouse_inventory(xls, dry_run, stats):
    """Warehouse_Stock → WarehouseInventory"""
    if "Warehouse_Stock" not in xls.sheet_names:
        print("  ⚠️  Sheet 'Warehouse_Stock' not found, skipping.")
        return

    print("[INSERT] Migrating Warehouse Inventory (Warehouse_Stock -> WarehouseInventory)...")
    df = pd.read_excel(xls, "Warehouse_Stock", dtype=str).dropna(how="all")
    ok = skip = 0

    query = """mutation M(
        $pid: String!, $avail: Int, $upc: Int, $lastDate: Timestamp, $notes: String
    ) {
      warehouseInventory_upsert(data: {
        productId: $pid, availableUnits: $avail, unitsPerCase: $upc,
        lastReceivedDate: $lastDate, notes: $notes
      })
    }"""

    for _, row in df.iterrows():
        pid = clean_str(row.get("Product_ID"))
        if not pid:
            skip += 1
            continue
        variables = {
            "pid":      pid,
            "avail":    clean_int(row.get("Available_Units")),
            "upc":      clean_int(row.get("Units_Per_Case")),
            "lastDate": parse_timestamp(row.get("Last_Received_Date")),
            "notes":    clean_str(row.get("Notes")),
            # NOTE: Product_Name column has no schema field — ignored
        }
        if not dry_run:
            try:
                execute_graphql(query, variables)
                ok += 1
            except Exception as e:
                print(f"    ⚠️  WarehouseInventory {pid}: {e}")
                skip += 1
        else:
            ok += 1

    print(f"    [DONE] Inserted: {ok}  |  Skipped: {skip}")
    stats["WarehouseInventory"] = {"ok": ok, "skip": skip}


def migrate_machine_inventory(xls, dry_run, stats):
    """Current_Stock → MachineInventory"""
    if "Current_Stock" not in xls.sheet_names:
        print("  ⚠️  Sheet 'Current_Stock' not found, skipping.")
        return

    print("[INSERT] Migrating Machine Inventory (Current_Stock -> MachineInventory)...")
    df = pd.read_excel(xls, "Current_Stock", dtype=str).dropna(how="all")
    ok = skip = 0

    query = """mutation M($mid: String!, $pid: String!, $stock: Int) {
      machineInventory_upsert(data: {
        machineId: $mid, productId: $pid, currentStock: $stock
      })
    }"""

    for _, row in df.iterrows():
        mid = clean_str(row.get("Machine_ID"))
        pid = clean_str(row.get("Product_ID"))
        if not mid or not pid:
            skip += 1
            continue
        variables = {
            "mid":   mid,
            "pid":   pid,
            "stock": clean_int(row.get("Current_Stock")),
        }
        if not dry_run:
            try:
                execute_graphql(query, variables)
                ok += 1
            except Exception as e:
                print(f"    ⚠️  MachineInventory {mid}/{pid}: {e}")
                skip += 1
        else:
            ok += 1

    print(f"    [DONE] Inserted: {ok}  |  Skipped: {skip}")
    stats["MachineInventory"] = {"ok": ok, "skip": skip}


def migrate_stock_assignments(xls, dry_run, stats):
    """Stocks → MachineStockAssignment"""
    if "Stocks" not in xls.sheet_names:
        print("  ⚠️  Sheet 'Stocks' not found, skipping.")
        return

    print("[INSERT] Migrating Stock Assignments (Stocks -> MachineStockAssignment)...")
    df = pd.read_excel(xls, "Stocks", dtype=str)

    # Forward-fill merged group fields
    for col in ["Batch", "Date", "Machine", "Stock", "cover", "cover status"]:
        if col in df.columns:
            df[col] = forward_fill(df[col].tolist())

    df = df.dropna(how="all")
    ok = skip = 0

    query = """mutation M(
        $id: UUID!, $batch: Int, $date: Timestamp,
        $mid: String!, $stockLabel: String!, $cover: String!, $coverStatus: String,
        $pid: String!, $units: Int, $status: String
    ) {
      machineStockAssignment_upsert(data: {
        id: $id, batch: $batch, assignedDate: $date,
        machineId: $mid, stockLabel: $stockLabel, coverLabel: $cover,
        coverStatus: $coverStatus, productId: $pid, units: $units, status: $status
      })
    }"""

    for _, row in df.iterrows():
        mid        = clean_str(row.get("Machine"))
        pid        = clean_str(row.get("product id"))
        stock_lbl  = clean_str(row.get("Stock"))
        cover_lbl  = clean_str(row.get("cover"))
        if not mid or not pid or not stock_lbl or not cover_lbl:
            skip += 1
            continue
        variables = {
            "id":          gen_uuid(),
            "batch":       clean_int(row.get("Batch")),
            "date":        parse_timestamp(row.get("Date")),
            "mid":         mid,
            "stockLabel":  stock_lbl,
            "cover":       cover_lbl,
            "coverStatus": clean_str(row.get("cover status")),
            "pid":         pid,
            "units":       clean_int(row.get("units")),
            "status":      clean_str(row.get("Status")),
        }
        if not dry_run:
            try:
                execute_graphql(query, variables)
                ok += 1
            except Exception as e:
                print(f"    ⚠️  StockAssignment {mid}/{pid}: {e}")
                skip += 1
        else:
            ok += 1

    print(f"    [DONE] Inserted: {ok}  |  Skipped: {skip}")
    stats["MachineStockAssignment"] = {"ok": ok, "skip": skip}


def migrate_refill_log(xls, dry_run, stats):
    """Machine_Refill_Log → RefillLog"""
    if "Machine_Refill_Log" not in xls.sheet_names:
        print("  ⚠️  Sheet 'Machine_Refill_Log' not found, skipping.")
        return

    print("[INSERT] Migrating Refill Log (Machine_Refill_Log -> RefillLog)...")
    df = pd.read_excel(xls, "Machine_Refill_Log", dtype=str).dropna(how="all")
    ok = skip = 0

    query = """mutation M(
        $id: UUID!, $date: Timestamp, $refillerId: String,
        $mid: String!, $pid: String!, $cover: Int, $qty: Int
    ) {
      refillLog_upsert(data: {
        refillId: $id, date: $date, refillerId: $refillerId,
        machineId: $mid, productId: $pid, coverCount: $cover, quantity: $qty
      })
    }"""

    for _, row in df.iterrows():
        mid = clean_str(row.get("Machine_ID"))
        pid = clean_str(row.get("Product_ID"))
        if not mid or not pid:
            skip += 1
            continue
        variables = {
            "id":         gen_uuid(),
            "date":       parse_timestamp(row.get("Date")),
            "refillerId": clean_str(row.get("Refiller_ID")),
            "mid":        mid,
            "pid":        pid,
            "cover":      clean_int(row.get("Cover count")),
            "qty":        clean_int(row.get("Qty")),
        }
        if not dry_run:
            try:
                execute_graphql(query, variables)
                ok += 1
            except Exception as e:
                print(f"    ⚠️  RefillLog {mid}/{pid}: {e}")
                skip += 1
        else:
            ok += 1

    print(f"    [DONE] Inserted: {ok}  |  Skipped: {skip}")
    stats["RefillLog"] = {"ok": ok, "skip": skip}


def migrate_sales(xls, dry_run, stats):
    """Sales_Log → Sale"""
    if "Sales_Log" not in xls.sheet_names:
        print("  ⚠️  Sheet 'Sales_Log' not found, skipping.")
        return

    print("[INSERT] Migrating Sales (Sales_Log -> Sale)...")
    # NOTE: Sales_Log has no 'status' column → defaulting to SUCCESS
    # NOTE: Sales_Log has no 'slot' column → inserted as NULL
    df = pd.read_excel(xls, "Sales_Log", dtype=str).dropna(how="all")
    ok = skip = 0

    query = """mutation M(
        $id: UUID!, $mid: String!, $pid: String!, $slot: String,
        $sold: Int, $mrp: Float, $status: SaleStatus!, $ts: Timestamp
    ) {
      sale_upsert(data: {
        saleId: $id, machineId: $mid, productId: $pid, slot: $slot,
        quantitySold: $sold, mrp: $mrp, status: $status, transactionAt: $ts
      })
    }"""

    for _, row in df.iterrows():
        mid = clean_str(row.get("Machine_ID"))
        pid = clean_str(row.get("Product_ID"))
        if not mid or not pid:
            skip += 1
            continue
        variables = {
            "id":     gen_uuid(),
            "mid":    mid,
            "pid":    pid,
            "slot":   None,          # No slot column in Sales_Log
            "sold":   clean_int(row.get("Qty Sold")),
            "mrp":    clean_float(row.get("Selling_Price")),
            "status": "SUCCESS",     # Default — no status column in Sales_Log
            "ts":     parse_timestamp(row.get("Date")),
            # NOTE: 'Qty Purchased' has no schema field — ignored
        }
        if not dry_run:
            try:
                execute_graphql(query, variables)
                ok += 1
            except Exception as e:
                print(f"    ⚠️  Sale {mid}/{pid}: {e}")
                skip += 1
        else:
            ok += 1

    print(f"    [DONE] Inserted: {ok}  |  Skipped: {skip}")
    stats["Sale"] = {"ok": ok, "skip": skip}


# ──────────────────────────────────────────────────────────────────────────────
# MAIN
# ──────────────────────────────────────────────────────────────────────────────

def migrate(inventory_path, ops_path, dry_run=False):
    """
    inventory_path : Excel with master sheets  (Vendor_Master, Machine_Master, Product_Master)
                     → Inventory_sheet.xlsx
    ops_path       : Excel with operational sheets (Sales, Stock, POs, Refills, etc.)
                     → ventory_sheet.xlsx
    """
    if not os.path.exists(inventory_path):
        print(f"File not found: {inventory_path}")
        sys.exit(1)

    mode_label = "DRY-RUN" if dry_run else "LIVE"
    print(f"\n{'='*60}")
    print(f"  VendBees Data Connect Migration [{mode_label}]")
    print(f"  Masters : {inventory_path}")
    print(f"  Target  : Firebase Data Connect (vendbees-60d7b)")
    print(f"{'='*60}\n")

    print("Reading Excel file...")
    xls_masters = pd.ExcelFile(inventory_path, engine="openpyxl")
    print(f"   Masters  sheets: {xls_masters.sheet_names}\n")

    # -- STEP 1: Clear existing data -----------------------------------------
    clear_all_data(dry_run)

    # -- STEP 2: Insert in dependency order ----------------------------------
    print("[INSERT] INSERTING DATA FROM EXCEL")
    print("-" * 50)
    stats = {}

    # Masters from Inventory_sheet.xlsx
    migrate_vendors(xls_masters, dry_run, stats)
    migrate_machines(xls_masters, dry_run, stats)
    migrate_products(xls_masters, dry_run, stats)

    # -- SUMMARY --------------------------------------------------------------
    total_ok   = sum(v["ok"]   for v in stats.values())
    total_skip = sum(v["skip"] for v in stats.values())

    print(f"\n{'='*60}")
    print(f"  MIGRATION {'[DRY-RUN] ' if dry_run else ''}COMPLETE")
    print(f"{'='*60}")
    print(f"  {'Table':<28}  {'Inserted':>8}  {'Skipped':>8}")
    print(f"  {'-'*28}  {'-'*8}  {'-'*8}")
    for tbl, v in stats.items():
        print(f"  {tbl:<28}  {v['ok']:>8}  {v['skip']:>8}")
    print(f"  {'-'*28}  {'-'*8}  {'-'*8}")
    print(f"  {'TOTAL':<28}  {total_ok:>8}  {total_skip:>8}")
    print(f"{'='*60}\n")

    if dry_run:
        print("INFO: DRY-RUN mode - no data was written to Data Connect.")
    else:
        print("[OK] All done! Data has been migrated to Firebase Data Connect.")

        print("""
Known notes:
    - Product.PO column : no schema field, ignored
    - Vendor_Master     : merged cells forward-filled VENDOR ID/VENDOR/ADDRESS etc.
    - Extra Excel cols  : Product_Name, DATE etc. have no schema field, ignored
""")


if __name__ == "__main__":
    # Default path — relative to this script (backend/firebase/)
    base = os.path.join(os.path.dirname(__file__), "..")
    default_inventory = os.path.abspath(os.path.join(base, "Inventory_sheet.xlsx"))

    dry_run = "--dry-run" in sys.argv
    # Filter out flags from positional args
    pos_args = [a for a in sys.argv[1:] if not a.startswith("--")]

    inventory_path = pos_args[0] if len(pos_args) > 0 else default_inventory

    migrate(
        os.path.abspath(inventory_path),
        None,
        dry_run,
    )

