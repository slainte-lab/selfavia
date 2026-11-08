"""Refresh the searchable airport directory from the Russian Aviasales data files."""
import argparse
from collections import defaultdict
import getpass
import json
import re
import secrets
from urllib.request import urlopen

import psycopg
from psycopg import sql
from psycopg.conninfo import make_conninfo

from .database import CONFIG

WRITER = CONFIG.with_name('catalog-writer.json')
SOURCE = 'https://api.travelpayouts.com/data/ru/{}.json'


def download(name):
    with urlopen(SOURCE.format(name), timeout=60) as response:
        return json.load(response)


def names(row):
    english = row.get('name_translations', {}).get('en') or ''
    return row.get('name') or english or row['code'], english


def build(cities, airports, countries):
    country_names = {row['code']: names(row)[0] for row in countries}
    by_city = defaultdict(list)
    for row in airports:
        if (row.get('iata_type') == 'airport' and row.get('flightable') is True
                and re.fullmatch('[A-Z]{3}', row['code'])):
            by_city[row['city_code']].append(row)

    city_rows, airport_rows = [], []
    for city in sorted(cities, key=lambda c: c['code']):
        code = city['code']
        members = by_city.pop(code, [])
        if not members:
            continue
        # Source city codes can be non-Latin; reserve a stable key in PostgreSQL
        # through the unique source-code mapping maintained across refreshes.
        label, english = names(city)
        country = country_names[city['country_code']]
        aliases = f'{label} | {english} | {code}'.casefold()
        city_rows.append((code, f'{label} — все аэропорты', country, aliases))
        for pos, airport in enumerate(sorted(members, key=lambda a: a['code'])):
            name, en = names(airport)
            iata = airport['code']
            airport_rows.append((iata, code, pos, f'{label} · {name} ({iata})',
                                 f'{aliases} | {name} | {en} | {iata}'.casefold()))
    if by_city or not city_rows or not airport_rows:
        raise ValueError('Incomplete city/airport directory')
    return city_rows, airport_rows


def provision():
    # Run once with the local administrator. Scheduled refreshes need only DML.
    password = getpass.getpass('Пароль postgres: ')
    with psycopg.connect(host='127.0.0.1', dbname='selfavia', user='postgres', password=password) as conn:
        conn.execute('ALTER TABLE catalog.city ADD COLUMN IF NOT EXISTS source_code text UNIQUE')
        if WRITER.exists():
            return
        role = 'selfavia_catalog_sync_' + secrets.token_hex(4)
        secret = secrets.token_urlsafe(32)
        conn.execute(sql.SQL('CREATE ROLE {} LOGIN PASSWORD {}').format(sql.Identifier(role), sql.Literal(secret)))
        for grant in ('CONNECT ON DATABASE selfavia', 'USAGE ON SCHEMA catalog',
                      'SELECT, INSERT, UPDATE, DELETE ON catalog.city, catalog.airport'):
            conn.execute(sql.SQL('GRANT '+grant+' TO {}').format(sql.Identifier(role)))
        dsn = make_conninfo(host='127.0.0.1', dbname='selfavia', user=role, password=secret)
        conn.commit()
        WRITER.write_text(json.dumps({'dsn': dsn}), encoding='utf8')


def refresh(cities, airports):
    dsn = json.loads(WRITER.read_text(encoding='utf8'))['dsn']
    with psycopg.connect(dsn) as conn:
        conn.execute('SELECT pg_advisory_xact_lock(923508)')
        # Reject unexpectedly small upstream snapshots before pruning local rows.
        old = conn.execute('SELECT (SELECT count(*) FROM catalog.city), (SELECT count(*) FROM catalog.airport)').fetchone()
        if len(cities) < old[0] * 0.9 or len(airports) < old[1] * 0.9:
            raise ValueError('Directory shrank by more than 10%; previous catalog retained')
        conn.execute('CREATE TEMP TABLE new_city(code text PRIMARY KEY,label text,country text,aliases text) ON COMMIT DROP')
        conn.execute('CREATE TEMP TABLE new_airport(iata text PRIMARY KEY,code text,pos integer,label text,aliases text) ON COMMIT DROP')
        for table, rows in [('new_city', cities), ('new_airport', airports)]:
            with conn.cursor().copy(sql.SQL('COPY {} FROM STDIN').format(sql.Identifier(table))) as copy:
                for row in rows:
                    copy.write_row(row)
        # Preserve identifiers of the original seed cities on the first refresh.
        conn.execute("""
            UPDATE catalog.city c SET source_code=m.code FROM (
                SELECT a.city_id,min(n.code) AS code FROM catalog.airport a
                JOIN new_airport n USING(iata) GROUP BY a.city_id HAVING count(DISTINCT n.code)=1
            ) m WHERE c.city_id=m.city_id AND c.source_code IS NULL
        """)
        conn.execute("""
            INSERT INTO catalog.city(city_id,source_code,label,country,aliases)
            SELECT (SELECT coalesce(max(city_id),0) FROM catalog.city)+row_number() OVER(ORDER BY n.code),
                   n.code,n.label,n.country,n.aliases FROM new_city n
            ON CONFLICT(source_code) DO UPDATE SET label=excluded.label,country=excluded.country,aliases=excluded.aliases
        """)
        conn.execute("""
            INSERT INTO catalog.airport(iata,city_id,position,label,aliases)
            SELECT n.iata,c.city_id,n.pos,n.label,n.aliases FROM new_airport n
            JOIN catalog.city c ON c.source_code=n.code
            ON CONFLICT(iata) DO UPDATE SET city_id=excluded.city_id,position=excluded.position,
                label=excluded.label,aliases=excluded.aliases
        """)
        conn.execute('DELETE FROM catalog.airport a WHERE NOT EXISTS (SELECT FROM new_airport n WHERE n.iata=a.iata)')
        conn.execute('DELETE FROM catalog.city c WHERE NOT EXISTS (SELECT FROM new_city n WHERE n.code=c.source_code)')


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--setup', action='store_true')
    args = parser.parse_args()
    rows = build(download('cities'), download('airports'), download('countries'))
    if args.setup:
        provision()
    refresh(*rows)
    print(f'Imported {len(rows[0])} cities and {len(rows[1])} airports.')


if __name__ == '__main__':
    main()
