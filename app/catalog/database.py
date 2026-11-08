"""PostgreSQL catalog storage and one-time import of the bundled directory."""
import json
import os
from pathlib import Path

CONFIG = Path(__file__).resolve().parents[2] / 'runtime' / 'catalog-connection.json'


def connection_string():
    if 'SELFAVIA_DATABASE_URL' in os.environ:
        return os.environ['SELFAVIA_DATABASE_URL']
    if CONFIG.exists():
        return json.loads(CONFIG.read_text(encoding='utf8'))['dsn']
    return None


def migrate(conn, rows):
    with conn.transaction():
        conn.execute('CREATE SCHEMA IF NOT EXISTS catalog')
        conn.execute('CREATE TABLE IF NOT EXISTS catalog.migration (version integer PRIMARY KEY)')
        conn.execute('LOCK TABLE catalog.migration IN EXCLUSIVE MODE')
        if conn.execute('SELECT 1 FROM catalog.migration WHERE version=1').fetchone():
            return
        conn.execute("""
            CREATE TABLE catalog.city (
                city_id integer PRIMARY KEY, label text NOT NULL,
                country text NOT NULL, aliases text NOT NULL
            );
            CREATE TABLE catalog.airport (
                iata varchar(3) PRIMARY KEY CHECK (iata ~ '^[A-Z]{3}$'),
                city_id integer NOT NULL REFERENCES catalog.city,
                position integer NOT NULL, label text NOT NULL, aliases text NOT NULL
            );
            CREATE INDEX airport_city ON catalog.airport(city_id)
        """)
        owner = {}
        for pos, item in enumerate(rows):
            if item['kind'] == 'city':
                conn.execute('INSERT INTO catalog.city VALUES (%s,%s,%s,%s)',
                             (pos, item['label'], item['country'], item['search'].casefold()))
                for code in item['id'].split(','):
                    owner[code] = pos
        for pos, item in enumerate(rows):
            if item['kind'] == 'airport':
                conn.execute('INSERT INTO catalog.airport VALUES (%s,%s,%s,%s,%s)',
                             (item['id'], owner[item['id']], pos, item['label'], item['search'].casefold()))
        conn.execute('INSERT INTO catalog.migration VALUES (1)')


def search(dsn, variants):
    import psycopg
    from psycopg.rows import dict_row

    with psycopg.connect(dsn, row_factory=dict_row, connect_timeout=5) as conn:
        return conn.execute("""
            WITH locations AS (
                SELECT c.city_id AS grp, -1 AS pos, string_agg(a.iata, ',' ORDER BY a.position) AS id,
                       c.label, c.country, c.aliases, 'city' AS kind
                FROM catalog.city c JOIN catalog.airport a USING(city_id)
                GROUP BY c.city_id
                UNION ALL
                SELECT c.city_id, a.position, a.iata, a.label, c.country, a.aliases, 'airport'
                FROM catalog.airport a JOIN catalog.city c USING(city_id)
            )
            SELECT id,label,country,kind FROM locations
            WHERE EXISTS (SELECT FROM unnest(%s::text[]) q
                          WHERE strpos(aliases || ' ' || lower(id), q) > 0)
            ORDER BY CASE WHEN lower(id)=ANY(%s::text[]) THEN 0
                          WHEN EXISTS (SELECT FROM unnest(%s::text[]) q WHERE strpos(' | ' || aliases || ' | ', ' | ' || q || ' | ') > 0) THEN 1
                          WHEN EXISTS (SELECT FROM unnest(%s::text[]) q WHERE strpos(' | ' || aliases, ' | ' || q) > 0) THEN 2
                          ELSE 3 END, grp,pos LIMIT 12
        """, (variants, variants, variants, variants)).fetchall()
