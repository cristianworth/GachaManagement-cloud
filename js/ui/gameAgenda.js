import { fetchBannerAgenda } from '../services/bannerAgenda.js';
import { fetchAllGames } from '../database/gameDB.js';
import { getSelectedProfileId } from '../services/profileSession.js';
import { BANNER_GAMES } from '../utils/bannerCatalogue.js';
import { agendaState, formatAgendaDate } from '../utils/gameAgenda.js';
import { setFeedback } from './feedback.js';

const contexts = new WeakMap();
const el = id => document.getElementById(id);
const civilDateFormat = new Intl.DateTimeFormat('pt-BR', {
    timeZone: 'America/Sao_Paulo', year: 'numeric', month: 'numeric', day: 'numeric',
});
const monthFormat = new Intl.DateTimeFormat('pt-BR', {timeZone: 'UTC', month: 'long', year: 'numeric'});
const dayFormat = new Intl.DateTimeFormat('pt-BR', {timeZone: 'UTC', day: 'numeric', month: 'long'});
const fullDayFormat = new Intl.DateTimeFormat('pt-BR', {timeZone: 'UTC', dateStyle: 'full'});
const timeFormat = new Intl.DateTimeFormat('pt-BR', {timeZone: 'America/Sao_Paulo', timeStyle: 'short'});

// UTC dates carry calendar coordinates after converting the instant to Brasília.
function civilDate(instant) {
    const parts = Object.fromEntries(civilDateFormat.formatToParts(instant).map(({type,value})=>[type,value]));
    return new Date(Date.UTC(parts.year, parts.month - 1, parts.day));
}

function render(context) {
    const now = new Date();
    const profileEntries = context.profile === getSelectedProfileId() ? context.entries : [];
    const entries = profileEntries.filter(entry=>context.games.has(entry.abbreviation)
        && (!el('agendaGameFilter').value || entry.abbreviation === el('agendaGameFilter').value)
        && (el('agendaShowEnded').checked || Date.parse(entry.ends_at) > +now))
        .sort((a,b)=>Date.parse(a.ends_at)-Date.parse(b.ends_at) || a.id.localeCompare(b.id));
    const month = context.monthView;
    el('agendaListView').setAttribute('aria-pressed', String(!month));
    el('agendaMonthView').setAttribute('aria-pressed', String(month));
    el('agendaList').hidden = month;
    el('agendaEmpty').hidden = month || !!entries.length;
    el('agendaMonth').hidden = !month;
    if (month) {
        el('agendaList').replaceChildren();
        renderMonth(context, entries, civilDate(now));
    } else {
        el('agendaDayEntries').replaceChildren();
        el('agendaMonthDays').replaceChildren();
        renderList(entries, now);
    }
}

function createGallery(entry) {
    const gallery = document.createElement('div'); gallery.className = 'agenda-phase-gallery'; gallery.dataset.count = entry.members.length;
    for (const member of entry.members) {
        const figure = document.createElement('figure');
        if (member.image_url) {
            const image = document.createElement('img'); image.src = member.image_url; image.alt = ''; image.loading = 'lazy';
            image.referrerPolicy = 'no-referrer'; image.onerror = ()=>image.remove(); figure.append(image);
        }
        const caption = document.createElement('figcaption'); caption.textContent = member.title;
        if (member.whole_version) {
            const badge = document.createElement('small'); badge.textContent = 'Versão inteira'; caption.append(badge);
        }
        figure.append(caption); gallery.append(figure);
    }
    return gallery;
}

function renderList(entries, now) {
    const list = el('agendaList'); list.replaceChildren();
    for (const entry of entries) {
        const li = document.createElement('li'); li.className = 'agenda-entry'; li.dataset.id = entry.id;
        const body = document.createElement('div'); body.className = 'agenda-entry-content';
        const meta = document.createElement('p'); meta.className = 'agenda-entry-meta'; meta.textContent = `${entry.game_name} · Versão ${entry.version}`;
        const title = document.createElement('h2'); title.textContent = entry.title;
        const names = document.createElement('p'); names.className = 'agenda-phase-characters'; names.textContent = entry.members.map(member=>member.title).join(' / ');
        const state = document.createElement('span'); state.className = 'agenda-entry-state'; state.textContent = agendaState(entry,now);
        const period = document.createElement('p'); period.textContent = `${formatAgendaDate(entry.starts_at)} até ${formatAgendaDate(entry.ends_at)} (Brasília)`;
        body.append(meta,title,names,state,period);
        if (entry.timing_note) {
            const note = document.createElement('p'); note.className = 'agenda-entry-meta'; note.textContent = entry.timing_note; body.append(note);
        }
        for (const [index,url] of entry.sources.entries()) {
            const source = document.createElement('a'); source.href = url; source.target = '_blank'; source.rel = 'noopener noreferrer';
            source.textContent = entry.sources.length === 1 ? 'Consultar fonte' : `Consultar fonte ${index+1}`; body.append(source,document.createTextNode(' '));
        }
        li.append(createGallery(entry),body); list.append(li);
    }
}

function renderDay(date, milestones) {
    const title = el('agendaDayTitle');
    const heading = dayFormat.format(date);
    if (title.textContent !== heading) title.textContent = heading;
    el('agendaDayEmpty').hidden = milestones.length > 0;
    el('agendaDayEntries').replaceChildren(...milestones.map(({entry, instant, label})=>{
        const row = document.createElement('li');
        row.className = 'agenda-entry agenda-day-entry';
        const body = document.createElement('div');
        body.className = 'agenda-entry-content';
        const name = document.createElement('h4');
        name.textContent = `${entry.game_name} · Versão ${entry.version}`;
        const time = document.createElement('p');
        time.textContent = `${label} · ${timeFormat.format(instant)}`;
        body.append(name, time);
        row.append(body, createGallery(entry));
        return row;
    }));
}

function renderMonth(context, entries, today) {
    const selected = context.selectedDay;
    const year = selected.getUTCFullYear();
    const month = selected.getUTCMonth();
    const first = new Date(Date.UTC(year, month, 1));
    const dayCount = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
    const byDay = new Map();
    for (const entry of entries) {
        for (const [field, action] of [['starts_at', 'Início'], ['ends_at', 'Fim']]) {
            const instant = Date.parse(entry[field]);
            const day = civilDate(instant);
            if (day.getUTCFullYear() !== year || day.getUTCMonth() !== month) continue;
            const key = day.getUTCDate();
            if (!byDay.has(key)) byDay.set(key, []);
            byDay.get(key).push({entry, instant, label: `${action} da ${entry.phase}ª fase`});
        }
    }
    for (const milestones of byDay.values()) milestones.sort((a,b)=>a.instant-b.instant);

    const title = el('agendaMonthTitle');
    const heading = monthFormat.format(first);
    if (title.textContent !== heading) title.textContent = heading;
    const grid = el('agendaMonthDays');
    const buttons = [];
    const fragment = document.createDocumentFragment();
    for (let day = 1; day <= dayCount; day++) {
        const date = new Date(Date.UTC(year, month, day));
        const milestones = byDay.get(day) ?? [];
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'agenda-month-day';
        button.setAttribute('aria-label', `${fullDayFormat.format(date)}, ${milestones.length} ${milestones.length === 1 ? 'marco' : 'marcos'}`);
        button.setAttribute('aria-pressed', String(+date === +selected));
        if (+date === +today) button.setAttribute('aria-current', 'date');
        button.tabIndex = +date === +selected ? 0 : -1;
        if (day === 1) button.style.gridColumnStart = first.getUTCDay() + 1;

        const number = document.createElement('span');
        number.className = 'agenda-day-number';
        number.textContent = day;
        button.append(number);
        for (const {entry, label} of milestones.slice(0, 2)) {
            const tag = document.createElement('span');
            tag.className = 'agenda-day-tag';
            tag.textContent = `${entry.abbreviation} · ${label}`;
            button.append(tag);
        }
        if (milestones.length > 2) {
            const extra = document.createElement('span');
            extra.className = 'agenda-day-extra';
            extra.textContent = `+${milestones.length - 2}`;
            button.append(extra);
        }
        if (milestones.length) {
            const count = document.createElement('span');
            count.className = 'agenda-day-count';
            count.textContent = milestones.length;
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
            context.selectedDay = date;
            renderDay(date, milestones);
        };
        buttons.push(button);
        fragment.append(button);
    }
    const focusedIndex = [...grid.children].indexOf(document.activeElement);
    grid.replaceChildren(fragment);
    buttons[focusedIndex]?.focus();
    renderDay(selected, byDay.get(selected.getUTCDate()) ?? []);
}

export async function displayGameAgenda() {
    let context = contexts.get(document);
    if (!context) {
        context = {entries:[],games:new Set(),profile:null,revision:0,monthView:true,selectedDay:civilDate(new Date())};
        contexts.set(document,context);
        el('agendaGameFilter').onchange = ()=>render(context);
        el('agendaShowEnded').onchange = ()=>render(context);
        el('agendaRefresh').onclick = ()=>load(context,true);
        el('agendaListView').onclick = ()=>{
            context.monthView = false;
            render(context);
        };
        el('agendaMonthView').onclick = ()=>{
            context.monthView = true;
            render(context);
        };
        const moveMonth = offset=>{
            const selected = context.selectedDay;
            context.selectedDay = new Date(Date.UTC(selected.getUTCFullYear(), selected.getUTCMonth() + offset, 1));
            render(context);
        };
        el('agendaPreviousMonth').onclick = ()=>moveMonth(-1);
        el('agendaNextMonth').onclick = ()=>moveMonth(1);
        el('agendaToday').onclick = ()=>{
            context.selectedDay = civilDate(new Date());
            render(context);
        };
    }
    await load(context);
}

async function load(context, force = false) {
    const profile = getSelectedProfileId();
    const revision = ++context.revision;
    const filter = el('agendaGameFilter');
    if (context.profile !== profile) {
        context.profile = profile;
        context.games.clear();
        filter.replaceChildren(new Option('Todos os jogos',''));
        render(context);
        setFeedback('agendaStatus');
    }
    el('agendaRefresh').disabled = true;
    try {
        const [games, catalogue] = await Promise.allSettled([fetchAllGames(), fetchBannerAgenda({force})]);
        if (revision !== context.revision || profile !== getSelectedProfileId()) return;
        const selected = filter.value;
        context.games = new Set(games.status === 'fulfilled' ? games.value.map(game=>game.abbreviation) : []);
        filter.replaceChildren(new Option('Todos os jogos',''), ...BANNER_GAMES
            .filter(game=>context.games.has(game.abbreviation)).map(game=>new Option(game.name,game.abbreviation)));
        if ([...filter.options].some(option=>option.value === selected)) filter.value = selected;
        if (catalogue.status === 'fulfilled') context.entries = catalogue.value;
        render(context);
        if (games.status === 'rejected') {
            setFeedback('agendaStatus','Não foi possível confirmar os jogos do perfil. Use Atualizar calendário para tentar novamente.','error');
        } else if (catalogue.status === 'rejected') {
            setFeedback('agendaStatus','Não foi possível ler os banners publicados. Os dados anteriores foram mantidos. Use Atualizar calendário para tentar novamente.','error');
        } else setFeedback('agendaStatus');
    } finally { if (revision === context.revision) el('agendaRefresh').disabled = false; }
}
