from flask import Blueprint, jsonify
from dataconnect_db import execute_graphql
from batch_assignment_queries import get_batch_assignments_flat
import sys

dashboard_bp = Blueprint('dashboard', __name__)

# Firebase Data Connect requires individual queries for each root field
PRODUCTS_QUERY = """query GetProducts { products(limit: 1000) { productId productName category vendorId mrp quantity units gst unitCost landedCost eanNo selfLife vendor { vendorId vendorName } } }"""

MACHINES_QUERY = """query GetMachines { machines(limit: 100) { machineId location status } }"""

MACHINE_INVENTORIES_QUERY = """query GetMachineInventories { machineInventories(limit: 1000) { machineId productId currentStock } }"""

SALES_QUERY = """query GetSales { sales(limit: 1000) { saleId machineId productId quantitySold mrp status transactionAt } }"""

REFILL_LOGS_QUERY = """query GetRefillLogs { refillLogs(limit: 1000) { refillId date refillerId machineId productId coverCount quantity } }"""

VENDORS_QUERY = """query GetVendors { vendors(limit: 1000) { vendorId vendorName mobileNumber email } }"""

WAREHOUSE_INVENTORIES_QUERY = """query GetWarehouseInventories { warehouseStocks(limit: 1000) { stockId warehouseId poId productId batch unitsPerCase caseLabel availableUnits mfd expd receivedDate notes warehouse { warehouseId name location } product { productName } } }"""

WAREHOUSES_QUERY = """query GetWarehouses { warehouses(limit: 1000) { warehouseId name location address notes createdAt updatedAt } }"""

WAREHOUSE_STOCKS_QUERY = """query GetWarehouseStocks { warehouseStocks(limit: 10000) { stockId warehouseId poId productId batch unitsPerCase caseLabel availableUnits mfd expd receivedDate notes warehouse { warehouseId name location } product { productName } } }"""

# Query to fetch batch-level status from BatchAssignment table
BATCH_ASSIGNMENTS_QUERY = """query GetBatchAssignments { batchAssignments(limit: 1000) { batch assignedDate status } }"""

VENDOR_PURCHASE_ORDERS_QUERY = """query GetVendorPurchaseOrders { vendorPurchaseOrders(limit: 1000) { purchaseOrderId poId vendorId receivedDate paymentMode paymentStatus gstFiled } }"""

VENDOR_PURCHASE_ITEMS_QUERY = """query GetVendorPurchaseItems { vendorPurchaseItems(limit: 1000) { itemId purchaseOrderId productId batch unitsPerCase caseCount totalUnits mrp poPrice product { productName } } }"""

PURCHASE_ORDER_HEADERS_QUERY = """query GetPurchaseOrderHeaders { purchaseOrderHeaders(limit: 1000) { poId vendorId createdDate totalAmount status vendor { vendorName } } }"""

PURCHASE_ORDER_LINES_QUERY = """query GetPurchaseOrderLines { purchaseOrderLines(limit: 1000) { lineId poId productId noOfCases unitsPerCase poPrice lineTotal purchaseOrderHeader { poId vendorId createdDate totalAmount status } product { productName } } }"""

def get_default_self_life(product_id, product_name, category):
    """Return intelligent default shelf life in days based on product."""
    product_name = (product_name or "").upper()
    product_id = (product_id or "").upper()
    category = (category or "").upper()
    
    # Product-specific mappings
    product_mappings = {
        'BINGO': 180,
        'LAYS': 180,
        'BRITANNIA': 365,
        'PARLE': 365,
        'DARK': 180,
        'ELITE': 365,
        'NABA': 180,
        'RAAJ': 180,
        'BAUL': 180,
        'GAIA': 180,
        'SUN': 180,
        'LAVAZZA': 90,
        'DM': 90,
        'KITK': 365,
        'UNI': 365,
        'FAB': 180,
        'MOM': 365,
        '7UP': 180,
    }
    
    # Check product-specific mappings
    for pattern, days in product_mappings.items():
        if pattern in product_id or pattern in product_name:
            return days
    
    # Check category
    if 'BISCUIT' in category or 'COOKIES' in category:
        return 365
    elif 'CHOCOLATE' in category:
        return 365
    elif 'CHIPS' in category or 'SNACK' in category:
        return 180
    elif 'BEVERAGE' in category or 'DRINK' in category:
        return 180
    elif 'COFFEE' in category or 'TEA' in category:
        return 90
    
    # Default fallback
    return 90

def convert_to_days(value):
    """Convert shelf life from months to days if needed. 
    If value < 50, treat as months and multiply by 30."""
    if value is None or value == 0:
        return 0
    val = int(value) if isinstance(value, (int, float)) else 0
    if val == 0:
        return 0
    # If value is less than 50, assume it's in months, convert to days
    if val < 50:
        return val * 30
    # Otherwise assume it's already in days
    return val

@dashboard_bp.route('/api/dashboard', methods=['GET'])
def dashboard():
    print("DASHBOARD FUNCTION CALLED", file=sys.stderr)
    try:
        # Execute individual queries since Firebase Data Connect doesn't support multi-root queries
        data = {}
        
        queries = [
            ("products", PRODUCTS_QUERY),
            ("machines", MACHINES_QUERY),
            ("machineInventories", MACHINE_INVENTORIES_QUERY),
            ("sales", SALES_QUERY),
            ("refillLogs", REFILL_LOGS_QUERY),
            ("vendors", VENDORS_QUERY),
            ("warehouses", WAREHOUSES_QUERY),
            ("warehouseStocks", WAREHOUSE_STOCKS_QUERY),
            ("vendorPurchaseOrders", VENDOR_PURCHASE_ORDERS_QUERY),
            ("vendorPurchaseItems", VENDOR_PURCHASE_ITEMS_QUERY),
            ("purchaseOrderHeaders", PURCHASE_ORDER_HEADERS_QUERY),
            ("purchaseOrderLines", PURCHASE_ORDER_LINES_QUERY),
            ("batchAssignments", BATCH_ASSIGNMENTS_QUERY),
        ]
        
        for query_name, query_string in queries:
            try:
                result = execute_graphql(query_string)
                if result and query_name in result:
                    data[query_name] = result[query_name]
                else:
                    data[query_name] = []
            except Exception as query_error:
                print(f"[DASHBOARD] Error executing {query_name}: {str(query_error)}", file=sys.stderr)
                data[query_name] = []
        
        # UPDATED: Get machineStockAssignments from normalized tables
        # This queries BatchAssignment -> StockCoverAssignment -> StockCoverProductAssignment
        # and returns flattened results for backward compatibility
        try:
            msa_records = get_batch_assignments_flat()
            data['machineStockAssignments'] = msa_records
        except Exception as msa_error:
            print(f"[DASHBOARD] Error getting normalized batch assignments: {str(msa_error)}", file=sys.stderr)
            data['machineStockAssignments'] = []
        
        # We need to reshape the GraphQL response to match the exact JSON keys 
        # the frontend `DataContext.jsx` expects to avoid breaking the UI.
        
        # 1. Map Products
        products_out = []
        for p in data.get("products", []):
            # Get selfLife from database, convert from months to days if needed
            raw_selflife = p.get("selfLife") or 0
            self_life = convert_to_days(raw_selflife)
            
            # If still 0, use intelligent default
            if self_life == 0:
                self_life = get_default_self_life(
                    p.get("productId"),
                    p.get("productName"),
                    p.get("category")
                )
            
            products_out.append({
                "PRODUCT_ID": p.get("productId"),
                "PRODUCT_NAME": p.get("productName"),
                "CATEGORY": p.get("category"),
                "VENDOR ID": p.get("vendorId"),
                "MRP": p.get("mrp"),
                "QUANTITY": p.get("units") or p.get("quantity"),  # Handle both
                "GST": p.get("gst", 0),
                "PO": p.get("unitCost", 0), # Mapped to unit_cost in frontend
                "UNITS": p.get("units", 1),
                "selfLife": self_life  # Shelf life in days
            })
            
        # 2. Map Machines
        machines_out = []
        for m in data.get("machines", []):
            machines_out.append({
                "Machine_ID": m.get("machineId"),
                "Location": m.get("location"),
                "Status": m.get("status")
            })
            
        # 3. Map Stock (MachineInventory)
        stock_out = []
        for inv in data.get("machineInventories", []):
            stock_out.append({
                "Machine_ID": inv.get("machineId"),
                "Product_ID": inv.get("productId"),
                "Current_Stock": inv.get("currentStock", 0),
                # If you have stockId or batch attached to machine inventory later
            })
            
        # 4. Map Sales
        sales_out = []
        for s in data.get("sales", []):
            sales_out.append({
                "Date": s.get("transactionAt"),
                "Machine_ID": s.get("machineId"),
                "Product_ID": s.get("productId"),
                "Qty Sold": s.get("quantitySold", 0),
                "Selling_Price": s.get("mrp", 0)
            })
            
        # 5. Map Vendor Purchases (Deliveries) from normalized tables
        purchases_out = []
        # Build lookup from VendorPurchaseItem by purchaseOrderId
        item_map = {}
        for item in data.get("vendorPurchaseItems", []):
            po_id = item.get("purchaseOrderId")
            if po_id not in item_map:
                item_map[po_id] = []
            item_map[po_id].append(item)

        for vpo in data.get("vendorPurchaseOrders", []):
            order_id = vpo.get("purchaseOrderId")
            items_for_order = item_map.get(order_id, [])
            for item in items_for_order:
                purchases_out.append({
                    "PO_ID": vpo.get("poId"),
                    "Vendor_ID": vpo.get("vendorId"),
                    "Product_ID": item.get("productId"),
                    "Batch": item.get("batch"),
                    "Units_Per_Case": item.get("unitsPerCase"),
                    "Cases_Received": item.get("caseCount"),
                    "Quantity": item.get("totalUnits"),
                    "MRP": item.get("mrp"),
                    "PO_Price": item.get("poPrice"),
                    "Payment_Mode": vpo.get("paymentMode"),
                    "Payment_Status": vpo.get("paymentStatus"),
                    "GST_Filed": "Yes" if vpo.get("gstFiled") else "No",
                    "Product_Name": (item.get("product") or {}).get("productName", ""),
                    "Date": vpo.get("receivedDate")
                })
        
            
        # 6. Map Refills
        refills_out = []
        for r in data.get("refillLogs", []):
            refills_out.append({
                "Date": r.get("date"),
                "Refiller_ID": r.get("refillerId"),
                "Machine_ID": r.get("machineId"),
                "Product_ID": r.get("productId"),
                "Qty": r.get("quantity", 0)
            })
            
        # 7. Map Vendors
        vendors_out = []
        for v in data.get("vendors", []):
            vendors_out.append({
                "VENDOR_ID": v.get("vendorId"),
                "VENDOR": v.get("vendorName")
            })

        # 8. Map Warehouses and Warehouse Stocks
        warehouses_out = []
        for w in data.get("warehouses", []):
            warehouses_out.append({
                "Warehouse_ID": w.get("warehouseId"),
                "Warehouse_Name": w.get("name", ""),
                "Location": w.get("location", ""),
                "Address": w.get("address", ""),
                "Notes": w.get("notes", ""),
                "Created_At": w.get("createdAt", ""),
                "Updated_At": w.get("updatedAt", "")
            })

        warehouse_stocks_out = []
        for w in data.get("warehouseStocks", []):
            warehouse_stocks_out.append({
                "Stock_ID": w.get("stockId"),
                "Warehouse_ID": w.get("warehouseId"),
                "Warehouse_Name": (w.get("warehouse") or {}).get("name", ""),
                "Location": (w.get("warehouse") or {}).get("location", ""),
                "PO_ID": w.get("poId", ""),
                "Product_ID": w.get("productId"),
                "Product_Name": (w.get("product") or {}).get("productName", "Unknown Product"),
                "Batch": w.get("batch"),
                "Units_Per_Case": w.get("unitsPerCase", 1),
                "Case_Label": w.get("caseLabel", ""),
                "Available_Units": w.get("availableUnits", 0),
                "Received_Date": w.get("receivedDate", ""),
                "MFD": w.get("mfd", ""),
                "EXPD": w.get("expd", ""),
                "Notes": w.get("notes", "")
            })

        warehouse_entries_out = []
        for w in data.get("warehouseStocks", []):
            warehouse_entries_out.append({
                "id": w.get("stockId"),
                "productId": w.get("productId"),
                "caseLabel": w.get("caseLabel", ""),
                "purchasedProductCaseId": "",
                "availableUnits": w.get("availableUnits", 0),
                "addedDate": w.get("receivedDate", ""),
                "notes": w.get("notes", ""),
                "purchasedProductCase": {
                    "expd": w.get("expd", "")
                }
            })

        warehouse_out = []
        warehouse_aggregation = {}
        for w in data.get("warehouseStocks", []):
            product_id = w.get("productId")
            if not product_id:
                continue
            if product_id not in warehouse_aggregation:
                warehouse_aggregation[product_id] = {
                    "Product_ID": product_id,
                    "Product_Name": (w.get("product") or {}).get("productName", "Unknown Product"),
                    "Available_Units": 0,
                    "Units_Per_Case": w.get("unitsPerCase", 1) or 1,
                    "Last_Received_Date": w.get("receivedDate", ""),
                    "Notes": w.get("notes", "")
                }
            warehouse_aggregation[product_id]["Available_Units"] += int(w.get("availableUnits", 0) or 0)
            if w.get("receivedDate"):
                warehouse_aggregation[product_id]["Last_Received_Date"] = max(
                    warehouse_aggregation[product_id]["Last_Received_Date"],
                    w.get("receivedDate")
                )
            if not warehouse_aggregation[product_id]["Notes"]:
                warehouse_aggregation[product_id]["Notes"] = w.get("notes", "")

        for agg in warehouse_aggregation.values():
            warehouse_out.append(agg)
            
        # 8b. Map Stocks / Assignments (from normalized BatchAssignment structure)
        # Queried from: BatchAssignment -> StockCoverAssignment -> StockCoverProductAssignment
        # The frontend expects "stocks" and "stock_assignments"
        
        # Build a map of batch statuses from BatchAssignment table
        batch_status_map = {}
        for batch_assign in data.get("batchAssignments", []):
            batch_num = batch_assign.get("batch")
            status = batch_assign.get("status", "Active")
            batch_status_map[batch_num] = {
                "status": status,
                "assignedDate": batch_assign.get("assignedDate")
            }
        
        stocks_out = []
        stock_assignments_out = []
        for msa in data.get("machineStockAssignments", []):
            product_dict = msa.get("product") or {}
            batch_num = msa.get("batch")
            
            # Get batch-level status from BatchAssignment table
            batch_info = batch_status_map.get(batch_num, {})
            batch_status = batch_info.get("status", "Active")
            batch_date = batch_info.get("assignedDate") or msa.get("assignedDate")
            
            stocks_out.append({
                "id": msa.get("id"),  # CRITICAL: Include id for update-units endpoint
                "Batch": batch_num,
                "Date": batch_date,
                "Machine": msa.get("machineId"),
                "Stock": msa.get("stockLabel"),
                "cover": msa.get("coverLabel"),
                "cover_status": msa.get("coverStatus"),
                "product_id": msa.get("productId"),
                "product_name": product_dict.get("productName", ""),
                "units": msa.get("units", 0),
                "Status": batch_status,  # Use batch-level status from BatchAssignment
                "caseLabel": msa.get("caseLabel"),
                "Stock_ID": msa.get("id"),
                "stockLabel": msa.get("stockLabel"),
                "coverLabel": msa.get("coverLabel"),
                "machineId": msa.get("machineId"),
                "status": batch_status  # Use batch-level status
            })
            stock_assignments_out.append({
                "Stock_ID": msa.get("id"),
                "Product_ID": msa.get("productId"),
                "Product_Name": product_dict.get("productName", ""),
                "Units": msa.get("units", 0),
                "Machine_ID": msa.get("machineId"),
                "Assignment_Status": batch_status,
                "stockLabel": msa.get("stockLabel"),
                "coverLabel": msa.get("coverLabel"),
                "coverStatus": msa.get("coverStatus"),
                "caseLabel": msa.get("caseLabel"),
                "status": batch_status,
                "batch": batch_num,
                "assignedDate": batch_date
            })
            
        # 9. Map OUR_POs from PurchaseOrderLines with embedded header info
        our_pos_out = []
        
        for line in data.get("purchaseOrderLines", []):
            po_header = line.get("purchaseOrderHeader", {})
            vendor = po_header.get("vendor", {}) if isinstance(po_header, dict) else {}
            product = line.get("product", {})
            
            our_pos_out.append({
                "PO_ID": po_header.get("poId"),
                "Vendor_ID": po_header.get("vendorId", ""),
                "Vendor_Name": vendor.get("vendorName", ""),
                "Product_ID": line.get("productId"),
                "No_of_Cases": line.get("noOfCases", 0),
                "Units_Per_Case": line.get("unitsPerCase", 1),
                "PO_Price": line.get("poPrice", 0),
                "Line_Total": line.get("lineTotal", 0),
                "Total_Amount": po_header.get("totalAmount", 0),
                "Created_Date": po_header.get("createdDate", ""),
                "Product_Name": product.get("productName", ""),
                "Status": po_header.get("status", "Pending")
            })

        # Calculate basic metrics to match old dashboard
        total_value = sum((float(op.get("PO_Price", 0)) * float(op.get("No_of_Cases", 0)) * float(op.get("Units_Per_Case", 1))) for op in our_pos_out)
        total_units = sum(int(inv.get("Current_Stock", 0)) for inv in stock_out)
        active_machines = sum(1 for m in machines_out if str(m.get("Status")).lower() == 'active')
        
        # Calculate active and inactive batches
        active_batches = sum(1 for batch_info in batch_status_map.values() if batch_info.get("status") == "Active")
        inactive_batches = sum(1 for batch_info in batch_status_map.values() if batch_info.get("status") == "Inactive")
        
        metrics = {
            "totalStockValue": round(total_value, 2),
            "totalUnits": total_units,
            "activeMachines": active_machines,
            "activeBatches": active_batches,
            "inactiveBatches": inactive_batches,
            "outOfStockMachines": sum(1 for m in machines_out if sum(1 for s in stock_out if s["Machine_ID"] == m["Machine_ID"] and s["Current_Stock"] > 0) == 0)
        }

        return jsonify({
            'products': products_out,
            'machines': machines_out,
            'stock': stock_out,
            'sales': sales_out,
            'purchased_products': purchases_out,
            'refills': refills_out,
            'vendors': vendors_out,
            'warehouse': warehouse_out,
            'warehouses': warehouses_out,
            'warehouseEntries': warehouse_entries_out,
            'warehouseStocks': warehouse_stocks_out,
            'stocks': stocks_out,
            'stock_assignments': stock_assignments_out,
            'our_pos': our_pos_out,
            'metrics': metrics
        })

    except Exception as e:
        import traceback
        traceback.print_exc()
        return jsonify({'error': str(e)}), 500
