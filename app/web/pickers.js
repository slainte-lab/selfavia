const passengerState = { adults: 1, ages: [] };
let activePopup;
let popupTrigger;

function closePopup() {
  activePopup?.cleanup?.();
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
    if (value) clearFieldError(trigger);
    trigger.textContent = value ? new Date(value + 'T12:00:00').toLocaleDateString('ru-RU', {day:'numeric', month:'short'}) : 'Выберите дату';
  };
  field.minimum = minimum;
  field.onDateSelect = onSelect;
  trigger.addEventListener('click', () => {
    const popup = openPopup(trigger, 'calendar');
    const row = field.closest('.leg');
    const range = row.classList.contains('roundtrip');
    const fields = range ? [...row.querySelectorAll('.date-field')] : [field];
    const min = fields[0].minimum();
    const selectedDates = fields.map(item => item.dataset.value).filter(Boolean).map(value => new Date(value + 'T12:00:00'));
    const host = document.createElement('div');
    host.tabIndex = 0;
    popup.append(host);
    let focusedDate = new Date((field.dataset.value || min) + 'T12:00:00');
    let ready = false;
    const picker = new AirDatepicker(host, {
      inline: true,
      range,
      dynamicRange: false,
      toggleSelected: false,
      minDate: new Date(min + 'T00:00:00'),
      startDate: focusedDate,
      onChangeViewDate({year, month}) {
        focusedDate = new Date(year, month, 1, 12);
        if (dateKey(focusedDate) < min) focusedDate = new Date(min + 'T12:00:00');
        host.setAttribute('aria-label', focusedDate.toLocaleDateString('ru-RU', {day:'numeric',month:'long',year:'numeric'}));
      },
      // Air Datepicker's bundled default locale is Russian.
      onSelect({date}) {
        if (!ready) return;
        const dates = Array.isArray(date) ? date : [date];
        fields.forEach((item, index) => {
          const value = dates[index] ? dateKey(dates[index]) : '';
          item.setDate(value);
          if (value) item.onDateSelect?.(value);
        });
        if (!range || dates.length === 2) {
          queueMicrotask(() => {
            if (activePopup === popup) { closePopup(); trigger.focus(); }
          });
        }
      }
    });
    if (selectedDates.length) picker.selectDate(selectedDates, {silent:true});
    ready = true;
    function focusDate(date) {
      if (dateKey(date) < min) date = new Date(min + 'T12:00:00');
      focusedDate = date;
      picker.setFocusDate(date, {viewDateTransition:true});
      host.setAttribute('aria-label', date.toLocaleDateString('ru-RU', {day:'numeric',month:'long',year:'numeric'}));
    }
    focusDate(focusedDate);
    host.addEventListener('keydown', event => {
      if (event.target !== host) return;
      const shift = {ArrowLeft:-1, ArrowRight:1, ArrowUp:-7, ArrowDown:7}[event.key];
      if (shift) {
        event.preventDefault();
        const date = new Date(focusedDate);
        date.setDate(date.getDate() + shift);
        focusDate(date);
      } else if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        picker.selectDate(focusedDate);
      }
    });
    function enableNavKeyboard() {
      host.querySelectorAll('.air-datepicker-nav--action,.air-datepicker-nav--title,.air-datepicker-cell').forEach(item => {
        const disabled = item.classList.contains('-disabled-');
        const day = item.classList.contains('-day-');
        item.tabIndex = disabled || day ? -1 : 0;
        item.setAttribute('role','button');
        item.setAttribute('aria-disabled', String(disabled));
        if (item.dataset.action) item.setAttribute('aria-label', item.dataset.action === 'prev' ? 'Предыдущий месяц' : 'Следующий месяц');
        item.onkeydown = event => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            if (!disabled) {
              item.click();
              if (!item.isConnected || item.classList.contains('air-datepicker-cell')) host.focus();
            }
          }
        };
      });
    }
    // Day navigation is handled by the focusable calendar host; keep month/year
    // navigation accessible without changing the form's date buttons into inputs.
    enableNavKeyboard();
    const observer = new MutationObserver(enableNavKeyboard);
    observer.observe(host, {childList:true,subtree:true});
    popup.cleanup = () => { observer.disconnect(); picker.destroy(); };
    host.focus();
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
          const controls = [...popup.querySelectorAll('.counter button')];
          const replacement = controls.find(item => item.getAttribute('aria-label') === button.getAttribute('aria-label'));
          (replacement?.disabled ? controls.find(item => !item.disabled && item.closest('.counter') === replacement.closest('.counter')) : replacement)?.focus();
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
