"""Provision local draft storage and a dedicated application role."""
import getpass
import json
import secrets
from pathlib import Path

import psycopg
from psycopg import sql
from psycopg.conninfo import make_conninfo

CONFIG = Path(__file__).resolve().parents[2] / 'runtime' / 'orders-connection.json'


def main():
    password = getpass.getpass('Пароль postgres: ')
    with psycopg.connect(host='127.0.0.1', dbname='selfavia', user='postgres', password=password) as conn:
        conn.execute('CREATE SCHEMA IF NOT EXISTS orders')
        conn.execute("""CREATE TABLE IF NOT EXISTS orders.draft (
            access_hash text PRIMARY KEY, created_at timestamptz NOT NULL DEFAULT now(),
            email text NOT NULL, passengers jsonb NOT NULL, itinerary jsonb NOT NULL,
            route jsonb NOT NULL, fee_rub integer CHECK(fee_rub>0)
        )""")
        if CONFIG.exists():
            return
        role, secret = 'selfavia_orders_'+secrets.token_hex(4), secrets.token_urlsafe(32)
        conn.execute(sql.SQL('CREATE ROLE {} LOGIN PASSWORD {}').format(sql.Identifier(role),sql.Literal(secret)))
        for grant in ('CONNECT ON DATABASE selfavia','USAGE ON SCHEMA orders','SELECT, INSERT ON orders.draft'):
            conn.execute(sql.SQL('GRANT '+grant+' TO {}').format(sql.Identifier(role)))
        dsn = make_conninfo(host='127.0.0.1', dbname='selfavia', user=role, password=secret)
        CONFIG.parent.mkdir(exist_ok=True)
        tmp = CONFIG.with_suffix('.tmp')
        tmp.write_text(json.dumps({'dsn':dsn}), encoding='utf8')
        conn.commit()
        tmp.replace(CONFIG)


if __name__ == '__main__':
    main()
