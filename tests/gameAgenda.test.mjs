import test from 'node:test';
import assert from 'node:assert/strict';
import { createTestDatabase, readProjectFile } from './helpers/testDatabase.mjs';
import { validateAgendaEntry, agendaState } from '../js/utils/gameAgenda.js';
import { getGameNotifications } from '../js/utils/gameNotices.js';

const entry = {game_id:1,kind:'banner',title:'Featured characters',version:'7.1 — Phase 2',
    starts_at:'2026-10-26T17:00:00.000Z',ends_at:'2026-11-10T19:59:00.000Z',source_url:'https://example.org/announcement',image_url:''};

test('agenda validates explicit timezone, interval, HTTPS links and title without changing the input',()=>{
    assert.deepEqual(validateAgendaEntry(entry),{...entry,timing_note:''});
    for (const patch of [{game_id:0},{kind:'other'},{kind:'maintenance'},{title:' '},{starts_at:'2026-10-26T17:00'},
        {ends_at:entry.starts_at},{image_url:'javascript:alert(1)'},{source_url:'https://user:password@example.org'}]) {
        assert.throws(()=>validateAgendaEntry({...entry,...patch}));
    }
    assert.equal(agendaState(entry,new Date('2026-10-26T16:59:00Z')),'Em breve');
    assert.equal(agendaState(entry,new Date(entry.starts_at)),'Em andamento');
    assert.equal(agendaState(entry,new Date(entry.ends_at)),'Encerrado');
});

test('reviewed America seed is idempotent and preserves explicit global and server-time conversions',async t=>{
    const db=await createTestDatabase(); t.after(()=>db.close());
    await db.exec('set role anon');
    const seed=await readProjectFile('db/seeds/game-agenda-2026-10-25.sql');
    await db.exec(seed);await db.exec(seed);
    const rows=(await db.query('select a.*,g.abbreviation from game_agenda a join games g on g.id=a.game_id')).rows;
    assert.equal(rows.length,16);
    const nte=rows.find(row=>row.title==='Akane Rin');
    assert.equal(new Date(nte.ends_at).toISOString(),'2026-11-10T21:59:00.000Z');
    const skirk=rows.find(row=>row.title==='Skirk');
    assert.equal(new Date(skirk.starts_at).toISOString(),'2026-10-13T23:00:00.000Z');
    assert.equal(new Date(skirk.ends_at).toISOString(),'2026-11-03T19:59:00.000Z');
    assert.equal(new Date(rows.find(row=>row.title==='Mortenax Blade').ends_at).toISOString(),'2026-11-10T20:00:00.000Z');
    assert.equal(rows.filter(row=>row.image_url).length,13);
    assert.equal(rows.filter(row=>row.kind==='banner'&&row.image_url).length,10);
    await db.exec("update public.game_agenda set image_url='' where title='Pearl'");
    const imagePatch=await readProjectFile('db/seeds/game-agenda-images-2026-10-25.sql');
    await db.exec(imagePatch);await db.exec(imagePatch);
    assert.match((await db.query("select image_url from game_agenda where title='Pearl'")).rows[0].image_url,/^https:\/\//);
    await db.exec("update public.game_agenda set image_url='https://example.org/custom.png' where title='Pearl'");
    await db.exec(imagePatch);
    assert.equal((await db.query("select image_url from game_agenda where title='Pearl'")).rows[0].image_url,'https://example.org/custom.png','The image complement preserves a manually chosen image');
    for(const row of rows) assert.match(row.source_url,/^https:\/\//);
});

for (const migrated of [false,true]) test(`shared agenda CRUD and personal receipts (${migrated?'upgrade':'fresh installation'})`,async t=>{
    const db=await createTestDatabase({migrated}); t.after(()=>db.close());
    await db.exec('set role anon');
    const gameId=Number((await db.query("select id from games where abbreviation='GI'")).rows[0].id);
    for(const profile of ['cran','demo']) await db.query('select set_profile_games($1,$2::bigint[],false)',[profile,[gameId]]);
    const save=async(value,id=null)=>(await db.query('select save_game_agenda($1::jsonb,$2) as entry',[JSON.stringify(value),id])).rows[0].entry;
    const list=async(profile)=>(await db.query('select list_profile_games($1) as games',[profile])).rows[0].games;
    const saved=await save({...entry,game_id:gameId});
    assert.equal((await list('cran'))[0].game_agenda.length,1);
    assert.deepEqual((await list('cran'))[0].game_agenda,(await list('demo'))[0].game_agenda);
    await db.query('select save_profile_game($1,$2::jsonb,$3)',['cran',JSON.stringify({abbreviation:'GI',current_stamina:87,pending_tasks:'Keep draft',game_notice_preferences:{maintenance:true,banner:false}}),gameId]);
    assert.equal((await list('demo'))[0].game_notice_preferences,undefined);
    const getNotices=async(profile)=>{const row=(await list(profile))[0];return getGameNotifications([{id:gameId,agenda:row.game_agenda,noticePreferences:row.game_notice_preferences}],new Date('2026-11-09T17:00:00Z'));};
    assert.equal((await getNotices('cran')).length,0);
    const notice=(await getNotices('demo'))[0];assert.equal(notice.unread,true);
    await db.query('select save_profile_game($1,$2::jsonb,$3)',['demo',JSON.stringify({abbreviation:'GI',[`agenda_notice_read_${saved.id}`]:{signature:notice.signature,stage:notice.stage}}),gameId]);
    assert.equal((await getNotices('demo'))[0].unread,false);
    assert.equal((await list('cran'))[0].game_agenda[0].read,null);
    await save({...entry,game_id:gameId,title:'Corrected characters'},saved.id);
    assert.equal((await getNotices('demo'))[0].unread,true);
    assert.equal((await list('cran'))[0].game_agenda[0].title,'Corrected characters');
    assert.equal((await list('cran'))[0].current_stamina,87);
    assert.equal((await list('cran'))[0].pending_tasks,'Keep draft');
    await assert.rejects(save({...entry,game_id:gameId,ends_at:entry.starts_at}));
    assert.equal((await list('cran'))[0].game_agenda.length,1,'A failed insert must not leave a partial record');
    await assert.rejects(save({...entry,game_id:gameId},999999),/não encontrado/);
    await db.query('select delete_game_agenda($1)',[saved.id]);
    assert.equal((await list('demo'))[0].game_agenda.length,0);
    assert.equal((await db.query('select list_game_agenda() as agenda')).rows[0].agenda.length,0);
});
