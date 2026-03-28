from flask import Blueprint, request, jsonify
from datetime import datetime, timedelta
from dataconnect_db import execute_graphql, format_timestamp
from uuid import uuid4

purchases_bp = Blueprint('purchases', __name__)

INSERT_VENDOR_PURCHASE_MUTATION = """
mutation InsertVendorPurchase(
  $poId: String!,
  $vendorId: String!,
  $productId: String!,
  $batch: Int,
  $unitsPerCase: Int,
  $caseCount: Int,
  $totalUnits: Int,
  $mrp: Float,
  $poPrice: Float,
  $paymentMode: String,
  $paymentStatus: String,
  $gstFiled: Boolean
) {
  vendorPurchase_insert(data: {
    poId: $poId,
    vendorId: $vendorId,
    productId: $productId,
    batch: $batch,
    unitsPerCase: $unitsPerCase,
    caseCount: $caseCount,
    totalUnits: $totalUnits,
    mrp: $mrp,
    poPrice: $poPrice,
    paymentMode: $paymentMode,
    paymentStatus: $paymentStatus,
    gstFiled: $gstFiled
  }) 
}
"""

INSERT_VENDOR_PURCHASE_ORDER_MUTATION = """
mutation InsertVendorPurchaseOrder(
  $purchaseOrderId: UUID!,
  $poId: String!,
  $vendorId: String!,
  $receivedDate: Timestamp!,
  $paymentMode: String!,
  $paymentStatus: String!,
  $gstFiled: Boolean!
) {
  vendorPurchaseOrder_insert(data: {
    purchaseOrderId: $purchaseOrderId,
    poId: $poId,
    vendorId: $vendorId,
    receivedDate: $receivedDate,
    paymentMode: $paymentMode,
    paymentStatus: $paymentStatus,
    gstFiled: $gstFiled
  })
}
"""

INSERT_VENDOR_PURCHASE_ITEM_MUTATION = """
mutation InsertVendorPurchaseItem(
  $itemId: UUID!,
  $purchaseOrderId: UUID!,
  $productId: String!,
  $batch: Int!,
  $unitsPerCase: Int!,
  $caseCount: Int!,
  $totalUnits: Int!,
  $mrp: Float!,
  $poPrice: Float!
) {
  vendorPurchaseItem_insert(data: {
    itemId: $itemId,
    purchaseOrderId: $purchaseOrderId,
    productId: $productId,
    batch: $batch,
    unitsPerCase: $unitsPerCase,
    caseCount: $caseCount,
    totalUnits: $totalUnits,
    mrp: $mrp,
    poPrice: $poPrice
  })
}
"""

# Insert into PurchasedProductBatch (Level 1: PO + Product)
INSERT_PURCHASED_PRODUCT_BATCH_MUTATION = """
mutation InsertPurchasedProductBatch(
  $poId: String!,
  $productId: String!,
  $batch: Int!,
  $unitsPerCase: Int!,
  $receivedDate: Timestamp,
  $notes: String,
  $status: String
) {
  purchasedProductBatch_insert(data: {
    poId: $poId,
    productId: $productId,
    batch: $batch,
    unitsPerCase: $unitsPerCase,
    receivedDate: $receivedDate,
    notes: $notes,
    status: $status,
    createdAt: $receivedDate,
    updatedAt: $receivedDate
  })
}
"""

# Insert into PurchasedProductCase (Level 2: Individual Cases)
INSERT_PURCHASED_PRODUCT_CASE_MUTATION = """
mutation InsertPurchasedProductCase(
  $batchId: UUID!,
  $caseLabel: String!,
  $mfd: Timestamp!,
  $expd: Timestamp!,
  $availableUnits: Int!
) {
  purchasedProductCase_insert(data: {
    purchasedProductBatchId: $batchId,
    caseLabel: $caseLabel,
    mfd: $mfd,
    expd: $expd,
    availableUnits: $availableUnits,
    lastUpdated: $mfd
  })
}
"""

# Insert batch - Data Connect auto-generates UUID when id is not provided
GET_OR_CREATE_BATCH_MUTATION = """
mutation InsertPurchasedProductBatch(
  $id: UUID!,
  $poId: String!,
  $productId: String!,
  $batch: Int!,
  $unitsPerCase: Int!,
  $totalUnitsReceived: Int!,
  $receivedDate: Timestamp,
  $notes: String
) {
  purchasedProductBatch_insert(data: {
    id: $id,
    poId: $poId,
    productId: $productId,
    batch: $batch,
    unitsPerCase: $unitsPerCase,
    totalUnitsReceived: $totalUnitsReceived,
    receivedDate: $receivedDate,
    notes: $notes,
    status: "active",
    createdAt: $receivedDate,
    updatedAt: $receivedDate
  })
}
"""

# Query to get products with selfLife
GET_PRODUCTS_QUERY = """
query GetProducts($productIds: [String!]) {
  products(where: {productId: {in: $productIds}}) {
    productId
    productName
    selfLife
  }
}
"""

GET_PO_QUERY = """
query GetPOStatus($poId: String!) {
  purchaseOrderHeaders(where: {poId: {eq: $poId}}) {
    poId
    status
  }
}
"""

UPDATE_PO_STATUS_MUTATION = """
mutation UpdatePOStatus($poId: String!, $status: String!) {
  purchaseOrderHeader_update(key: { poId: $poId }, data: { status: $status }) 
}
"""

# NEW MUTATIONS FOR NORMALIZED PURCHASED PRODUCTS TABLES

# Insert into PurchasedProductBatch (Level 1: PO + Product)
INSERT_PURCHASED_PRODUCT_BATCH_MUTATION = """
mutation InsertPurchasedProductBatch(
  $poId: String!,
  $productId: String!,
  $batch: Int!,
  $unitsPerCase: Int!,
  $receivedDate: Timestamp,
  $notes: String,
  $status: String
) {
  purchasedProductBatch_insert(data: {
    poId: $poId,
    productId: $productId,
    batch: $batch,
    unitsPerCase: $unitsPerCase,
    receivedDate: $receivedDate,
    notes: $notes,
    status: $status,
    createdAt: $receivedDate,
    updatedAt: $receivedDate
  })
}
"""

@purchases_bp.route('/api/vendor-purchases', methods=['GET'])
def get_vendor_purchases():
    # Return combined data from VendorPurchaseOrder and VendorPurchaseItem in flattened style
    query = """
    query GetVendorPurchases {
      vendorPurchaseOrders(limit: 1000) {
        purchaseOrderId
        poId
        vendorId
        receivedDate
        paymentMode
        paymentStatus
        gstFiled
        vendor {
          vendorName
        }
      }
      vendorPurchaseItems(limit: 1000) {
        itemId
        purchaseOrderId
        productId
        batch
        unitsPerCase
        caseCount
        totalUnits
        mrp
        poPrice
        product {
          productName
        }
      }
    }
    """

    try:
        result = execute_graphql(query)
        data = result.get('data') if isinstance(result, dict) else None

        orders = (data or {}).get('vendorPurchaseOrders', [])
        items = (data or {}).get('vendorPurchaseItems', [])

        item_map = {}
        for item in items:
            po_id = item.get('purchaseOrderId')
            if not po_id:
                continue
            item_map.setdefault(po_id, []).append(item)

        rows = []
        for order in orders:
            order_po_id = order.get('purchaseOrderId')
            order_items = item_map.get(order_po_id, [])

            for idx, item in enumerate(order_items):
                is_first_row = idx == 0
                rows.append({
                    'PO_ID': order.get('poId') if is_first_row else '',
                    'Vendor_ID': order.get('vendorId') if is_first_row else '',
                    'Vendor_Name': (order.get('vendor') or {}).get('vendorName') if is_first_row else '',
                    'Date': order.get('receivedDate') if is_first_row else '',
                    'Payment_Mode': order.get('paymentMode') if is_first_row else '',
                    'Payment_Status': order.get('paymentStatus') if is_first_row else '',
                    'GST_Filed': ('Yes' if order.get('gstFiled') else 'No') if is_first_row else '',
                    'Product_ID': item.get('productId'),
                    'Product_Name': (item.get('product') or {}).get('productName') or '',
                    'Batch': item.get('batch'),
                    'Units_Per_Case': item.get('unitsPerCase'),
                    'Case_Count': item.get('caseCount'),
                    'Quantity': item.get('totalUnits'),
                    'MRP': item.get('mrp'),
                    'PO_Price': item.get('poPrice'),
                })

        return jsonify({'purchases': rows})
    except Exception as e:
        return jsonify({'error': str(e), 'purchases': []}), 500

@purchases_bp.route('/api/record-delivery-normalized', methods=['POST'])
def record_delivery_normalized():
    # Route alias for normalized flow (preferred)
    return record_delivery()

@purchases_bp.route('/api/record-delivery', methods=['POST'])
def record_delivery():
    """Record delivery using normalized table structure (PurchasedProductBatch + PurchasedProductCase)"""
    import sys
    import traceback
    
    print(f"\n{'='*80}", file=sys.stderr, flush=True)
    print(f"[record_delivery] ===== REQUEST RECEIVED =====", file=sys.stderr, flush=True)
    
    try:
        data = request.json
        print(f"[record_delivery] Content-Type: {request.content_type}", file=sys.stderr, flush=True)
        print(f"[record_delivery] Payload received: {data}", file=sys.stderr, flush=True)
        
        if data is None:
            print(f"[record_delivery] ERROR: request.json is None", file=sys.stderr, flush=True)
            return jsonify({'error': 'Request body must be valid JSON'}), 400
        
        po_id = str(data.get('po_id', data.get('PO_ID', ''))).strip()
        vendor_id_parent = str(data.get('vendor_id', data.get('Vendor_ID', ''))).strip()
        items = data.get('items', [])

        payment_mode = str(data.get('payment_mode', data.get('paymentMode', 'Cash')) or 'Cash').strip()
        payment_status = str(data.get('payment_status', data.get('paymentStatus', 'Pending')) or 'Pending').strip()
        gst_filed_raw = data.get('gst_filed', data.get('gstFiled', False))
        gst_filed = True if str(gst_filed_raw).strip().lower() in ['yes', 'true', '1', 'y'] else False

        print(f"[record_delivery] Extracted: po_id={po_id}, vendor_id={vendor_id_parent}, items_count={len(items)}, payment_mode={payment_mode}, payment_status={payment_status}, gst_filed={gst_filed}", file=sys.stderr, flush=True)

        if not po_id or not items:
            error_msg = f'PO ID and items are required. Got: po_id={po_id}, items_count={len(items)}'
            print(f"[record_delivery] Validation error: {error_msg}", file=sys.stderr, flush=True)
            return jsonify({'error': error_msg}), 400
        
        print(f"[record_delivery] Validation passed. Starting processing...", file=sys.stderr, flush=True)

        received_date_obj = datetime.now()
        received_date = format_timestamp(received_date_obj)

        # Insert into VendorPurchaseOrder (PO-level payment info)
        vendor_purchase_order_id = str(uuid4())
        try:
            vendor_order_vars = {
                "purchaseOrderId": vendor_purchase_order_id,
                "poId": po_id,
                "vendorId": vendor_id_parent,
                "receivedDate": received_date,
                "paymentMode": payment_mode,
                "paymentStatus": payment_status,
                "gstFiled": gst_filed
            }
            print(f"[record_delivery] VendorPurchaseOrder mutation vars: {vendor_order_vars}", file=sys.stderr, flush=True)
            execute_graphql(INSERT_VENDOR_PURCHASE_ORDER_MUTATION, vendor_order_vars)
            print(f"[record_delivery] ✓ VendorPurchaseOrder created: {vendor_purchase_order_id}", file=sys.stderr, flush=True)
        except Exception as vendor_order_err:
            error_detail = str(vendor_order_err)
            print(f"[record_delivery] ✗ ERROR creating VendorPurchaseOrder: {error_detail}", file=sys.stderr, flush=True)
            traceback.print_exc(file=sys.stderr)
            return jsonify({'error': f'Error creating vendor purchase order: {error_detail}'}), 400

        # Collect all product IDs to fetch selfLife
        product_ids = [item.get('product_id', item.get('Product_ID', '')) for item in items]
        product_ids = [pid for pid in product_ids if pid]
        
        print(f"[record_delivery] Product IDs to fetch: {product_ids}", file=sys.stderr, flush=True)
        
        # Fetch products with selfLife
        try:
            products_res = execute_graphql(GET_PRODUCTS_QUERY, {"productIds": product_ids})
            print(f"[record_delivery] Products fetch result: {products_res}", file=sys.stderr, flush=True)
        except Exception as prod_err:
            print(f"[record_delivery] ERROR fetching products: {prod_err}", file=sys.stderr, flush=True)
            # Don't fail - continue with default values
            products_res = {"products": []}
        
        products_map = {}
        for prod in products_res.get("products", []):
            products_map[prod.get("productId")] = {
                "productName": prod.get("productName"),
                "selfLife": prod.get("selfLife", 0)
            }
        
        print(f"[record_delivery] Products map: {products_map}", file=sys.stderr, flush=True)
        print(f"[record_delivery] Missing products not in map: {[pid for pid in product_ids if pid not in products_map]}", file=sys.stderr, flush=True)
        
        insertion_count = 0
        items_notes = data.get('notes', '')
        
        # Debug: Count PO vs Custom products
        print(f"[record_delivery] Total items received: {len(items)}", file=sys.stderr, flush=True)
        for idx, item in enumerate(items):
            is_custom = 'Custom_' in item.get('product_id', '')
            print(f"[record_delivery] Item {idx + 1}: product_id='{item.get('product_id')}' ({'CUSTOM' if is_custom else 'PO'}), cases={len(item.get('cases', []))}", file=sys.stderr, flush=True)
        
        # Process each product's cases
        for item_idx, item in enumerate(items):
            product_id = str(item.get('product_id', item.get('Product_ID', ''))).strip()
            vendor_id = str(item.get('vendor_id', item.get('Vendor_ID', vendor_id_parent))).strip()
            batch = int(item.get('batch', item.get('Batch', 1)))
            cases = item.get('cases', [])
            product_notes = str(item.get('notes', '')).strip()
            
            is_custom = 'Custom_' in product_id or product_id not in [b.get('poId') for b in purchased_product_batches_out] if 'purchased_product_batches_out' in locals() else False
            item_type = 'CUSTOM' if is_custom else 'PO'
            
            print(f"[record_delivery] [{item_type}] Processing item {item_idx + 1}/{len(items)}: product {product_id}, cases_count={len(cases)}", file=sys.stderr, flush=True)
            
            if not product_id or not cases:
                print(f"[record_delivery] Skipping product {product_id}: missing product_id or cases", file=sys.stderr, flush=True)
                continue
            
            # Get product info for selfLife
            product_info = products_map.get(product_id, {})
            self_life_days = product_info.get("selfLife", 0)
            
            # If selfLife is 0 or product not found, use a sensible default (180 days for most FMCG)
            if self_life_days == 0:
                self_life_days = 180  # Default 180 days (~6 months) for FMCG products
                print(f"[record_delivery] ⚠️  Product {product_id} not in products_map or selfLife is 0. Using default: {self_life_days} days", file=sys.stderr, flush=True)
            else:
                print(f"[record_delivery] Product {product_id} selfLife: {self_life_days} days", file=sys.stderr, flush=True)
            
            # Step 1: Calculate total units received (sum of all case units)
            units_per_case = int(cases[0].get('units_per_case', cases[0].get('unitsPerCase', 1)))
            total_units_received = sum(int(c.get('units_received', c.get('unitsReceived', units_per_case))) for c in cases)
            
            print(f"[record_delivery] Units per case: {units_per_case}, total received: {total_units_received}", file=sys.stderr, flush=True)
            
            # Step 2: Get or create PurchasedProductBatch (Level 1: PO + Product)
            batch_id = None
            try:
                # Generate batch UUID on backend
                batch_id = str(uuid4())
                
                batch_vars = {
                    "id": batch_id,
                    "poId": po_id,
                    "productId": product_id,
                    "batch": batch,
                    "unitsPerCase": units_per_case,
                    "totalUnitsReceived": total_units_received,
                    "receivedDate": received_date,
                    "notes": product_notes
                }
                print(f"[record_delivery] Batch mutation vars: {batch_vars}", file=sys.stderr, flush=True)
                
                batch_result = execute_graphql(GET_OR_CREATE_BATCH_MUTATION, batch_vars)
                print(f"[record_delivery] Batch insert result: {batch_result}", file=sys.stderr, flush=True)
                
                print(f"[record_delivery] ✓ Successfully created batch {batch_id}: PO {po_id}, Product {product_id}", file=sys.stderr, flush=True)

                # Insert VendorPurchaseItem for this product (product-level payment record)
                try:
                    item_mrp_raw = item.get('mrp', item.get('MRP', None))
                    if item_mrp_raw is None or item_mrp_raw == '':
                        # fallback to PO item price or batch one as available
                        item_mrp_raw = item.get('po_price', item.get('PO_Price', 0))
                    item_mrp = float(item_mrp_raw or 0)

                    item_po_price = float(item.get('po_price', item.get('PO_Price', 0) or 0))
                    item_case_count = len(cases)
                    item_total_units = total_units_received

                    vendor_item_vars = {
                        "itemId": str(uuid4()),
                        "purchaseOrderId": vendor_purchase_order_id,
                        "productId": product_id,
                        "batch": batch,
                        "unitsPerCase": units_per_case,
                        "caseCount": item_case_count,
                        "totalUnits": item_total_units,
                        "mrp": item_mrp,
                        "poPrice": item_po_price
                    }
                    print(f"[record_delivery] VendorPurchaseItem mutation vars: {vendor_item_vars}", file=sys.stderr, flush=True)
                    execute_graphql(INSERT_VENDOR_PURCHASE_ITEM_MUTATION, vendor_item_vars)
                    print(f"[record_delivery] ✓ VendorPurchaseItem inserted for product {product_id}", file=sys.stderr, flush=True)
                except Exception as vendor_item_err:
                    error_detail = str(vendor_item_err)
                    print(f"[record_delivery] ✗ ERROR creating VendorPurchaseItem for product {product_id}: {error_detail}", file=sys.stderr, flush=True)
                    traceback.print_exc(file=sys.stderr)
                    return jsonify({'error': f'Error creating vendor purchase item for product {product_id}: {error_detail}'}), 400

            except Exception as batch_err:
                error_detail = str(batch_err)
                print(f"[record_delivery] ✗ ERROR creating batch: {error_detail}", file=sys.stderr, flush=True)
                traceback.print_exc(file=sys.stderr)
                return jsonify({'error': f'Error creating batch for product {product_id}: {error_detail}'}), 400
            
            if not batch_id:
                return jsonify({'error': f'Failed to create batch for product {product_id}'}), 400
            
            # Step 3: Process each case
            for case_idx, case_data in enumerate(cases, start=1):
                try:
                    print(f"[record_delivery] Processing case {case_idx}/{len(cases)} for product {product_id}", file=sys.stderr, flush=True)
                    print(f"[record_delivery] Case data keys: {case_data.keys()}", file=sys.stderr, flush=True)
                    print(f"[record_delivery] Case data: {case_data}", file=sys.stderr, flush=True)
                    
                    # Parse manufacture date
                    mfd_str = case_data.get('mfd', case_data.get('ManufactureDate', ''))
                    if not mfd_str:
                        error_msg = f'Manufacture date missing for case {case_idx} of product {product_id}'
                        print(f"[record_delivery] ✗ {error_msg}", file=sys.stderr, flush=True)
                        return jsonify({'error': error_msg}), 400
                    
                    # Parse mfd as timestamp
                    try:
                        mfd_dt = datetime.strptime(mfd_str, '%Y-%m-%d')
                    except:
                        try:
                            mfd_dt = datetime.fromisoformat(mfd_str)
                        except:
                            error_msg = f'Invalid manufacture date format for case {case_idx}: {mfd_str}'
                            print(f"[record_delivery] ✗ {error_msg}", file=sys.stderr, flush=True)
                            return jsonify({'error': error_msg}), 400
                    
                    # Parse expiry date from frontend (if provided) or calculate from selfLife
                    expd_str = case_data.get('expd', case_data.get('ExpiryDate', ''))
                    print(f"[record_delivery]   Raw expd value from case_data: '{expd_str}'", file=sys.stderr, flush=True)
                    print(f"[record_delivery]   self_life_days from product: {self_life_days}", file=sys.stderr, flush=True)
                    
                    if expd_str:
                        # Use the expiry date sent from frontend (already calculated correctly by user input)
                        try:
                            expd_dt = datetime.strptime(expd_str, '%Y-%m-%d')
                            print(f"[record_delivery]   ✓ Parsed frontend expd with %Y-%m-%d format: {expd_dt.strftime('%Y-%m-%d')}", file=sys.stderr, flush=True)
                        except:
                            try:
                                expd_dt = datetime.fromisoformat(expd_str)
                                print(f"[record_delivery]   ✓ Parsed frontend expd with fromisoformat: {expd_dt.strftime('%Y-%m-%d')}", file=sys.stderr, flush=True)
                            except:
                                error_msg = f'Invalid expiry date format for case {case_idx}: {expd_str}'
                                print(f"[record_delivery] ✗ {error_msg}", file=sys.stderr, flush=True)
                                return jsonify({'error': error_msg}), 400
                        print(f"[record_delivery]   Using frontend-provided expiry date: {expd_str}", file=sys.stderr, flush=True)
                    else:
                        # Fallback: Calculate expiry date from selfLife if not provided
                        expd_dt = mfd_dt + timedelta(days=self_life_days)
                        print(f"[record_delivery]   ⚠️  No frontend expiry provided. Calculated expiry from selfLife: {self_life_days} days", file=sys.stderr, flush=True)
                        print(f"[record_delivery]   Calculated expiry: {expd_dt.strftime('%Y-%m-%d')}", file=sys.stderr, flush=True)
                    
                    print(f"[record_delivery]   Dates: mfd={mfd_str}, expd={expd_dt.strftime('%Y-%m-%d')}", file=sys.stderr, flush=True)
                    
                    # Parse other case data
                    units_per_case = int(case_data.get('units_per_case', case_data.get('unitsPerCase', 1)))
                    units_received = int(case_data.get('units_received', case_data.get('unitsReceived', units_per_case)))
                    
                    # Auto-generate case label: poId_productId_c{n}
                    case_label = case_data.get('case_label', case_data.get('caseLabel', f"{po_id}_{product_id}_c{case_idx}"))
                    
                    # Step 2a: Insert into PurchasedProductCase (Level 2: Individual Cases)
                    case_vars = {
                        "batchId": batch_id,
                        "caseLabel": case_label,
                        "mfd": format_timestamp(mfd_dt),
                        "expd": format_timestamp(expd_dt),
                        "availableUnits": units_received
                    }
                    print(f"[record_delivery]   Case mutation vars: {case_vars}", file=sys.stderr, flush=True)
                    
                    case_result = execute_graphql(INSERT_PURCHASED_PRODUCT_CASE_MUTATION, case_vars)
                    insertion_count += 1
                    print(f"[record_delivery] ✓ Case {case_label} inserted successfully", file=sys.stderr, flush=True)
                    
                except Exception as case_err:
                    error_detail = str(case_err)
                    print(f"[record_delivery] ✗ ERROR processing case {case_idx}: {error_detail}", file=sys.stderr, flush=True)
                    traceback.print_exc(file=sys.stderr)
                    return jsonify({'error': f'Error processing case {case_idx}: {error_detail}'}), 400

        # ✅ ALL INSERTIONS SUCCESSFUL - Update PO status to 'Completed'
        try:
            print(f"[record_delivery] Updating PO {po_id} status to Completed...", file=sys.stderr, flush=True)
            execute_graphql(UPDATE_PO_STATUS_MUTATION, {"poId": po_id, "status": "Completed"})
            print(f"[record_delivery] ✓ PO {po_id} status updated to Completed", file=sys.stderr, flush=True)
        except Exception as status_err:
            print(f"[record_delivery] ⚠ Warning updating PO status: {str(status_err)}", file=sys.stderr, flush=True)
            # Don't fail the whole operation if status update fails

        success_message = f'Delivery recorded for PO {po_id}'
        success_details = f'Inserted {insertion_count} cases. PO status changed to Completed.'
        print(f"[record_delivery] ✓✓✓ SUCCESS: {success_message}", file=sys.stderr, flush=True)
        print(f"[record_delivery] {success_details}", file=sys.stderr, flush=True)
        print(f"{'='*80}\n", file=sys.stderr, flush=True)
        
        return jsonify({
            'success': True,
            'message': success_message,
            'details': success_details
        })

    except Exception as e:
        import traceback
        error_msg = str(e)
        print(f"[record_delivery] ✗✗✗ EXCEPTION: {error_msg}", file=sys.stderr, flush=True)
        traceback.print_exc(file=sys.stderr)
        print(f"{'='*80}\n", file=sys.stderr, flush=True)
        return jsonify({'error': error_msg, 'success': False}), 500


@purchases_bp.route('/api/generate-vendor-po-ids', methods=['POST'])
def generate_vendor_po_ids():
    data = request.json
    try:
        vendor_ids = data.get('vendorIds', [])
        po_ids = {}
        time_str = datetime.now().strftime("%Y%m%d%A%B").upper() # Just a dummy unique string
        for vid in vendor_ids:
            po_ids[vid] = f"VP-{time_str}-{vid}"
        return jsonify({'po_ids': po_ids})
    except Exception as e:
        return jsonify({'error': str(e)}), 500
