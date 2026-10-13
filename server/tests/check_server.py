import urllib.request
url='http://127.0.0.1:30849/'
try:
    with urllib.request.urlopen(url, timeout=5) as r:
        print('status', r.status)
        body=r.read(200)
        print(body.decode('utf-8', errors='replace')[:400])
except Exception as e:
    print('ERR', e)
    raise
