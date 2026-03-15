import requests

url = "http://127.0.0.1:3002/api/add-product"
payload = {
    "PRODUCT_ID": "TEST002",
    "PRODUCT_NAME": "TEST",
    "CATEGORY": "TEST",
    "VENDOR ID": "UNKNOWN",
    "MRP": 10,
    "GST": 0,
    "QUANTITY": 0,
    "PO": 5
}

try:
    res = requests.post(url, json=payload)
    print("STATUS:", res.status_code)
    print("RESPONSE:", res.json())
except Exception as e:
    print("REQ_ERR:", e)
