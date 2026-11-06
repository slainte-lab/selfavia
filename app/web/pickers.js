const passengerState = { adults: 1, ages: [] };
let activePopup;
let popupTrigger;

function closePopup() {
  activePopup?.remove();
  popupTrigger?.setAttribute('aria-expanded', 'false');
  activePopup = null;
}

function openPopup(trigger, className) {
  closePopup();
  popupTrigger = trigger;
  trigger.setAttribute('aria-expanded', 'true');
  const popup = document.createElement('div');
  popup.className = `picker ${className}`;
  popup.setAttribute('role', 'dialog');
  popup.setAttribute('aria-label', className === 'calendar' ? 'Выбор даты' : 'Пассажиры');
  trigger.closest('.field').append(popup);
  activePopup = popup;
  return popup;
}

document.addEventListener('click', event => {
  if (activePopup && !event.composedPath().includes(activePopup) && !event.composedPath().includes(popupTrigger)) closePopup();
});
document.addEventListener('keydown', event => {
  if (event.key === 'Escape') {
    closePopup();
    popupTrigger?.focus();
  }
});

function dateKey(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function dateField(label, minimum, onSelect) {
  const field = document.createElement('div');
  field.className = 'field date-field';
  const caption = document.createElement('label');
  caption.textContent = label;
  const trigger = document.createElement('button');
  trigger.type = 'button';
  trigger.className = 'date-toggle';
  trigger.textContent = 'Выберите дату';
  trigger.setAttribute('aria-label', label);
  trigger.setAttribute('aria-expanded', 'false');
  field.append(caption, trigger);
  field.setDate = value => {
    field.dataset.value = value;
    trigger.textContent = value ? new Date(value + 'T12:00:00').toLocaleDateString('ru-RU', {day:'numeric', month:'short'}) : 'Выберите дату';
  };
  trigger.addEventListener('click', () => {
    const popup = openPopup(trigger, 'calendar');
    const min = minimum();
    let month = new Date((field.dataset.value || min) + 'T12:00:00');
    month.setDate(1);
    function render() {
      popup.replaceChildren();
      const navigation = document.createElement('div');
      navigation.className = 'calendar-nav';
      for (const [offset, label] of [[-1, 'Предыдущий месяц'], [1, 'Следующий месяц']]) {
        const button = document.createElement('button');
        button.type = 'button';
        button.textContent = offset < 0 ? '‹' : '›';
        button.setAttribute('aria-label', label);
        button.disabled = offset < 0 && dateKey(month).slice(0,7) <= min.slice(0,7);
        button.onclick = () => { month.setMonth(month.getMonth() + offset); render(); };
        navigation.append(button);
      }
      popup.append(navigation);
      const months = document.createElement('div');
      months.className = 'months';
      for (let offset = 0; offset < 2; offset++) {
        const current = new Date(month.getFullYear(), month.getMonth() + offset, 1);
        const section = document.createElement('section');
        const heading = document.createElement('h3');
        heading.textContent = current.toLocaleDateString('ru-RU', {month:'long', year:'numeric'});
        section.append(heading);
        const grid = document.createElement('div');
        grid.className = 'days';
        for (const name of ['Пн','Вт','Ср','Чт','Пт','Сб','Вс']) {
          const weekday = document.createElement('span'); weekday.textContent = name; grid.append(weekday);
        }
        for (let i = 0; i < (current.getDay() + 6) % 7; i++) grid.append(document.createElement('span'));
        const count = new Date(current.getFullYear(), current.getMonth()+1,0).getDate();
        for (let day = 1; day <= count; day++) {
          const value = dateKey(new Date(current.getFullYear(), current.getMonth(), day));
          const button = document.createElement('button');
          button.type = 'button'; button.textContent = day;
          button.setAttribute('aria-label', value);
          button.disabled = value < min;
          button.classList.toggle('selected', value === field.dataset.value);
          button.onclick = () => { field.setDate(value); closePopup(); trigger.focus(); onSelect?.(value); };
          grid.append(button);
        }
        section.append(grid); months.append(section);
      }
      popup.append(months);
    }
    render();
  });
  return field;
}

const travellerToggle = document.querySelector('#traveller-toggle');
travellerToggle.onclick = () => {
  const popup = openPopup(travellerToggle, 'passengers');
  const draft = { adults: passengerState.adults, ages: [...passengerState.ages] };
  function render() {
    popup.replaceChildren();
    const heading = document.createElement('h3'); heading.textContent = 'Пассажиры · Эконом'; popup.append(heading);
    for (const group of ['adults','children']) {
      const row = document.createElement('div'); row.className = 'counter';
      const text = document.createElement('span'); text.textContent = group === 'adults' ? 'Взрослые · 18+' : 'Дети · 0–17 лет'; row.append(text);
      const count = group === 'adults' ? draft.adults : draft.ages.length;
      for (const delta of [-1,1]) {
        if (delta === 1) { const number = document.createElement('strong'); number.textContent = count; row.append(number); }
        const button = document.createElement('button'); button.type = 'button'; button.textContent = delta < 0 ? '−' : '+';
        button.setAttribute('aria-label', `${delta < 0 ? 'Уменьшить' : 'Увеличить'} ${group === 'adults' ? 'взрослых' : 'детей'}`);
        button.disabled = delta < 0 ? count <= (group === 'adults' ? 1 : 0) : draft.adults + draft.ages.length >= 9;
        button.onclick = () => {
          if (group === 'adults') draft.adults += delta;
          else if (delta > 0) draft.ages.push('');
          else draft.ages.pop();
          render();
        };
        row.append(button);
      }
      popup.append(row);
    }
    draft.ages.forEach((age,index) => {
      const label = document.createElement('label'); label.textContent = `Возраст ребёнка ${index+1} на дату вылета`;
      const select = document.createElement('select');
      select.add(new Option('Выберите возраст',''));
      for (let age = 0; age < 18; age++) select.add(new Option(String(age),String(age)));
      select.value = age; select.onchange = () => { draft.ages[index] = select.value; apply.disabled = draft.ages.includes(''); };
      label.append(select); popup.append(label);
    });
    const apply = document.createElement('button'); apply.type = 'button'; apply.className = 'primary'; apply.textContent = 'Применить'; apply.disabled = draft.ages.includes('');
    apply.onclick = () => {
      passengerState.adults = draft.adults; passengerState.ages = draft.ages;
      travellerToggle.textContent = `${draft.adults + draft.ages.length} пасс. · Эконом`;
      closePopup(); travellerToggle.focus();
    };
    popup.append(apply);
  }
  render();
};
