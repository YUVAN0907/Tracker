import firebase_server
from flask import json
app = firebase_server.app
client = app.test_client()
resp = client.post('/api/update-po/TEST', data=json.dumps({'items':[{'product_id':'TEST','no_of_cases':1,'units_per_case':1,'po_price':10}]}), content_type='application/json', headers={'Origin':'http://localhost:5173','Authorization':'Bearer test'})
print('status', resp.status_code)
print(resp.get_data(as_text=True))
