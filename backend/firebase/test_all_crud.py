import requests

BASE_URL = "http://127.0.0.1:3002/api"

print("--- STARTING COMPREHENSIVE CRUD TESTS ---")

def run_test(name, endpoint, payload=None, expected_status=200):
    try:
        url = f"{BASE_URL}{endpoint}"
        if payload is not None:
            res = requests.post(url, json=payload)
        else:
            res = requests.get(url)
        
        if res.status_code == expected_status:
            print(f"✅ PASS: {name}")
            return True, res.json()
        else:
            print(f"❌ FAIL: {name} | Status: {res.status_code}")
            print(f"   Response: {res.text}")
            return False, res.json() if res.headers.get('content-type') == 'application/json' else None
    except Exception as e:
        print(f"❌ FAIL (Exception): {name} | Error: {e}")
        return False, None

# 1. INVENTORY (Products)
print("\n[1] Testing Inventory CRUD...")
# Create
run_test("Add Product", "/add-product", {
    "PRODUCT_ID": "AUTO_TEST_PROD",
    "PRODUCT_NAME": "Auto Test Product",
    "CATEGORY": "TEST",
    "VENDOR ID": "ARA01",
    "MRP": 50,
    "GST": 5,
    "QUANTITY": 100,
    "PO": 20
})
# Update
run_test("Update Product", "/update-product", {
    "PRODUCT_ID": "AUTO_TEST_PROD",
    "PRODUCT_NAME": "Auto Test Product Updated",
    "MRP": 55
})

# 2. PURCHASE ORDERS
print("\n[2] Testing PO CRUD...")
run_test("Create Single PO", "/create-po", {
    "po_id": "VP-AUTO-001",
    "vendor_id": "ARA01",
    "product_id": "AUTO_TEST_PROD",
    "no_of_cases": 5,
    "units_per_case": 12,
    "po_price": 20,
    "notes": "Automated PO"
})
run_test("Fetch PO Items", "/po-items/VP-AUTO-001")

# 3. WAREHOUSE
print("\n[3] Testing Warehouse CRUD...")
run_test("Add to Warehouse", "/warehouse/add", {
    "product_id": "AUTO_TEST_PROD",
    "product_name": "Auto Test Product Updated",
    "units": 60,
    "units_per_case": 12,
    "notes": "Test receive"
})

# 4. BATCH CREATION (Assuming route structure, will verify if fails)
print("\n[4] Testing Batch Storage...")
run_test("Create Batch", "/record-delivery", {
    "po_id": "VP-AUTO-001",
    "vendor_id": "ARA01",
    "items": [{
        "Product_ID": "AUTO_TEST_PROD",
        "Cases_Received": 5,
        "Units_Per_Case": 12,
        "Batch": 1001,
        "PO_Price": 20
    }]
})

# CLEANUP
# CLEANUP
print("\n[5] Cleanup...")
run_test("Delete Warehouse Item", "/warehouse/delete", {"product_id": "AUTO_TEST_PROD"})
# Normally we'd also delete the PO or VendorPurchase, but the backend doesn't have a delete route yet for POs.
# Assuming Data Connect blocks product deletion if PO exists. 
# We'll see if the product delete fails, but it proves the insertion worked.
run_test("Delete Product", "/delete-product", {
    "PRODUCT_ID": "AUTO_TEST_PROD"
})

print("\n--- TESTS COMPLETE ---")
