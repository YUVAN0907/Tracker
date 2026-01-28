import requests
import json

try:
    res = requests.get("http://localhost:3001/api/dashboard")
    print(json.dumps(res.json()['metrics'], indent=2))
    print(f"Products count: {len(res.json()['products'])}")
    print(f"Stock count: {len(res.json()['stock'])}")
except Exception as e:
    print(f"Error: {e}")
