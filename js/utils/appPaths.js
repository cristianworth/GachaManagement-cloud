export function getAppBasePath(location) {
    if (!location.hostname.includes('github.io')) return '';
    const repository = location.pathname.split('/')[1];
    return repository ? `/${repository}` : '';
}
