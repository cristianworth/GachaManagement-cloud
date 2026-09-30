import { normalizeGenshinEvents } from '../js/events/genshinCalendar.js';

const seconds = iso => Date.parse(iso) / 1000;

test('converts the Silverwing Asia deadline to the America server deadline', () => {
    const calendar = { events: [{
        id: 446,
        name: 'Silverwing in Pursuit of the Moon',
        type_name: 'ActTypeOther',
        start_time: seconds('2026-09-24T02:00:00Z'),
        end_time: seconds('2026-10-11T19:59:59Z'),
    }] };

    const { candidates } = normalizeGenshinEvents(calendar, Date.parse('2026-09-29T00:00:00Z'));
    expect(candidates[0].proposed_end_at).toBe('2026-10-12T08:59:59.000Z');
    expect(candidates[0].review_reason).toBeNull();
});

test('holds unknown deadline patterns and missing dates for review', () => {
    const calendar = { events: [
        { id: 1, name: 'Different hour', start_time: 1, end_time: seconds('2026-11-03T06:59:59Z') },
        { id: 2, name: 'No deadline', start_time: 0, end_time: 0 },
    ] };

    const { candidates } = normalizeGenshinEvents(calendar, Date.parse('2026-09-29T00:00:00Z'));
    expect(candidates).toHaveLength(2);
    expect(candidates.every(candidate => candidate.proposed_end_at === null && candidate.review_reason)).toBe(true);
});

test('omits events whose possible America deadline has passed', () => {
    const calendar = { events: [{
        id: 3, name: 'Ended', start_time: 1,
        end_time: seconds('2026-09-28T19:59:59Z'),
    }] };
    expect(normalizeGenshinEvents(calendar, Date.parse('2026-09-29T12:00:00Z')).candidates).toHaveLength(0);
});
