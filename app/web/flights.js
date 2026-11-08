const rubles = new Intl.NumberFormat('ru-RU', {style:'currency', currency:'RUB', maximumFractionDigits:0});

function flightDescription(offer) {
  return offer.flights.map(f =>
    `${f.origin} → ${f.destination} · ${f.departure} — ${f.arrival} · ${f.number || f.airline || ''}`
  ).join('\n');
}

function startFlightSearch(route) {
  const places = Object.fromEntries(
    [...document.querySelectorAll('#legs input[data-location]')].map(input =>
      [input.dataset.location, input.value.split(' — ')[0]])
  );
  const params = new URLSearchParams({route: JSON.stringify(route), places: JSON.stringify(places)});
  location.assign('/static/results.html?' + params);
}
