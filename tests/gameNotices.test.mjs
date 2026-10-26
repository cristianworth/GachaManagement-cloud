import test from 'node:test';
import assert from 'node:assert/strict';
import { fromBrasiliaInput, toBrasiliaInput, getGameNotifications } from '../js/utils/gameNotices.js';
import { gameFromRow, gameToRow } from '../js/database/mappers/gameMapper.js';
import { createTestDatabase } from './helpers/testDatabase.mjs';

const notices = {
    maintenance: { starts_at: '2026-10-24T01:00:00.000Z', ends_at: '2026-10-24T06:00:00.000Z' },
    banner: { starts_at: '2026-10-24T06:00:00.000Z', characters: 'Character A / Character B' },
};
const agenda = [
    { id:101, kind:'maintenance', title:'Version update', ...notices.maintenance },
    { id:102, kind:'banner', title:notices.banner.characters, starts_at:notices.banner.starts_at, ends_at:'2026-11-14T17:00:00.000Z' },
];

test('Brasilia input uses UTC-3 across midnight regardless of the computer timezone', () => {
    assert.equal(fromBrasiliaInput('2026-10-23T22:00'), '2026-10-24T01:00:00.000Z');
    assert.equal(toBrasiliaInput('2026-10-24T01:00:00Z'), '2026-10-23T22:00');
    assert.equal(fromBrasiliaInput('2028-02-29T23:30'), '2028-03-01T02:30:00.000Z');
    for (const invalid of ['', 'bad', '2026-02-29T01:00', '2026-02-31T01:00', '2026-10-23T24:00']) {
        assert.throws(() => fromBrasiliaInput(invalid), /data e hora/);
    }
    assert.equal(toBrasiliaInput('invalid'), '');
});

test('invalid shared entries do not hide valid ones; old personal agendas no longer generate notifications', () => {
    const game = {id:1,agenda:[{...agenda[0],starts_at:'bad'},agenda[1]],notices};
    assert.equal(getGameNotifications([game], '2026-10-23T12:00:00Z').length,1);
    assert.deepEqual(getGameNotifications([{...game,agenda:[]}], '2026-10-23T12:00:00Z'),[]);
});

test('notifications include the America period in Brasilia and stop exactly at maintenance end or banner start', () => {
    const game = {id:1,agenda};
    const before = getGameNotifications([game], '2026-10-24T00:59:59Z');
    assert.match(before.find(item=>item.kind==='maintenance').text, /23\/10\/2026.*22:00/);
    assert.equal(getGameNotifications([game], '2026-10-24T01:00:00Z')[0].state, 'ongoing');
    assert.equal(getGameNotifications([game], '2026-10-24T05:59:59Z').length, 2);
    assert.deepEqual(getGameNotifications([game], '2026-10-24T06:00:00Z'), []);
});

for (const migrated of [false, true]) test(`profile notice saves preserve stamina, daily state and other profiles (${migrated ? 'upgrade' : 'new database'})`, async t => {
    const db = await createTestDatabase({migrated}); t.after(() => db.close());
    await db.exec('set role anon');
    const id = (await db.query("select id from games where abbreviation='GI'")).rows[0].id;
    const call = async (profile, patch) => db.query('select public.save_profile_game($1, $2::jsonb, $3)', [profile, JSON.stringify({abbreviation:'GI', ...patch}), id]);
    await db.query('select public.set_profile_games($1,$2::bigint[],false)', ['cran', [id]]);
    await db.query('select public.set_profile_games($1,$2::bigint[],false)', ['demo', [id]]);
    const daily = {state:'return_later',cycle_start:'2026-10-23T09:00:00.000Z'};
    await call('cran', {current_stamina:77, pending_tasks:'Keep notes', daily_state:daily});
    await call('cran', {game_notices:notices});
    const list = async profile => (await db.query('select public.list_profile_games($1) as games', [profile])).rows[0].games;
    let personal = (await list('cran'))[0];
    assert.deepEqual(personal.game_notices, notices); assert.equal(personal.current_stamina,77);
    assert.deepEqual(personal.daily_state,daily); assert.equal(personal.pending_tasks,'Keep notes');
    assert.equal((await list('demo'))[0].game_notices,undefined);
    const mapped = gameFromRow(personal);
    assert.deepEqual(mapped.notices,notices); assert.equal(Object.hasOwn(gameToRow(mapped),'game_notices'),false);
    await call('cran', {current_stamina:20});
    assert.deepEqual((await list('cran'))[0].game_notices,notices);
    await db.query('select public.set_profile_games($1,$2::bigint[],false)', ['cran', []]);
    await db.query('select public.set_profile_games($1,$2::bigint[],false)', ['cran', [id]]);
    assert.deepEqual((await list('cran'))[0].game_notices,notices);
    await assert.rejects(call('invalid-profile', {game_notices:notices}));
    await call('cran', {game_notices:{maintenance:null,banner:null}});
    personal = (await list('cran'))[0];
    assert.deepEqual(personal.game_notices,{maintenance:null,banner:null});
    assert.equal(personal.current_stamina,20);
    const settings = {maintenance:true,banner:false};
    await call('cran', {game_notices:notices,game_notice_preferences:settings});
    const saved = (await db.query('select save_game_agenda($1::jsonb) as entry', [JSON.stringify({game_id:Number(id),...agenda[0]})])).rows[0].entry;
    const notification = getGameNotifications([gameFromRow((await list('cran'))[0])], '2026-10-23T12:00:00Z')[0];
    const read = {signature:notification.signature,stage:notification.stage};
    await call('cran', {[`agenda_notice_read_${saved.id}`]:read});
    personal = (await list('cran'))[0];
    const after = gameFromRow(personal);
    assert.deepEqual(after.notices,notices); assert.deepEqual(after.noticePreferences,settings);
    assert.deepEqual(after.agenda[0].read,read);
    assert.equal(getGameNotifications([after], '2026-10-23T12:00:00Z')[0].unread,false);
    assert.equal((await list('demo'))[0].game_agenda[0].read,null);
    assert.equal(Object.hasOwn(gameToRow(after),'game_agenda'),false);
    await call('cran', {banner_notice_read:{signature:'other',stage:'24h'},pending_tasks:'Other save'});
    assert.deepEqual((await list('cran'))[0].game_agenda[0].read,read);
});

test('one notification advances at 48h, 24h and maintenance start, without duplicated missed stages', () => {
    const game = {id:1,description:'Test',abbreviation:'GI',agenda:structuredClone(agenda)};
    assert.deepEqual(getGameNotifications([game], '2026-10-22T00:59:59Z'), []);
    let items = getGameNotifications([game], '2026-10-22T01:00:00Z');
    assert.equal(items.length,1); assert.equal(items[0].stage,'48h');
    const key = items[0].key;
    game.agenda[0].read = {signature:items[0].signature,stage:'48h'};
    assert.equal(getGameNotifications([game], '2026-10-22T02:00:00Z')[0].unread,false);
    items = getGameNotifications([game], '2026-10-23T01:00:00Z');
    assert.equal(items.find(item=>item.kind==='maintenance').key,key);
    assert.equal(items.find(item=>item.kind==='maintenance').stage,'24h');
    assert.equal(items.find(item=>item.kind==='maintenance').unread,true);
    game.agenda[0].read.stage = '24h';
    assert.equal(getGameNotifications([game], '2026-10-24T00:59:59Z')[0].unread,true, 'Unread banner sorts before the read maintenance');
    items = getGameNotifications([game], '2026-10-24T01:00:00Z');
    assert.equal(items.find(item=>item.kind==='maintenance').stage,'ongoing');
    assert.equal(items.find(item=>item.kind==='maintenance').unread,true);
    game.agenda[0].read.stage = 'ongoing';
    assert.equal(getGameNotifications([game], '2026-10-24T02:00:00Z').find(item=>item.kind==='maintenance').unread,false);
    assert.deepEqual(getGameNotifications([game], '2026-10-24T06:00:00Z'), []);
    assert.equal(getGameNotifications([game], '2026-10-23T14:00:00Z').length,2, 'Opening late only gives the current stage per event');
    game.noticePreferences = {maintenance:false,banner:false};
    assert.deepEqual(getGameNotifications([game], '2026-10-23T14:00:00Z'), []);
    assert.equal(game.agenda[0].starts_at,notices.maintenance.starts_at);
});

test('only a meaningful schedule edit restores unread status for the current stage', () => {
    const game = {id:1,description:'Test',agenda:structuredClone(agenda)};
    const now = '2026-10-23T12:00:00Z';
    for (const item of getGameNotifications([game],now)) game.agenda.find(entry=>entry.id===item.agendaId).read = {signature:item.signature,stage:item.stage};
    assert.ok(getGameNotifications([game],now).every(item=>!item.unread));
    game.agenda[1].title = 'Changed announcement';
    assert.equal(getGameNotifications([game],now).find(item=>item.kind==='banner').unread,true);
    assert.equal(getGameNotifications([game],now).find(item=>item.kind==='maintenance').unread,false);
    game.agenda[0].ends_at = '2026-10-24T07:00:00Z';
    assert.ok(getGameNotifications([game],now).every(item=>item.unread));
});
