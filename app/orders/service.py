import hashlib
import json
import os
import secrets
from typing import Annotated
from urllib.parse import urlsplit

import psycopg
from psycopg.rows import dict_row
from psycopg.types.json import Jsonb
from fastapi import APIRouter, Header, HTTPException, Response
from pydantic import BaseModel, Field, StringConstraints

from app.flights.models import Search
from app.flights.selection import resolve_choices
from .setup_local import CONFIG

router = APIRouter(prefix='/api/orders')
Name = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=100)]


class Passenger(BaseModel):
    first_name: Name
    last_name: Name


class Draft(BaseModel):
    route: Search
    choices: list[Annotated[str, Field(pattern=r"^[a-f0-9]{64}$")]] = Field(min_length=1, max_length=6)
    passengers: list[Passenger] = Field(min_length=1, max_length=9)
    email: str = Field(min_length=3, max_length=254, pattern=r'^[^\s@]+@[^\s@]+\.[^\s@]+$')


def connect():
    dsn = os.getenv('SELFAVIA_ORDERS_DSN')
    if not dsn and CONFIG.exists():
        dsn = json.loads(CONFIG.read_text(encoding='utf8'))['dsn']
    if not dsn:
        raise HTTPException(503, 'Оформление временно недоступно.')
    return psycopg.connect(dsn, row_factory=dict_row, connect_timeout=5)


@router.get('/options')
def options():
    path = CONFIG.with_name('checkout.json')
    config = json.loads(path.read_text(encoding='utf8')) if path.exists() else {}
    fee = config.get('fee_rub')
    link = config.get('aviasales_url', '')
    return {'fee_rub':fee if type(fee) is int and fee > 0 else None,
            'buy_url':link if urlsplit(link).scheme == 'https' else 'https://www.aviasales.ru/'}


@router.post('/drafts',status_code=201)
def create(draft: Draft, response: Response):
    if len(draft.passengers) != draft.route.adults + len(draft.route.ages):
        raise HTTPException(422, 'Проверьте количество пассажиров.')
    itinerary = resolve_choices(draft.route, draft.choices)
    token = secrets.token_urlsafe(32)
    with connect() as conn:
        conn.execute('INSERT INTO orders.draft(access_hash,email,passengers,itinerary,route,fee_rub) VALUES (%s,%s,%s,%s,%s,%s)',
                     (hashlib.sha256(token.encode()).hexdigest(), draft.email,
                      Jsonb([p.model_dump() for p in draft.passengers]), Jsonb(itinerary),
                      Jsonb(draft.route.model_dump(mode='json')), options()['fee_rub']))
    response.headers['Cache-Control'] = 'no-store'
    return {'token':token}


@router.get('/drafts/current')
def read(response: Response, authorization: str = Header(default='',max_length=200)):
    token = authorization.removeprefix('Bearer ')
    if not token or token == authorization:
        raise HTTPException(404,'Заказ не найден.')
    with connect() as conn:
        row = conn.execute('SELECT email,passengers,itinerary,fee_rub FROM orders.draft WHERE access_hash=%s',
                           (hashlib.sha256(token.encode()).hexdigest(),)).fetchone()
    if not row:
        raise HTTPException(404,'Заказ не найден.')
    response.headers['Cache-Control'] = 'no-store'
    return row
