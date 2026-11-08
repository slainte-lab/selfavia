let currentFlightRequest;
const rubles = new Intl.NumberFormat('ru-RU', {style:'currency', currency:'RUB', maximumFractionDigits:0});

function flightDescription(offer) {
  return offer.flights.map(f =>
    `${f.origin} → ${f.destination} · ${f.departure} — ${f.arrival} · ${f.number || f.airline || ''}`
  ).join('\n');
}

async function startFlightSearch(route, selected = []) {
  currentFlightRequest?.abort();
  const controller = new AbortController();
  currentFlightRequest = controller;
  const section = document.querySelector('#selection');
  const title = document.querySelector('#results-title');
  const summary = document.querySelector('#summary');
  const status = document.querySelector('#message');
  section.hidden = true;
  status.textContent = 'Ищем рейсы…';
  try {
    const response = await fetch('/api/flights/search', {
      method:'POST', headers:{'Content-Type':'application/json'}, signal:controller.signal,
      body:JSON.stringify({...route, tokens:selected.map(offer => offer.token)})
    });
    const data = await response.json();
    if (controller.signal.aborted) return;
    if (!response.ok) throw new Error(typeof data.detail === 'string' ? data.detail : 'Проверьте маршрут и даты.');
    status.textContent = '';
    const leg = route.legs[selected.length];
    title.textContent = `${leg.origin} → ${leg.destination} · ${leg.date}`;
    summary.replaceChildren();
    if (!data.offers.length) summary.textContent = 'На эти даты рейсы не найдены.';
    for (const offer of data.offers) {
      const card = document.createElement('div');
      card.className = 'flight-option';
      const description = document.createElement('p');
      description.textContent = flightDescription(offer);
      const price = document.createElement('strong');
      price.textContent = offer.price == null ? 'Цена не указана' : rubles.format(offer.price);
      card.append(description, price);
      const lastLeg = selected.length + 1 === route.legs.length;
      if (lastLeg || offer.token) {
        const choose = document.createElement('button');
        choose.type = 'button';
        choose.textContent = lastLeg ? 'Детали маршрута' : 'Выбрать рейс';
        choose.onclick = () => {
          const itinerary = [...selected, offer];
          if (!lastLeg) return startFlightSearch(route, itinerary);
          title.textContent = 'Ваш маршрут';
          summary.replaceChildren();
          for (const option of itinerary) {
            const details = document.createElement('p');
            details.className = 'flight-details';
            details.textContent = flightDescription(option);
            summary.append(details);
          }
          summary.append(price.cloneNode(true));
          showCheckout(summary, route, itinerary);
          section.scrollIntoView({block:'start'});
        };
        card.append(choose);
      }
      summary.append(card);
    }
    section.hidden = false;
    section.scrollIntoView({block:'start'});
  } catch (error) {
    if (controller.signal.aborted) return;
    status.textContent = error instanceof TypeError ? 'Не удалось подключиться к поиску.' : error.message;
  }
}

document.querySelector('#search').addEventListener('change', () => {
  currentFlightRequest?.abort();
  document.querySelector('#message').textContent = '';
});
