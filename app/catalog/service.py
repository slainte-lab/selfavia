import json
from pathlib import Path

from .database import connection_string, search

LOCATIONS = json.loads(Path(__file__).with_name('locations.json').read_text(encoding='utf-8'))
KEYBOARD = str.maketrans('qwertyuiop[]asdfghjkl;\'zxcvbnm,.', 'йцукенгшщзхъфывапролджэячсмитьбю')


def suggest(query: str) -> list[dict]:
    query = query.strip().casefold()
    if len(query) < 2:
        return []
    variants = [query, query.translate(KEYBOARD)]
    dsn = connection_string()
    if dsn:
        return search(dsn, variants)
    return [
        {key: value for key, value in location.items() if key != 'search'}
        for location in LOCATIONS
        if any(value in (location['search'] + ' ' + location['id']).casefold() for value in variants)
    ][:12]
