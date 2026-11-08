"""Run interactively once on the laptop: python -m app.catalog.setup_local"""
import getpass
import json
import secrets

import psycopg
from psycopg import sql
from psycopg.conninfo import make_conninfo

from .database import CONFIG, migrate
from .service import LOCATIONS


def main():
    local = dict(host='127.0.0.1', port=5432, user='postgres', connect_timeout=5)
    password = getpass.getpass('Пароль локального пользователя postgres: ')
    with psycopg.connect(**local, dbname='postgres', password=password, autocommit=True) as admin:
        if not admin.execute("SELECT 1 FROM pg_database WHERE datname='selfavia'").fetchone():
            admin.execute("CREATE DATABASE selfavia ENCODING 'UTF8' TEMPLATE template0")
    with psycopg.connect(**local, dbname='selfavia', password=password) as admin:
        migrate(admin, LOCATIONS)
        if not CONFIG.exists():
            role = 'selfavia_reader_' + secrets.token_hex(4)
            secret = secrets.token_urlsafe(32)
            admin.execute(sql.SQL('CREATE ROLE {} LOGIN PASSWORD {}').format(
                sql.Identifier(role), sql.Literal(secret)))
            for grant in ('GRANT CONNECT ON DATABASE selfavia', 'GRANT USAGE ON SCHEMA catalog',
                          'GRANT SELECT ON catalog.city, catalog.airport'):
                admin.execute(sql.SQL(grant + ' TO {}').format(sql.Identifier(role)))
            dsn = make_conninfo(host=local['host'], port=5432, dbname='selfavia', user=role, password=secret)
            CONFIG.parent.mkdir(exist_ok=True)
            temp = CONFIG.with_suffix('.tmp')
            temp.write_text(json.dumps({'dsn': dsn}), encoding='utf8')
            admin.commit()
            temp.replace(CONFIG)
    print('Справочник Selfavia подключён к PostgreSQL.')


if __name__ == '__main__':
    main()
