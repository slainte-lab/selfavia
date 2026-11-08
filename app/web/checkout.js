function checkoutElement(tag, text) {
  const element = document.createElement(tag);
  element.textContent = text;
  return element;
}

function checkoutField(labelText, name, type = 'text') {
  const label = checkoutElement('label', labelText);
  const input = document.createElement('input');
  input.type = type;
  input.required = true;
  input.name = name;
  input.maxLength = type === 'email' ? 254 : 100;
  label.append(input);
  return label;
}

async function showCheckout(summary, route, itinerary) {
  const panel = document.createElement('section');
  panel.className = 'checkout';
  summary.append(panel);
  try {
    const response = await fetch('/api/orders/options');
    if (!response.ok) throw new Error();
    const options = await response.json();
    const visa = checkoutElement('button', 'Бронь для визы' + (options.fee_rub ? ' · ' + rubles.format(options.fee_rub) + ' за заказ' : ''));
    visa.type = 'button';
    const buy = checkoutElement('a', 'Купить на Авиасейлс');
    buy.href = options.buy_url;
    buy.target = '_blank';
    buy.rel = 'noopener noreferrer';
    panel.append(visa, buy);
    visa.onclick = () => {
      visa.disabled = true;
      const form = document.createElement('form');
      form.append(checkoutField('Email', 'email', 'email'));
      const count = route.adults + route.ages.length;
      for (let index = 0; index < count; index++) {
        const passenger = document.createElement('fieldset');
        passenger.append(checkoutElement('legend', 'Пассажир ' + (index + 1)),
          checkoutField('Имя', 'first_name'), checkoutField('Фамилия', 'last_name'));
        form.append(passenger);
      }
      const save = checkoutElement('button', 'Сохранить черновик');
      const notice = checkoutElement('p', '');
      notice.setAttribute('role', 'status');
      form.append(save, notice);
      panel.append(form);
      form.querySelector('input').focus();
      form.onsubmit = async event => {
        event.preventDefault();
        if (save.disabled) return;
        save.disabled = true;
        const values = new FormData(form);
        const passengers = values.getAll('first_name').map((first_name, i) =>
          ({first_name, last_name:values.getAll('last_name')[i]}));
        try {
          const result = await fetch('/api/orders/drafts', {method:'POST',
            headers:{'Content-Type':'application/json'}, body:JSON.stringify({
              route, choices:itinerary.map(offer=>offer.choice), passengers, email:values.get('email')
            })});
          const body = await result.json();
          if (!result.ok) throw new Error(typeof body.detail === 'string' ? body.detail : 'Проверьте данные заказа.');
          location.assign('/#order=' + body.token);
        } catch (error) {
          notice.textContent = error.message;
          save.disabled = false;
        }
      };
    };
  } catch {
    panel.textContent = 'Не удалось загрузить варианты оформления.';
  }
}

async function openOrderLink() {
  const match = /^#order=([\w-]{43})$/.exec(location.hash);
  if (!match) return;
  const section = document.querySelector('#selection');
  const title = document.querySelector('#results-title');
  const summary = document.querySelector('#summary');
  section.hidden = false;
  title.textContent = 'Черновик заказа';
  summary.textContent = '';
  section.scrollIntoView();
  try {
    const result = await fetch('/api/orders/drafts/current', {
      headers:{Authorization:'Bearer ' + match[1]}, cache:'no-store'});
    if (!result.ok) throw new Error(result.status === 404 ? 'Заказ не найден.' : 'Не удалось открыть заказ.');
    const draft = await result.json();
    if (location.hash !== match[0]) return;
    for (const option of draft.itinerary) {
      const details = checkoutElement('p', flightDescription(option));
      details.className = 'flight-details';
      summary.append(details);
    }
    summary.append(checkoutElement('p', draft.passengers.map(p=>p.first_name+' '+p.last_name).join(', ')),
      checkoutElement('p', draft.email));
    if (draft.fee_rub) summary.append(checkoutElement('p', 'Стоимость услуги за заказ: '+rubles.format(draft.fee_rub)));
    summary.append(checkoutElement('p','Сохраните адрес этой страницы для доступа к заказу. Оплата и бронирование ещё не выполнены.'));
  } catch (error) {
    summary.textContent = error.message;
  }
}

window.addEventListener('DOMContentLoaded', openOrderLink);
window.addEventListener('hashchange', openOrderLink);
