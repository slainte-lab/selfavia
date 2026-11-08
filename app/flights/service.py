import hashlib
import json
import sqlite3
import threading
import time
from contextlib import closing
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import urlopen

from fastapi import APIRouter, HTTPException

from .key import RUNTIME, api_key
from .models import Search

router = APIRouter()
lock = threading.Lock()


def fetch(params, key):
    url = 'https://serpapi.com/search.json?' + urlencode({**params, 'api_key':key})
    try:
        with urlopen(url, timeout=45) as response:
            payload = json.load(response)
    except HTTPError as error:
        if error.code == 429:
            raise HTTPException(429, 'Исчерпан лимит SerpApi.')
        raise HTTPException(502, 'Сервис поиска отклонил запрос.')
    except (URLError, OSError, ValueError):
        raise HTTPException(502, 'Сервис поиска недоступен.')
    if payload.get('error') or payload.get('search_metadata', {}).get('status') != 'Success':
        raise HTTPException(502, 'Сервис поиска не завершил запрос.')
    offers = []
    for item in (payload.get('best_flights') or []) + (payload.get('other_flights') or []):
        flights = item.get('flights')
        if flights:
            offers.append(dict(price=item.get('price'), duration=item.get('total_duration'),
                               token=item.get('departure_token'), flights=[dict(
                origin=f['departure_airport']['id'], departure=f['departure_airport']['time'],
                destination=f['arrival_airport']['id'], arrival=f['arrival_airport']['time'],
                airline=f.get('airline'), number=f.get('flight_number')) for f in flights]))
    return offers


@router.post('/api/flights/search')
def search(request: Search):
    key = api_key()
    if not key:
        raise HTTPException(503, 'Поиск рейсов пока не подключён: нужен ключ SerpApi.')
    params = request.parameters()
    digest = hashlib.sha256(json.dumps(params, sort_keys=True).encode()).hexdigest()
    # One local worker: serialize cache misses and reserve quota before the HTTP call.
    RUNTIME.mkdir(exist_ok=True)
    with lock, closing(sqlite3.connect(RUNTIME / 'flights.sqlite3')) as db:
        db.execute('CREATE TABLE IF NOT EXISTS cache (id TEXT PRIMARY KEY, ts REAL, body TEXT)')
        db.execute('CREATE TABLE IF NOT EXISTS calls (ts REAL)')
        now = time.time()
        with db:
            db.execute('DELETE FROM cache WHERE ts <= ?', (now-3600,))
            hit = db.execute('SELECT body FROM cache WHERE id=?', (digest,)).fetchone()
            if hit:
                return json.loads(hit[0])
            db.execute('DELETE FROM calls WHERE ts <= ?', (now-31*86400,))
            total, recent = db.execute('SELECT count(*),count(*) FILTER (WHERE ts>?) FROM calls',
                                       (now-60,)).fetchone()
            if total >= 200 or recent >= 10:
                raise HTTPException(429, 'Достигнут лимит поисковых запросов.')
            db.execute('INSERT INTO calls VALUES (?)', (now,))
        body = dict(offers=fetch(params, key), currency='RUB')
        with db:
            db.execute('INSERT OR REPLACE INTO cache VALUES (?,?,?)', (digest, time.time(), json.dumps(body)))
        return body
