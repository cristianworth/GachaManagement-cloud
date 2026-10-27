import { fetchBannerAgenda } from '../services/bannerAgenda.js';
import { BANNER_GAMES } from '../utils/bannerCatalogue.js';
import { agendaState, formatAgendaDate } from '../utils/gameAgenda.js';
import { setFeedback } from './feedback.js';

const contexts = new WeakMap();
const el = id => document.getElementById(id);

function render(context) {
    const now = new Date();
    const entries = context.entries.filter(entry=>(!el('agendaGameFilter').value || entry.abbreviation === el('agendaGameFilter').value)
        && (el('agendaShowEnded').checked || Date.parse(entry.ends_at) > +now))
        .sort((a,b)=>Number(Date.parse(a.ends_at)<=+now)-Number(Date.parse(b.ends_at)<=+now)
            || Date.parse(a.starts_at)-Date.parse(b.starts_at) || a.id.localeCompare(b.id));
    const list = el('agendaList'); list.replaceChildren();
    el('agendaEmpty').hidden = !!entries.length;
    for (const entry of entries) {
        const li = document.createElement('li'); li.className = 'agenda-entry'; li.dataset.id = entry.id;
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
        li.append(gallery,body); list.append(li);
    }
}

export async function displayGameAgenda() {
    let context = contexts.get(document);
    if (!context) {
        context = {entries:[],revision:0}; contexts.set(document,context);
        el('agendaGameFilter').replaceChildren(new Option('Todos os jogos',''),...BANNER_GAMES.map(game=>new Option(game.name,game.abbreviation)));
        el('agendaGameFilter').onchange = ()=>render(context);
        el('agendaShowEnded').onchange = ()=>render(context);
        el('agendaRefresh').onclick = ()=>load(context,true);
    }
    await load(context);
}

async function load(context, force = false) {
    const revision = ++context.revision;
    el('agendaRefresh').disabled = true;
    try {
        const entries = await fetchBannerAgenda({force});
        if (revision !== context.revision) return;
        context.entries = entries; render(context); setFeedback('agendaStatus');
    } catch (error) {
        console.error('Failed to read published banners:',error);
        if (revision === context.revision) setFeedback('agendaStatus','Não foi possível ler os banners publicados. Os dados anteriores foram mantidos. Use Atualizar agenda para tentar novamente.','error');
    } finally { if (revision === context.revision) el('agendaRefresh').disabled = false; }
}
