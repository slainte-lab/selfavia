const legs = document.querySelector('#legs');
const type = document.querySelector('#type');
const message = document.querySelector('#message');
let nextId = 0;

function locationField(label) {
  const field = document.createElement('div');
  field.className = 'field';
  const id = `location-${nextId++}`;
  field.innerHTML = `<label for="${id}">${label}</label><input id="${id}" placeholder="Город или аэропорт" autocomplete="off" required><div class="suggestions" hidden></div>`;
  const input = field.querySelector('input');
  const suggestions = field.querySelector('.suggestions');
  let timer;
  let version = 0;
  input.addEventListener('input', () => {
    delete input.dataset.location;
    const current = ++version;
    clearTimeout(timer);
    suggestions.hidden = true;
    timer = setTimeout(async () => {
      try {
        const response = await fetch(`/api/locations?q=${encodeURIComponent(input.value)}`);
        if (!response.ok) throw new Error('catalog');
        const items = await response.json();
        if (current !== version) return;
        suggestions.replaceChildren();
        for (const item of items) {
          const button = document.createElement('button');
          button.type = 'button';
          const code = document.createElement('strong');
          code.textContent = item.id;
          button.append(code);
          const city = document.createElement('small');
          city.textContent = item.label;
          button.append(city);
          const country = document.createElement('small');
          country.textContent = item.country;
          button.append(country);
          button.addEventListener('click', () => {
            input.value = item.label;
            input.dataset.location = item.id;
            suggestions.hidden = true;
          });
          suggestions.append(button);
        }
        suggestions.hidden = items.length === 0;
      } catch {
        message.textContent = 'Не удалось загрузить справочник. Попробуйте ещё раз.';
      }
    }, 150);
  });
  field.addEventListener('keydown', event => {
    if (event.key === 'Escape') suggestions.hidden = true;
    if (['ArrowDown', 'ArrowUp'].includes(event.key)) {
      const options = [...suggestions.querySelectorAll('button')];
      if (!options.length || suggestions.hidden) return;
      event.preventDefault();
      const direction = event.key === 'ArrowDown' ? 1 : -1;
      const index = options.indexOf(document.activeElement);
      options[(index + direction + options.length) % options.length]?.focus();
    }
    if (event.key === 'Enter' && event.target === input && !suggestions.hidden) {
      event.preventDefault();
      suggestions.querySelector('button')?.click();
    }
  });
  field.addEventListener('focusout', event => {
    if (!field.contains(event.relatedTarget)) suggestions.hidden = true;
  });
  return field;
}

function addLeg() {
  if (legs.children.length >= 6) return;
  const row = document.createElement('div');
  row.className = 'leg';
  row.append(locationField('Откуда'), locationField('Куда'));
  const departure = dateField('Туда', () => {
    const previous = row.previousElementSibling?.querySelector('.date-field').dataset.value;
    return previous || dateKey(new Date());
  }, value => {
    const returnDate = row.querySelectorAll('.date-field')[1];
    if (returnDate && returnDate.dataset.value < value) returnDate.setDate('');
    let following = row.nextElementSibling;
    while (following) {
      const date = following.querySelector('.date-field');
      if (date.dataset.value < value) date.setDate('');
      following = following.nextElementSibling;
    }
  });
  row.append(departure);
  if (type.value === 'return') {
    row.classList.add('roundtrip');
    row.append(dateField('Обратно', () => departure.dataset.value || dateKey(new Date())));
  }
  if (type.value === 'multi') {
    const remove = document.createElement('button');
    remove.type = 'button'; remove.className = 'remove'; remove.textContent = '×';
    remove.setAttribute('aria-label', 'Удалить перелёт');
    remove.onclick = () => { if (legs.children.length > 2) { closePopup(); row.remove(); } };
    row.append(remove);
  }
  legs.append(row);
}

type.addEventListener('change', () => {
  closePopup();
  const existing = legs.firstElementChild;
  const locations = existing ? [...existing.querySelectorAll('input')].map(input => ({value:input.value, id:input.dataset.location})) : [];
  const dates = existing ? [...existing.querySelectorAll('.date-field')].map(field => field.dataset.value || '') : [];
  legs.replaceChildren();
  addLeg();
  const row = legs.firstElementChild;
  [...row.querySelectorAll('input')].forEach((input,index) => {
    input.value = locations[index]?.value || '';
    if (locations[index]?.id) input.dataset.location = locations[index].id;
  });
  [...row.querySelectorAll('.date-field')].forEach((field,index) => field.setDate(dates[index] || ''));
  if (type.value === 'multi') addLeg();
  document.querySelector('#add').hidden = type.value !== 'multi';
  document.querySelector('#selection').hidden = true;
});
document.querySelector('#add').addEventListener('click', addLeg);
document.querySelector('#search').addEventListener('submit', event => {
  event.preventDefault();
  message.textContent = '';
  clearFieldErrors();
  document.querySelector('#selection').hidden = true;
  const route = [];
  let previousDate = dateKey(new Date());
  for (const row of legs.children) {
    const [origin,destination] = row.querySelectorAll('input');
    const dates = [...row.querySelectorAll('.date-field')].map(field => field.dataset.value);
    if (!origin.dataset.location || !destination.dataset.location || origin.dataset.location === destination.dataset.location) {
      if (!origin.dataset.location) fieldError(origin, 'Укажите город вылета');
      else if (!destination.dataset.location) fieldError(destination, 'Укажите город прибытия');
      else fieldError(destination, 'Выберите другой город прибытия');
      return;
    }
    for (const [index, date] of dates.entries()) {
      if (!date || date < previousDate) {
        fieldError(row.querySelectorAll('.date-toggle')[index], !date ? 'Укажите дату перелёта' : 'Дата раньше предыдущего перелёта');
        return;
      }
      previousDate = date;
    }
    route.push(`${origin.value} → ${destination.value} · ${dates[0]}`);
    if (type.value === 'return') route.push(`${destination.value} → ${origin.value} · ${dates[1]}`);
  }
  const summary = document.querySelector('#summary'); summary.replaceChildren();
  for (const line of route) { const p = document.createElement('p'); p.textContent = line; summary.append(p); }
  const passengers = document.createElement('p');
  passengers.textContent = `Взрослых: ${passengerState.adults}, детей: ${passengerState.ages.length}. Эконом.`;
  summary.append(passengers);
  document.querySelector('#selection').hidden = false;
});
addLeg();


function clearFieldErrors() {
  document.querySelectorAll('.field-error').forEach(error => error.remove());
  document.querySelectorAll('[aria-invalid]').forEach(input => {
    input.removeAttribute('aria-invalid');
    input.removeAttribute('aria-describedby');
  });
}

function fieldError(input, text) {
  const error = document.createElement('p');
  error.className = 'field-error';
  error.id = `error-${nextId++}`;
  error.textContent = `! ${text}`;
  input.closest('.field').append(error);
  input.setAttribute('aria-invalid', 'true');
  input.setAttribute('aria-describedby', error.id);
  input.focus();
}

