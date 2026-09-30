import { GENSHIN_CALENDAR_URL, normalizeGenshinEvents } from '../js/events/genshinCalendar.js';

async function previewGenshinEvents() {
    const response = await fetch(GENSHIN_CALENDAR_URL);
    if (!response.ok) throw new Error(`Calendar request failed with HTTP ${response.status}`);

    const { candidates, skipped } = normalizeGenshinEvents(await response.json());
    console.table(candidates.map(candidate => ({
        id: candidate.external_id,
        name: candidate.name,
        asiaEndUtc: candidate.source_end_at,
        americaEndUtc: candidate.proposed_end_at,
        reviewReason: candidate.review_reason,
    })));
    console.log(`${skipped} records omitted. Dates without a known server-time rule require review.`);
}

previewGenshinEvents().catch(error => {
    console.error(error);
    process.exitCode = 1;
});
