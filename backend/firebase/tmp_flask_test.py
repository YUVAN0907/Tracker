import json
from firebase_server import app

with app.test_client() as client:
    response = client.post('/api/qr/generate-from-batch', json={'batch': 1, 'userId': 'test_user_123'})
    print('STATUS', response.status_code)
    print('DATA', response.get_data(as_text=True))
    try:
        print('JSON', response.get_json())
    except Exception as e:
        print('JSON ERROR', e)
