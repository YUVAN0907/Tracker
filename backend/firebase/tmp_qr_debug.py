import json
import uuid
import urllib.request

BASE_URL = 'http://127.0.0.1:3002'

def post_json(path, data):
    url = f"{BASE_URL}{path}"
    body = json.dumps(data).encode('utf-8')
    req = urllib.request.Request(url, data=body, headers={'Content-Type': 'application/json'}, method='POST')
    with urllib.request.urlopen(req) as resp:
        print('REQUEST', path)
        print('STATUS', resp.status)
        print(resp.read().decode('utf-8'))

if __name__ == '__main__':
    try:
        post_json('/api/qr/generate-from-batch', {'batch': 1, 'userId': 'test_user_123'})
    except Exception as exc:
        print('EXCEPTION', type(exc).__name__, exc)
        if hasattr(exc, 'read'):
            try:
                print(exc.read().decode('utf-8'))
            except Exception:
                pass
