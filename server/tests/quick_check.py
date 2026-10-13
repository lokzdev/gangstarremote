import sys, traceback
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent))
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

def try_import(name):
    try:
        mod = __import__(name)
        print(f"OK: imported {name}")
        return mod
    except Exception as e:
        print(f"ERR: import {name} -> {e}")
        traceback.print_exc()
        return None

if __name__ == '__main__':
    print('Quick environment check')
    gm = try_import('gangstar_env')
    if gm:
        try:
            ip = gm.detect_host_ipv4()
            print('detect_host_ipv4 ->', ip)
        except Exception as e:
            print('ERR: detect_host_ipv4 ->', e)
            traceback.print_exc()

    try_import('auth')
    try_import('schemas')
    try_import('models')
    tc = try_import('telegram_crypter')
    if tc and hasattr(tc, 'get_telegram_status'):
        try:
            print('telegram status ->', tc.get_telegram_status())
        except Exception as e:
            print('ERR: telegram status ->', e)
            traceback.print_exc()

    print('Quick check finished')
