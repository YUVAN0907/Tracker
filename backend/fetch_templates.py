import urllib.request, json, os

token = ''
waba_id = '2114444966086853'

with open(r'c:\Users\YUVANSANKAR R\KKK\Tracker\backend\.env') as f:
    for line in f:
        if line.startswith('WHATSAPP_TOKEN='):
            token = line.strip().split('=', 1)[1]
            break

url = 'https://graph.facebook.com/v23.0/' + waba_id + '/message_templates?limit=100'
req = urllib.request.Request(url, headers={'Authorization': 'Bearer ' + token})
try:
    res = urllib.request.urlopen(req, timeout=15)
    data = json.loads(res.read().decode('utf-8'))
    templates = data.get('data', [])
    print('Found', len(templates), 'templates:')
    for t in templates:
        name = t.get('name', '')
        status = t.get('status', '')
        category = t.get('category', '')
        print('  name=' + name + '  status=' + status + '  category=' + category)
except Exception as e:
    print('Error:', e)
