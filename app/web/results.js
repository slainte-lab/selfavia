const byId = id => document.getElementById(id);
const node = (tag, content, cls) => {
  const element = document.createElement(tag);
  if (content != null) element.textContent = content;
  if (cls) element.className = cls;
  return element;
};
const params = new URLSearchParams(location.search);
const dates = new Intl.DateTimeFormat('ru-RU', {day:'numeric', month:'long', year:'numeric'});
const priceOf = offer => offer.price == null ? 'Цена не указана' : rubles.format(offer.price);
const airlines = offer => [...new Set(offer.flights.map(f => f.airline || f.number || 'Авиакомпания'))];
const stops = offer => Math.min(offer.flights.length - 1, 2);
let route, places, controller, offers = [];
const responses = new Map();
const chosen = {stops:new Set(), carriers:new Set()};

function carrierMark(flight) {
  const code = (flight.number || '').match(/^([A-Z0-9]{2})\s*\d/i)?.[1]?.toUpperCase();
  const mark = node('span', code || flight.airline?.slice(0,2), 'mark');
  if (code) {
    const image = new Image();
    image.alt = '';
    image.onload = () => mark.replaceChildren(image);
    image.src = 'https://www.gstatic.com/flights/airline_logos/70px/' + code + '.png';
  }
  return mark;
}

function card(offer, onChoose) {
  const first = offer.flights[0], last = offer.flights.at(-1);
  const item = node('div', null, 'offer');
  const info = node('div', null, 'flight-info');
  const carrier = node('div', null, 'carrier');
  carrier.append(carrierMark(first), node('span', airlines(offer).join(' · ')));
  const timeline = node('div', null, 'timeline');
  const points = [[first.departure, first.origin], [last.arrival, last.destination]];
  for (const [index, [time, airport]] of points.entries()) {
    if (index) {
      const via = offer.flights.slice(0,-1).map(f => f.destination).join(' · ');
      const path = node('div', null, 'path');
      const minutes = offer.duration;
      path.append(node('span', minutes == null ? '' : Math.floor(minutes/60) + ' ч ' + minutes%60 + ' мин'),
        node('i'), node('small', via || 'Прямой'));
      timeline.append(path);
    }
    const point = node('div', null, 'timepoint');
    point.append(node('b', time.slice(11,16)), node('small', airport));
    if (index && time.slice(0,10) !== first.departure.slice(0,10))
      point.append(node('small', dates.format(new Date(time.slice(0,10)+'T12:00:00'))));
    timeline.append(point);
  }
  const segments = node('details', null, 'segments');
  segments.append(node('summary', 'Подробности перелёта'), node('p', flightDescription(offer)));
  info.append(carrier, timeline, segments);
  const fare = node('div', null, 'fare');
  fare.append(node('strong', priceOf(offer)));
  if (onChoose) {
    const select = node('button', 'Выбрать рейс');
    select.onclick = onChoose;
    fare.append(select);
  }
  item.append(info, fare);
  return item;
}

function filterGroup(title, values, selected, label) {
  const group = node('fieldset');
  group.append(node('legend', title));
  for (const value of values) {
    const row = node('label');
    const box = node('input');
    box.type = 'checkbox';
    box.onchange = () => {
      if (box.checked) selected.add(value); else selected.delete(value);
      renderOffers();
    };
    row.append(box, document.createTextNode(label(value)));
    group.append(row);
  }
  return group;
}
function advance(selected) {
  history.pushState({selected}, '');
  display();
}
function renderOffers() {
  const selected = history.state?.selected || [];
  const list = offers.filter(o => (!chosen.stops.size || chosen.stops.has(stops(o))) &&
    (!chosen.carriers.size || airlines(o).some(a => chosen.carriers.has(a))));
  const sort = byId('sort').value;
  if (sort !== 'best') list.sort((a,b) => (a[sort] ?? Infinity) - (b[sort] ?? Infinity));
  byId('count').textContent = 'Варианты · ' + list.length;
  const cards = byId('cards');
  cards.replaceChildren();
  for (const o of list) {
    const available = selected.length + 1 === route.legs.length || o.token;
    cards.append(card(o, available ? () => advance([...selected,o]) : null));
  }
  if (!list.length) cards.append(node('p', offers.length ? 'По выбранным фильтрам рейсов нет.' : 'На эти даты рейсы не найдены.'));
}

async function display() {
  controller?.abort();
  const request = new AbortController();
  controller = request;
  for (const id of ['loading','layout','detail']) byId(id).hidden = true;
  byId('notice').replaceChildren();
  window.scrollTo(0,0);
  const selected = history.state?.selected || [];
  if (selected.length === route.legs.length) {
    byId('heading').textContent = 'Ваш маршрут';
    byId('context').textContent = '';
    byId('detail').hidden = false;
    byId('itinerary').replaceChildren(...selected.map(o => card(o, null)));
    byId('purchase').replaceChildren();
    showCheckout(byId('purchase'), route, selected);
    return;
  }
  const leg = route.legs[selected.length];
  byId('heading').textContent = (places[leg.origin] || leg.origin) + ' → ' + (places[leg.destination] || leg.destination);
  byId('context').textContent = [dates.format(new Date(leg.date+'T12:00:00')), 'Пассажиры: '+(route.adults+route.ages.length),
    route.legs.length > 1 ? 'Перелёт '+(selected.length+1)+' из '+route.legs.length : 'В одну сторону'].join(' · ');
  byId('loading').hidden = false;
  const tokens = selected.map(o => o.token);
  const key = JSON.stringify(tokens);
  try {
    let hit = responses.get(key);
    if (!hit || Date.now()-hit.time >= 3600000) {
      const response = await fetch('/api/flights/search', {method:'POST', signal:request.signal,
        headers:{'Content-Type':'application/json'}, body:JSON.stringify({...route,tokens})});
      const data = await response.json();
      if (!response.ok) throw new Error(typeof data.detail === 'string' ? data.detail : 'Проверьте маршрут и даты.');
      hit = {offers:data.offers,time:Date.now()};
      responses.set(key,hit);
    }
    if (request.signal.aborted) return;
    offers = hit.offers;
    chosen.stops.clear();
    chosen.carriers.clear();
    byId('sort').value = 'best';
    byId('groups').replaceChildren(
      filterGroup('Пересадки', [...new Set(offers.map(stops))].sort(), chosen.stops,
        value => ['Прямой рейс','1 пересадка','2 и более'][value]),
      filterGroup('Авиакомпании', [...new Set(offers.flatMap(airlines))].sort(), chosen.carriers, value => value));
    byId('filters').open = matchMedia('(min-width: 761px)').matches;
    byId('layout').hidden = false;
    renderOffers();
  } catch (error) {
    if (!request.signal.aborted) {
      const retry = node('button','Повторить поиск');
      retry.onclick = display;
      byId('notice').append(node('span',error instanceof TypeError ? 'Не удалось подключиться к поиску.' : error.message), retry);
    }
  } finally {
    if (!request.signal.aborted) byId('loading').hidden = true;
  }
}
byId('sort').onchange = renderOffers;
byId('back').onclick = () => history.back();
window.addEventListener('popstate', display);
try {
  route = JSON.parse(params.get('route'));
  places = JSON.parse(params.get('places') || '{}');
  if (!route?.legs?.length) throw new Error();
  display();
  fetch('/api/orders/options').then(r => r.json()).then(options => {
    if (options.fee_rub) byId('fee').textContent = rubles.format(options.fee_rub) + ' за весь заказ';
  }).catch(() => {});
} catch {
  byId('notice').textContent = 'Укажите маршрут на странице поиска.';
}
