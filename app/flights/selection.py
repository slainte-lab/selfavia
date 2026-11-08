"""Read the selected itinerary from the same snapshots shown by flight search."""
import hashlib
import json
import sqlite3
import time
from contextlib import closing

from fastapi import HTTPException

from .key import RUNTIME
from .models import Search


def cache_id(parameters):
    return hashlib.sha256(json.dumps(parameters, sort_keys=True).encode()).hexdigest()


def resolve_choices(route: Search, choices: list[str]):
    if route.tokens or len(choices) != len(route.legs):
        raise HTTPException(422, 'Выберите рейс для каждого участка.')
    path = RUNTIME / 'flights.sqlite3'
    expired = 'Предложение устарело. Повторите поиск.'
    if not path.exists():
        raise HTTPException(409, expired)
    itinerary, tokens = [], []
    with closing(sqlite3.connect(path)) as db:
        for step, choice in enumerate(choices):
            params = route.model_copy(update={'tokens':tokens}).parameters()
            row = db.execute('SELECT body FROM cache WHERE id=? AND ts>?',
                             (cache_id(params), time.time()-3600)).fetchone()
            if not row:
                raise HTTPException(409, expired)
            offers = json.loads(row[0])['offers']
            offer = next((item for item in offers if cache_id(item) == choice), None)
            if offer is None:
                raise HTTPException(409, expired)
            if step < len(choices)-1 and not offer.get('token'):
                raise HTTPException(422, 'Для рейса нет продолжения маршрута.')
            tokens.append(offer.get('token'))
            itinerary.append({k:offer[k] for k in ('price','duration','flights')})
    return itinerary
