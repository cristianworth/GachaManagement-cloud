 // js\utils\dateUtils.js
 export function formatDateToDayHour(date) {
    const today = new Date();
    const diffMs = date - today;
    const diffHours = Math.ceil(diffMs / (1000 * 60 * 60)); // milissegundos para horas

    let day = date.getDate();
    let hour = date.getHours();
    let minutes = date.getMinutes();

    return `Day ${day} at ${hour}:${minutes < 10 ? '0' + minutes : minutes}  (${diffHours}h left)`;
}

export function calculateMaxStaminaDate(game) {
    let totalStaminaLeft = game.capStamina - game.currentStamina;
    let howManyMinutesUntilCapped = totalStaminaLeft * game.staminaPerMinute;

    let forecastDate = new Date();
    forecastDate.setMinutes(forecastDate.getMinutes() + howManyMinutesUntilCapped);

    return forecastDate;
}

export function getExpirationDate(expirationDay, expirationHour) {
    let currentDate = new Date();
    currentDate.setDate(currentDate.getDate() + expirationDay);
    currentDate.setHours(currentDate.getHours() + expirationHour);

    return currentDate;
}

export function getNextRecurringDeadline(previousDate, days, now = new Date(), { utc = false } = {}) {
    if (!Number.isInteger(days) || days < 1) throw new Error('Invalid repeat interval.');
    const next = new Date(previousDate);
    if (Number.isNaN(next.getTime())) throw new Error('Invalid recurring deadline.');
    // Manual/legacy cycles keep their local time; managed America weeklies use UTC.
    while (next <= now) {
        if (utc) next.setUTCDate(next.getUTCDate() + days);
        else next.setDate(next.getDate() + days);
        if (Number.isNaN(next.getTime())) throw new Error('Repeat interval exceeds the supported date range.');
    }
    return next;
}

 export function formatDateForInput(date) {
    const d = new Date(date);
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    const hours = String(d.getHours()).padStart(2, '0');
    const minutes = String(d.getMinutes()).padStart(2, '0');
    
    return `${year}-${month}-${day}T${hours}:${minutes}`;
 }

export function formatTimeUntil(deadline, now = Date.now()) {
    const remainingMs = new Date(deadline).getTime() - now;
    if (Number.isNaN(remainingMs)) return 'Informe um prazo válido para ver o tempo restante.';
    if (remainingMs <= 0) return 'Prazo encerrado.';

    const totalHours = Math.floor(remainingMs / (60 * 60 * 1000));
    if (totalHours === 0) return 'Falta menos de 1 hora.';
    const days = Math.floor(totalHours / 24);
    const hours = totalHours % 24;
    return `Faltam ${days} ${days === 1 ? 'dia' : 'dias'} e ${hours} ${hours === 1 ? 'hora' : 'horas'}.`;
}

export function formatDateForDisplay(date) {
    const today = new Date();
    const diffMs = date - today;
    const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24)); // milissegundos para dias

    const day = date.getDate().toString().padStart(2, '0');
    const month = (date.getMonth() + 1).toString().padStart(2, '0'); // Janeiro é 0!
    const year = date.getFullYear();
    const hours = date.getHours().toString().padStart(2, '0');
    const minutes = date.getMinutes().toString().padStart(2, '0');

    return `${day}/${month}/${year} ${hours}:${minutes} (${diffDays}d left)`;
}
