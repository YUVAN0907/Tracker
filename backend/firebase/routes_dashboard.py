from flask import Blueprint, jsonify
from dataconnect_db import execute_graphql

dashboard_bp = Blueprint('dashboard', __name__)

# Data Connect allows fetching multiple root queries in one request!
DASHBOARD_QUERY = """
query GetDashboardData {
  products(limit: 1000) {
    productId
    productName
    category
    vendorId
    mrp
    quantity
    units
    gst
    unitCost
    landedCost
    eanNo
    selfLife
    
    vendor {
      vendorId
      vendorName
    }
  }
  
  machines(limit: 100) {
    machineId
    location
    status
  }
  
  machineInventories(limit: 1000) {
    machineId
    productId
    currentStock
  }
  
  sales(limit: 1000) {
    saleId
    machineId
    productId
    quantitySold
    mrp
    status
    transactionAt
  }
  
  vendorPurchases(limit: 1000) {
    purchaseId
    poId
    vendorId
    productId
    batch
    unitsPerCase
    caseCount
    totalUnits
    mrp
    poPrice
    paymentMode
    paymentStatus
    gstFiled
    product {
      productName
    }
  }
  
  refillLogs(limit: 1000) {
    refillId
    date
    refillerId
    machineId
    productId
    coverCount
    quantity
  }
  
  vendors(limit: 1000) {
    vendorId
    vendorName
    mobileNumber
    email
  }
  
  warehouseInventories(limit: 1000) {
    productId
    availableUnits
    unitsPerCase
    lastReceivedDate
    notes
    product {
      productName
    }
  }
  
  purchasedProducts(limit: 1000) {
    id
    poId
    productId
    unitsPerCase
    availableUnits
    batch
    receivedDate
    product {
      productName
    }
  }
  
  machineStockAssignments(limit: 1000, orderBy: [{batch: ASC}, {stockLabel: ASC}, {coverLabel: ASC}]) {
    id
    batch
    assignedDate
    machineId
    stockLabel
    coverLabel
    coverStatus
    productId
    units
    status
    product {
      productName
    }
  }
  
  purchaseOrders(limit: 1000) {
    poId
    vendorId
    productId
    createdDate
    totalAmount
    noOfCases
    unitsPerCase
    poPrice
    lineTotal
    status
    product {
      productName
    }
  }
}
"""

@dashboard_bp.route('/api/dashboard', methods=['GET'])
def dashboard():
    try:
        data = execute_graphql(DASHBOARD_QUERY)
        
        # We need to reshape the GraphQL response to match the exact JSON keys 
        # the frontend `DataContext.jsx` expects to avoid breaking the UI.
        
        # 1. Map Products
        products_out = []
        for p in data.get("products", []):
            products_out.append({
                "PRODUCT_ID": p.get("productId"),
                "PRODUCT_NAME": p.get("productName"),
                "CATEGORY": p.get("category"),
                "VENDOR ID": p.get("vendorId"),
                "MRP": p.get("mrp"),
                "QUANTITY": p.get("units") or p.get("quantity"),  # Handle both
                "GST": p.get("gst", 0),
                "PO": p.get("unitCost", 0), # Mapped to unit_cost in frontend
                "UNITS": p.get("units", 1)
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
            
        # 5. Map Vendor Purchases (Deliveries)
        purchases_out = []
        for vp in data.get("vendorPurchases", []):
            purchases_out.append({
                "PO_ID": vp.get("poId"),
                "Vendor_ID": vp.get("vendorId"),
                "Product_ID": vp.get("productId"),
                "Batch": vp.get("batch"),
                "Units_Per_Case": vp.get("unitsPerCase"),
                "Cases_Received": vp.get("caseCount"),
                "Quantity": vp.get("totalUnits"),
                "MRP": vp.get("mrp"),
                "PO_Price": vp.get("poPrice"),
                "Payment_Status": vp.get("paymentStatus"),
                "Product_Name": (vp.get("product") or {}).get("productName", ""),
                "Date": "" # We don't have date on VendorPurchase in schema yet
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
            
        # 8. Map Warehouse
        warehouse_out = []
        for w in data.get("warehouseInventories", []):
            warehouse_out.append({
                "Product_ID": w.get("productId"),
                "Product_Name": (w.get("product") or {}).get("productName", "Unknown Product"),
                "Available_Units": w.get("availableUnits", 0),
                "Units_Per_Case": w.get("unitsPerCase", 1),
                "Last_Received_Date": w.get("lastReceivedDate", ""),
                "Notes": w.get("notes", "")
            })
            
        # 8a. Map Purchased Products
        purchased_products_out = []
        for pp in data.get("purchasedProducts", []):
            purchased_products_out.append({
                "EXP_Id": pp.get("id"),
                "PO_ID": pp.get("poId"),
                "Product_ID": pp.get("productId"),
                "Product_Name": (pp.get("product") or {}).get("productName", "Unknown Product"),
                "Available_Units": pp.get("availableUnits", 0),
                "Units_Per_Case": pp.get("unitsPerCase", 1),
                "Batch": pp.get("batch"),
                "Received_Date": pp.get("receivedDate", "")
            })
            
        # 8b. Map Stocks / Assignments (MachineStockAssignment)
        # In Excel this was 3 sheets (Stocks, StockProducts, StockAssignments)
        # The frontend expects "stocks" and "stock_assignments"
        stocks_out = []
        stock_assignments_out = []
        for msa in data.get("machineStockAssignments", []):
            product_dict = msa.get("product") or {}
            stocks_out.append({
                "Batch": msa.get("batch"),
                "Date": msa.get("assignedDate"),
                "Machine": msa.get("machineId"),
                "Stock": msa.get("stockLabel"),
                "cover": msa.get("coverLabel"),
                "cover_status": msa.get("coverStatus"),
                "product_id": msa.get("productId"),
                "product_name": product_dict.get("productName", ""),
                "units": msa.get("units", 0),
                "Status": msa.get("status"),
                "Stock_ID": msa.get("id")
            })
            stock_assignments_out.append({
                "Stock_ID": msa.get("id"),
                "Product_ID": msa.get("productId"),
                "Units": msa.get("units", 0),
                "Machine_ID": msa.get("machineId"),
                "Assignment_Status": msa.get("status")
            })
            
        # 9. Map OUR_POs
        our_pos_out = []
        for po in data.get("purchaseOrders", []):
            our_pos_out.append({
                "PO_ID": po.get("poId"),
                "Vendor_ID": po.get("vendorId"),
                "Product_ID": po.get("productId"),
                "No_of_Cases": po.get("noOfCases", 0),
                "Units_Per_Case": po.get("unitsPerCase", 1),
                "PO_Price": po.get("poPrice", 0),
                "Line_Total": po.get("lineTotal", 0),
                "Total_Amount": po.get("totalAmount", 0),
                "Created_Date": po.get("createdDate", ""),
                "Product_Name": po.get("product", {}).get("productName", ""),
                "Status": po.get("status", "Pending")
            })

        # Calculate basic metrics to match old dashboard
        total_value = sum((float(op.get("PO_Price", 0)) * float(op.get("No_of_Cases", 0)) * float(op.get("Units_Per_Case", 1))) for op in our_pos_out)
        total_units = sum(int(inv.get("Current_Stock", 0)) for inv in stock_out)
        active_machines = sum(1 for m in machines_out if str(m.get("Status")).lower() == 'active')
        
        metrics = {
            "totalStockValue": round(total_value, 2),
            "totalUnits": total_units,
            "activeMachines": active_machines,
            "outOfStockMachines": sum(1 for m in machines_out if sum(1 for s in stock_out if s["Machine_ID"] == m["Machine_ID"] and s["Current_Stock"] > 0) == 0)
        }

        return jsonify({
            'products': products_out,
            'machines': machines_out,
            'stock': stock_out,
            'sales': sales_out,
            'purchases': purchases_out,
            'refills': refills_out,
            'vendors': vendors_out,
            'warehouse': warehouse_out,
            'purchased_products': purchased_products_out,
            'stocks': stocks_out,
            'stock_assignments': stock_assignments_out,
            'our_pos': our_pos_out,
            'metrics': metrics
        })

    except Exception as e:
        import traceback
        traceback.print_exc()
        return jsonify({'error': str(e)}), 500
