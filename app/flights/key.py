"""Local development credential. The runtime directory is ignored by Git."""
import getpass
import os
from pathlib import Path

RUNTIME = Path(__file__).resolve().parents[2] / 'runtime'
KEY_FILE = RUNTIME / 'serpapi.key'


def api_key():
    return os.getenv('SERPAPI_API_KEY') or (KEY_FILE.read_text().strip() if KEY_FILE.exists() else '')


if __name__ == '__main__':
    key = getpass.getpass('SerpApi API key: ').strip()
    if not key:
        raise SystemExit('Пустой ключ')
    RUNTIME.mkdir(exist_ok=True)
    KEY_FILE.write_text(key)
    print('Ключ сохранён.')
