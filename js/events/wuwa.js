const AMERICA = '-05:00';
const GLOBAL = '+08:00';

// Field bases come from 3.7 notices and Game8; Moonlit Path uses Cristian's accepted estimate.
// See docs/wuwa-validation.md. Unknown editions must not silently inherit these clocks.
const editions = new Map([
    ['Cubie Wars', ['2026-09-30T11:00:00', GLOBAL, '11:59:59']],
    ['Dreams in the Capsule', ['2026-09-30T11:00:00', GLOBAL, '03:59:59']],
    ['Gifts of Waking Moon', ['2026-09-30T11:00:00', GLOBAL, '03:59:59']],
    // Cristian accepted the API reset proposal for this low-priority event on 2026-10-04.
    ['Moonlit Path', ['2026-09-30T11:00:00', GLOBAL, '03:59:59']],
    ["Artisan's Search", ['2026-10-08T04:00:00', AMERICA, '03:59:59']],
    ['Echo Erase', ['2026-10-22T10:00:00', AMERICA, '03:59:59']],
    ['Gifts of Singing Drizzle', ['2026-10-22T10:00:00', AMERICA, '03:59:59']],
    ['Beyond the Waves: Land of Xuanfang', ['2026-10-29T04:00:00', AMERICA, '03:59:59']],
].map(([name, policy]) => [name.toLocaleLowerCase('en-US'), policy]));
const recurring = new Set(['bountiful crescendo', 'chord cleansing']);
const hasTime = (value, time) => typeof value === 'string' && value.endsWith(`T${time}`);

export function resolveWuwaTimes(activity) {
    const name = activity.name.normalize('NFKC').trim().replace(/\s+/g, ' ').toLocaleLowerCase('en-US');
    const edition = editions.get(name);
    if (recurring.has(name) && hasTime(activity.startTime, '04:00:00') && hasTime(activity.endTime, '03:59:59')) {
        return { startOffset: AMERICA, endOffset: AMERICA };
    }
    if (edition && activity.startTime === edition[0] && hasTime(activity.endTime, edition[2])) {
        return { startOffset: edition[1], endOffset: AMERICA };
    }
    return { startOffset: null, endOffset: null,
        reviewReason: 'Horários desta edição do WuWa ainda não confirmados; confira o servidor América no Game8 antes de aprovar.' };
}
