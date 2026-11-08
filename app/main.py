from pathlib import Path

from fastapi import FastAPI, Query
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from app.catalog.service import suggest
from app.flights.service import router as flights_router

from app.orders.service import router as orders_router

app = FastAPI(title='Selfavia')
app.include_router(flights_router)
app.include_router(orders_router)
WEB = Path(__file__).parent / 'web'
app.mount('/static', StaticFiles(directory=WEB), name='static')


@app.get('/')
def home():
    return FileResponse(WEB / 'index.html')


@app.get('/api/locations')
def locations(q: str = Query('', max_length=100)):
    return suggest(q)


@app.get('/health')
def health():
    return {'status': 'ok'}
