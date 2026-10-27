import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {groupAgendaEntries,getBannerVersionInfo,formatBannerVersion} from '../js/utils/gameAgenda.js';
import {getGameNotifications} from '../js/utils/gameNotices.js';

const banner=(id,title,version='7.1 — Fase 2',patch={})=>({id,game_id:1,kind:'banner',title,version,
    starts_at:'2026-10-24T12:00:00.000Z',ends_at:'2026-11-03T19:59:00.000Z',...patch});

test('version and phase have a stable form representation without requiring a schema change',()=>{
    assert.deepEqual(getBannerVersionInfo('7.1 — Fase 2'),{version:'7.1',phase:2});
    assert.deepEqual(getBannerVersionInfo('4.6 — versão inteira'),{version:'4.6',phase:'whole'});
    assert.equal(formatBannerVersion('7.1','2'),'7.1 — Fase 2');
    assert.equal(formatBannerVersion('4.6','whole'),'4.6 — versão inteira');
    assert.throws(()=>formatBannerVersion('','1'),/versão/);
    assert.throws(()=>formatBannerVersion('7.1','3'),/fase/);
});

test('characters share one phase card while games, versions and halves remain separate',()=>{
    const entries=[banner(1,'Skirk'),banner(2,'Escoffier'),banner(3,'Other version','7.2 — Fase 2'),
        banner(4,'Other game','7.1 — Fase 2',{game_id:2}),banner(5,'First phase','7.1 — Fase 1')];
    const before=structuredClone(entries);
    const groups=groupAgendaEntries(entries);
    assert.equal(groups.length,4);
    const second=groups.find(group=>group.game_id===1&&group.version==='7.1'&&group.phase===2);
    assert.equal(second.title,'Segunda fase');
    assert.deepEqual(second.members.map(member=>member.title),['Skirk','Escoffier']);
    assert.deepEqual(entries,before,'Grouping never rewrites shared or personal source records');
});

test('whole-version characters appear in both known halves without guessing a midpoint',()=>{
    const pearl=banner(1,'Pearl','4.6 — versão inteira',{starts_at:'2026-09-28T03:00:00.000Z',ends_at:'2026-11-10T20:00:00.000Z'});
    const blade=banner(2,'Mortenax Blade','4.6 — Fase 2',{starts_at:'2026-10-21T17:00:00.000Z',ends_at:pearl.ends_at});
    const groups=groupAgendaEntries([pearl,blade]);
    assert.equal(groups.length,2);
    const first=groups.find(group=>group.phase===1);
    const second=groups.find(group=>group.phase===2);
    assert.equal(first.starts_at,'2026-09-28T03:00:00.000Z');
    assert.equal(first.ends_at,'2026-10-21T17:00:00.000Z');
    assert.equal(first.endsAtNextPhase,true,'The derived first half is labelled up to the confirmed second-half boundary');
    assert.deepEqual(first.members.map(member=>member.title),['Pearl']);
    assert.deepEqual(second.members.map(member=>member.title),['Pearl','Mortenax Blade']);
    assert.deepEqual(second.triggers.map(member=>member.id),[2],'The whole-version character must not reuse the first-half receipt for the new limited banner');
    const unknown=groupAgendaEntries([pearl]);
    assert.equal(unknown.length,1);assert.equal(unknown[0].title,'Versão inteira');
});

test('existing five-game calendar displays five active banner phases rather than ten characters',async()=>{
    const calendar=JSON.parse(await readFile(new URL('../db/seeds/game-agenda-2026-10-25.json',import.meta.url),'utf8'));
    const games=['GI','HSR','ZZZ','WuWa','NTE'];
    const entries=calendar.map((item,index)=>({...item,id:index+1,game_id:games.indexOf(item.abbreviation)+1}));
    const now=Date.parse('2026-10-25T12:00:00Z');
    const active=groupAgendaEntries(entries).filter(group=>group.kind==='banner'&&Date.parse(group.ends_at)>now);
    assert.equal(active.length,5);
    assert.deepEqual(active.find(group=>group.abbreviation==='GI').members.map(member=>member.title),['Skirk','Escoffier']);
    assert.equal(active.find(group=>group.abbreviation==='WuWa').members.length,3);
    assert.deepEqual(active.find(group=>group.abbreviation==='HSR').members.map(member=>member.title),['Pearl','Mortenax Blade']);
});

test('one notification per phase acknowledges its members and metadata changes do not create duplicate unread messages',()=>{
    const entries=[banner(1,'Skirk'),banner(2,'Escoffier')];
    const notices=()=>getGameNotifications([{id:1,description:'Genshin',agenda:entries}],new Date('2026-11-02T12:00:00Z'));
    let items=notices();assert.equal(items.length,1);
    assert.deepEqual(items[0].agendaIds,[1,2]);assert.equal(items[0].displayLabel,'Segunda fase');
    assert.match(items[0].text,/Skirk \/ Escoffier/);
    for(const entry of entries)entry.read={signature:items[0].signature,stage:items[0].stage};
    assert.equal(notices()[0].unread,false);
    entries[0].image_url='https://example.org/art.jpg';assert.equal(notices()[0].unread,false);
    entries[1].title='Corrected character';assert.equal(notices()[0].unread,true);
});

test('whole-version characters notify at each phase end using independent phase receipts',()=>{
    const pearl=banner(1,'Pearl','4.6 — versão inteira',{starts_at:'2026-10-01T12:00:00Z',ends_at:'2026-11-10T20:00:00Z'});
    const limited=banner(2,'Limited','4.6 — Fase 2',{starts_at:'2026-10-21T17:00:00Z',ends_at:pearl.ends_at});
    const game={id:1,agenda:[pearl,limited]};
    const first=getGameNotifications([game],'2026-10-20T17:00:00Z');
    assert.equal(first.length,1);assert.equal(first[0].displayLabel,'Primeira fase');
    pearl.read={signature:first[0].signature,stage:first[0].stage};
    assert.equal(getGameNotifications([game],'2026-10-20T18:00:00Z')[0].unread,false);
    assert.deepEqual(getGameNotifications([game],'2026-10-21T17:00:00Z'),[],'The new phase does not notify at its start');
    const second=getGameNotifications([game],'2026-11-09T20:00:00Z');
    assert.equal(second[0].displayLabel,'Segunda fase');assert.equal(second[0].unread,true);
    assert.deepEqual(second[0].agendaIds,[2]);
    limited.read={signature:second[0].signature,stage:second[0].stage};
    assert.equal(getGameNotifications([game],'2026-11-09T21:00:00Z')[0].unread,false);
});
