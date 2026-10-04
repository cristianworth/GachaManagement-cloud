const AMERICA = '-05:00';
const GLOBAL = '+08:00';

// Version 1.4 notices explicitly distinguish fixed UTC+8 and server-time events.
// Game8 confirms America UTC-5; see docs/nte-validation.md for the field evidence.
const editions = new Map([
    ['Circle Gifts', ['2026-09-30T11:00:00', '2026-11-11T05:59:59', GLOBAL, GLOBAL]],
    ['Pukaland Travelogue', ['2026-09-30T11:00:00', '2026-11-11T05:59:59', GLOBAL, GLOBAL]],
    ['Born to Race', ['2026-09-30T11:00:00', '2026-11-11T05:59:59', GLOBAL, GLOBAL]],
    ['Everdriving', ['2026-09-30T11:00:00', '2026-11-11T05:59:59', GLOBAL, GLOBAL]],
    ['Terminal Depths', ['2026-09-30T11:00:00', '2026-11-11T05:59:59', GLOBAL, GLOBAL]],
    ['Circle Bounty', ['2026-09-30T11:00:00', '2026-11-10T23:59:59', GLOBAL, GLOBAL]],
    ['Stamina Recharge', ['2026-10-05T05:00:00', '2026-10-19T04:59:59', AMERICA, AMERICA]],
    ["Coal Lump's Treasure", ['2026-10-08T10:00:00', '2026-11-11T05:59:59', GLOBAL, GLOBAL]],
    ['Pixel Surge', ['2026-10-19T05:00:00', '2026-10-26T04:59:59', AMERICA, AMERICA]],
].map(([name, policy]) => [name.toLocaleLowerCase('en-US'), policy]));

export function resolveNteTimes(activity) {
    const name = activity.name.normalize('NFKC').trim().replace(/\s+/g, ' ').toLocaleLowerCase('en-US');
    const edition = editions.get(name);
    if (edition && activity.startTime === edition[0] && activity.endTime === edition[1]) {
        return { startOffset: edition[2], endOffset: edition[3] };
    }
    return { startOffset: null, endOffset: null,
        reviewReason: 'Horários desta edição do NTE ainda não confirmados; confira América no Game8 e o fuso explícito do anúncio oficial antes de aprovar.' };
}
