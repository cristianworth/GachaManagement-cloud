import test from 'node:test';
import assert from 'node:assert/strict';
import { createGameDailyState, getGameDailyCycleStart, getGameDailyState, sortGamesByDailyState } from '../js/utils/gameDailyState.js';
import { gameFromRow, gameToRow } from '../js/database/mappers/gameMapper.js';
import { createTestDatabase } from './helpers/testDatabase.mjs';

for (const [abbreviation, instant, expected] of [
    ['GI', '2026-10-22T08:59:59.999Z', '2026-10-21T09:00:00.000Z'],
    ['HSR', '2026-10-22T09:00:00Z', '2026-10-22T09:00:00.000Z'],
    ['ZZZ', '2026-10-22T09:00:00.001Z', '2026-10-22T09:00:00.000Z'],
    ['WuWa', '2026-10-22T06:00:00-03:00', '2026-10-22T09:00:00.000Z'],
    ['NTE', '2026-10-22T09:59:59.999Z', '2026-10-21T10:00:00.000Z'],
    ['NTE', '2026-10-22T10:00:00Z', '2026-10-22T10:00:00.000Z'],
    ['GI', '2027-01-01T08:59:59Z', '2026-12-31T09:00:00.000Z'],
    ['NTE', '2028-03-01T09:59:59Z', '2028-02-29T10:00:00.000Z'],
    ['AE', '2026-10-22T08:59:59Z', '2026-10-21T09:00:00.000Z'],
    ['CUSTOM', '2026-10-22T06:00:00-03:00', '2026-10-22T09:00:00.000Z'],
]) test(`${abbreviation} daily cycle at ${instant} uses the server reset`, () => {
    assert.equal(getGameDailyCycleStart(abbreviation, instant), expected);
});

test('old, missing or malformed daily choices become pending without changing the saved data', () => {
    const instant = '2026-10-22T12:00:00Z';
    for (const dailyState of [null, {}, 'done', {state:'toString',cycle_start:'2026-10-22T09:00:00.000Z'},
        {state:'done',cycle_start:'2026-10-21T09:00:00.000Z'},
        {state:'done',cycle_start:'2026-10-23T09:00:00.000Z'}]) {
        const game = {abbreviation:'GI',dailyState};
        const before = structuredClone(game);
        assert.equal(getGameDailyState(game, instant), 'pending');
        assert.deepEqual(game, before);
    }
    assert.equal(getGameDailyState({abbreviation:'GI',dailyState:{state:'done',cycle_start:'2026-10-22T09:00:00.000Z'}}, instant), 'done');
    assert.equal(getGameDailyState({abbreviation:'GI',dailyState:{state:'return_later',cycle_start:'2026-10-22T09:00:00.000Z'}}, instant), 'return_later');
});

test('custom games use the chosen default; invalid choices are rejected and general saves omit the state', () => {
    assert.equal(getGameDailyState({abbreviation:'CUSTOM'}), 'pending');
    assert.equal(getGameDailyState({abbreviation:'toString'}), 'pending');
    assert.equal(getGameDailyCycleStart('GI', 'invalid'), null);
    assert.equal(createGameDailyState('CUSTOM', 'done', '2026-10-22T12:00:00Z').cycle_start, '2026-10-22T09:00:00.000Z');
    assert.throws(() => createGameDailyState('GI', 'bad'), /inválido/);
    const game = gameFromRow({id:1,abbreviation:'GI',daily_state:{state:'done',cycle_start:'2026-10-22T09:00:00.000Z'}});
    assert.equal(game.dailyState.state, 'done');
    assert.equal(Object.hasOwn(gameToRow(game), 'daily_state'), false, 'Saving a stale stamina snapshot cannot overwrite a newer daily choice');
});

test('Games sort by effective daily state then saved full-stamina time without changing the input list', () => {
    const now = '2026-10-22T12:00:00Z';
    const entry = (id, state, dateMaxStamina, cycle_start='2026-10-22T09:00:00.000Z') =>
        ({id,abbreviation:'GI',dailyState:{state,cycle_start},dateMaxStamina});
    const games = [entry(1,'done','2026-10-22T13:00:00Z'),entry(2,'pending','2026-10-23T12:00:00Z'),
        entry(3,'return_later','2026-10-22T14:00:00Z'),entry(4,'pending','2026-10-22T18:00:00Z'),
        entry(5,'pending',null),entry(6,'done','2026-10-22T15:00:00Z','2026-10-21T09:00:00.000Z'),
        entry(7,'return_later','2026-10-22T13:00:00Z'),entry(8,'done','2026-10-22T16:00:00Z')];
    const before=structuredClone(games);
    assert.deepEqual(sortGamesByDailyState(games,now).map(game=>game.id),[6,4,2,5,7,3,1,8]);
    assert.deepEqual(games,before);
    assert.deepEqual(sortGamesByDailyState([games[0],games[7]],'2026-10-23T09:00:00Z').map(game=>game.id),[1,8]);
});

for (const migrated of [false, true]) test(`daily marks use the existing profile contract (${migrated ? 'upgrade' : 'fresh'})`, async t => {
    t.mock.timers.enable({apis:['Date'],now:new Date('2026-10-22T12:00:00Z')});
    const db = await createTestDatabase({migrated});
    t.after(() => db.close());
    await db.exec('set role anon');
    const game = (await db.query("select * from games where abbreviation='GI'")).rows[0];
    const read = async profile => (await db.query('select public.list_profile_games($1) as items',[profile])).rows[0].items;
    const choose = (profile, ids) => db.query('select public.set_profile_games($1,$2,false)',[profile,ids]);
    const save = (profile, payload) => db.query('select public.save_profile_game($1,$2,$3)',[profile,JSON.stringify(payload),game.id]);
    await choose('cran',[game.id]); await choose('demo',[game.id]);
    await save('cran',{abbreviation:'GI',current_stamina:80,pending_tasks:'Keep these notes'});
    const tasks = (await db.query('select * from tasks order by id')).rows;
    await save('cran',{abbreviation:'GI',daily_state:{state:'return_later',cycle_start:'2026-10-22T09:00:00.000Z'}});
    let personal = (await read('cran'))[0];
    assert.equal(personal.daily_state.state,'return_later');
    assert.equal(personal.current_stamina,80); assert.equal(personal.pending_tasks,'Keep these notes');
    assert.equal((await read('demo'))[0].daily_state,undefined);
    await save('cran',{abbreviation:'GI',current_stamina:100});
    assert.equal((await read('cran'))[0].daily_state.state,'return_later');
    await choose('cran',[]);
    await assert.rejects(save('cran',{abbreviation:'GI',daily_state:{state:'done'}}), /Selecione este jogo/);
    await choose('cran',[game.id]); personal=(await read('cran'))[0];
    assert.equal(personal.daily_state.state,'return_later');
    const mapped = gameFromRow(personal);
    assert.equal(getGameDailyState(mapped,'2026-10-23T08:59:59Z'),'return_later');
    assert.equal(getGameDailyState(mapped,'2026-10-23T09:00:00Z'),'pending');
    assert.deepEqual((await read('cran'))[0].daily_state,personal.daily_state,'Expiry is derived without a database write');
    assert.deepEqual((await db.query('select * from tasks order by id')).rows,tasks,'Games marks do not complete or change Tasks');
    assert.equal((await db.query('select to_jsonb(games) as item from games where id=$1',[game.id])).rows[0].item.daily_state,undefined);
});
