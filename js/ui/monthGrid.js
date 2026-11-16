const monthFormat = new Intl.DateTimeFormat('pt-BR', {timeZone: 'UTC', month: 'long', year: 'numeric'});
const dayFormat = new Intl.DateTimeFormat('pt-BR', {timeZone: 'UTC', day: 'numeric', month: 'long'});
const fullDayFormat = new Intl.DateTimeFormat('pt-BR', {timeZone: 'UTC', dateStyle: 'full'});

export const formatMonthDay = date => dayFormat.format(date);

export function renderMonthGrid({grid, title, selected, today, byDay, labelFor, singular, plural, selectDay}) {
    const year = selected.getUTCFullYear();
    const month = selected.getUTCMonth();
    const first = new Date(Date.UTC(year, month, 1));
    const dayCount = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
    const heading = monthFormat.format(first);
    if (title.textContent !== heading) title.textContent = heading;
    const buttons = [];
    const fragment = document.createDocumentFragment();
    for (let day = 1; day <= dayCount; day++) {
        const date = new Date(Date.UTC(year, month, day));
        const items = byDay.get(day) ?? [];
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'agenda-month-day';
        button.setAttribute('aria-label', `${fullDayFormat.format(date)}, ${items.length} ${items.length === 1 ? singular : plural}`);
        button.setAttribute('aria-pressed', String(+date === +selected));
        if (+date === +today) button.setAttribute('aria-current', 'date');
        button.tabIndex = +date === +selected ? 0 : -1;
        if (day === 1) button.style.gridColumnStart = first.getUTCDay() + 1;

        const number = document.createElement('span');
        number.className = 'agenda-day-number';
        number.textContent = day;
        button.append(number);
        for (const item of items.slice(0, 2)) {
            const tag = document.createElement('span');
            tag.className = 'agenda-day-tag';
            tag.textContent = labelFor(item);
            button.append(tag);
        }
        if (items.length > 2) {
            const extra = document.createElement('span');
            extra.className = 'agenda-day-extra';
            extra.textContent = `+${items.length - 2}`;
            button.append(extra);
        }
        if (items.length) {
            const count = document.createElement('span');
            count.className = 'agenda-day-count';
            count.textContent = items.length;
            button.append(count);
        }
        button.onfocus = ()=>{
            grid.querySelector('[tabindex="0"]')?.setAttribute('tabindex', '-1');
            button.tabIndex = 0;
        };
        button.onkeydown = event=>{
            const offset = {ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7}[event.key];
            if (!offset) return;
            event.preventDefault();
            buttons[day + offset - 1]?.focus();
        };
        button.onclick = ()=>{
            grid.querySelector('[aria-pressed="true"]').setAttribute('aria-pressed', 'false');
            button.setAttribute('aria-pressed', 'true');
            selectDay(date, items);
        };
        buttons.push(button);
        fragment.append(button);
    }
    const focusedIndex = [...grid.children].indexOf(document.activeElement);
    grid.replaceChildren(fragment);
    buttons[focusedIndex]?.focus();
}
