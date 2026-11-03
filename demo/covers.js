import { hasDemoEventCover } from './catalogue.js';

// Share checks between Tasks, review and Games favorites. A path alone is not a photo.
export function createDemoCoverChecker({ createImage = () => new Image(), timeoutMs = 15_000 } = {}) {
    const checks = new Map();
    return async path => {
        if (!hasDemoEventCover(path)) return false;
        if (!checks.has(path)) checks.set(path, new Promise(resolve => {
            const image = createImage();
            let timeout;
            const finish = available => {
                clearTimeout(timeout);
                image.onload = image.onerror = null;
                resolve(available);
            };
            image.onload = () => finish(image.naturalWidth > 0);
            image.onerror = () => finish(false);
            timeout = setTimeout(() => finish(false), timeoutMs);
            image.src = new URL(`../${path}`, import.meta.url).href;
        }));
        const available = await checks.get(path);
        if (!available) checks.delete(path);
        return available;
    };
}
