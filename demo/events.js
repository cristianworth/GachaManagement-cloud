import { EVENT_GAMES } from '../js/events/eventGames.js';
import { assignEditionKeys } from '../js/events/eventCatalogue.js';
import { validateDemoCatalogue, isCurrentDemoEvent, hasDemoEventCover } from './catalogue.js';

// Only the browser-local demo uses this migration. Production schema/RPCs remain unchanged.
export async function prepareDemoEvents(db) {
    await db.transaction(async tx => {
        await tx.exec(`reset role;
            alter table public.demo_metadata add column if not exists event_state jsonb not null default '{}';
            alter table public.demo_metadata add column if not exists examples_version integer not null default 1;`);
        const metadata = (await tx.query('select * from public.demo_metadata where id = 1 for update')).rows[0];
        if (metadata.examples_version < 2) {
            const sample = [
                ['Finalizar a atividade com prazo encerrado',-1],
                ['Explorar todos os caminhos da nova região e concluir os desafios opcionais antes do próximo ciclo',2],
                ['Conferir as recompensas da próxima fase',5], ['Materiais de ascensão',6], ['Explorar a cidade',8],
            ];
            for (const [description,days] of sample) {
                const rows = (await tx.query(`select t.id,t.game_id,t.game_description,pt.profile_id,
                    pt.description,pt.refresh_type,pt.repeat_days,pt.is_done from public.tasks t
                    join public.profile_tasks pt on pt.task_id=t.id and pt.profile_id=t.owner_profile_id
                    where pt.description=$1 and pt.refresh_type=0 and not pt.deleted
                    and pt.expiration_date=$2::timestamptz + $3 * interval '1 day'
                    and not exists(select 1 from public.event_candidates c where c.task_id=t.id)`,
                [description,metadata.seeded_at,days])).rows;
                for (const row of rows) {
                    if (days < 0) await tx.query('select public.remove_profile_task($1,$2)',[row.profile_id,row.id]);
                    else await tx.query('select public.save_profile_task($1,$2::jsonb,$3)',
                        [row.profile_id,JSON.stringify({...row,expiration_date:null,start_at:null}),row.id]);
                }
            }
            await tx.exec(`update public.event_candidates set is_active=false where external_id like 'design-preview-%';
                update public.demo_metadata set examples_version=2 where id=1;`);
        }
        await tx.exec('set role anon');
    });
}

async function syncSource(tx, entry, revision, now) {
    const metadata = (await tx.query('select event_state from public.demo_metadata where id=1 for update')).rows[0];
    const previous = metadata.event_state[entry.key];
    const game = EVENT_GAMES.find(game => game.key === entry.key);
    const games = (await tx.query('select id from public.games where abbreviation=$1',[game.abbreviation])).rows;
    if (games.length !== 1) throw new Error('Catálogo local de jogos inválido.');
    const gameId = games[0].id;
    await tx.query('select public.cleanup_expired_imported_events($1,$2)',[game.source,new Date(now).toISOString()]);
    // Even an unchanged snapshot ages while offline; unknown expired periods leave review.
    await tx.query(`update public.event_candidates set is_active=false where source=$1 and
        ((proposed_end_at is not null and proposed_end_at <= $2) or
        (proposed_end_at is null and source_end_at <= $2))`,[game.source,new Date(now).toISOString()]);
    if (previous && Date.parse(previous.capturedAt) > Date.parse(entry.capturedAt)) return;
    if (previous?.revision === revision) return;
    const existing = (await tx.query('select * from public.event_candidates where source=$1 and game_id=$2',[game.source,gameId])).rows;
    const candidates = entry.events.filter(event => hasDemoEventCover(event.cover_url) && isCurrentDemoEvent(event,now)).map(event => ({...event}));
    assignEditionKeys(candidates,existing);
    const seen = [];
    for (const candidate of candidates) {
        const values = [candidate.source,candidate.external_id,candidate.name,gameId,candidate.source_start_at,
            candidate.source_end_at,candidate.proposed_start_at,candidate.proposed_end_at,candidate.cover_url,candidate.review_reason,
            entry.capturedAt];
        const row = (await tx.query(`insert into public.event_candidates
            (source,external_id,name,game_id,source_start_at,source_end_at,proposed_start_at,proposed_end_at,cover_url,review_reason,last_seen_at)
            values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
            on conflict(source,external_id) do update set name=excluded.name,source_start_at=excluded.source_start_at,
            source_end_at=excluded.source_end_at,proposed_start_at=excluded.proposed_start_at,proposed_end_at=excluded.proposed_end_at,
            cover_url=excluded.cover_url,review_reason=excluded.review_reason,is_active=true,last_seen_at=excluded.last_seen_at
            returning id`,values)).rows[0];
        seen.push(row.id);
    }
    await tx.query('update public.event_candidates set is_active=false where source=$1 and game_id=$2 and not(id=any($3::bigint[]))',
        [game.source,gameId,seen]);
    // Preserve the production import/expiry contracts, including manual deadlines and closed editions.
    await tx.query('select public.import_event_candidates($1)',[game.source]);
    await tx.query('select public.cleanup_expired_imported_events($1,$2)',[game.source,new Date(now).toISOString()]);
    await tx.query(`update public.demo_metadata set event_state=jsonb_set(event_state,array[$1],$2::jsonb) where id=1`,
        [entry.key,JSON.stringify({capturedAt:entry.capturedAt,revision,count:candidates.length})]);
}

export async function applyDemoCatalogue(db, catalogue, {now = Date.now()} = {}) {
    validateDemoCatalogue(catalogue);
    const failures = [];
    for (const entry of catalogue.games.filter(entry=>entry.available)) {
        try { await db.transaction(tx=>syncSource(tx,entry,catalogue.revision,now)); }
        catch { failures.push(entry.key); }
    }
    await db.transaction(async tx => {
        // Only the first API population supplies starter favorites. Visitor changes are never re-seeded.
        const metadata = (await tx.query('select event_state from public.demo_metadata where id=1 for update')).rows[0];
        if (!metadata.event_state.favoritesInitialized && Object.keys(metadata.event_state).length) {
            for (const profile of ['cran','demo','guest']) {
                await tx.query('select public.materialize_profile_tasks($1)',[profile]);
                const firsts = (await tx.query(`select distinct on(t.game_id) t.id from public.tasks t
                    join public.profile_tasks pt on pt.task_id=t.id and pt.profile_id=$1
                    join public.event_candidates c on c.task_id=t.id
                    where not pt.deleted and not pt.is_done and c.is_active and pt.expiration_date>$2
                    order by t.game_id,(c.cover_url like 'img/demo-events/%') desc,pt.expiration_date,t.id`,[profile,new Date(now).toISOString()])).rows;
                for (const task of firsts) await tx.query('select public.set_profile_task_favorite($1,$2,true)',[profile,task.id]);
            }
            await tx.exec(`update public.demo_metadata set event_state=event_state || '{"favoritesInitialized":true}'::jsonb where id=1`);
        }
    });
    return {failures,state:(await db.query('select event_state from public.demo_metadata where id=1')).rows[0].event_state};
}
