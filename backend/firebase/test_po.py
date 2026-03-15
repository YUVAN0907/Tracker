import requests

url = "http://127.0.0.1:3002/api/create-po"
payload = {
    "po_id": "TEST-PO-002",
    "vendor_id": "ARA01",
    "product_id": "TEST002",
    "no_of_cases": 2,
    "units_per_case": 12,
    "po_price": 10.5,
    "notes": "Test"
}

try:
    res = requests.post(url, json=payload)
    print("STATUS:", res.status_code)
    print("RESPONSE:", res.json())
except Exception as e:
    print("REQ_ERR:", e)
