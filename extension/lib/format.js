// Small texts shown under a result: sizes, dates, folders.

const UNITS = ['B', 'KB', 'MB', 'GB', 'TB'];

export function size(bytes) {
    if (!Number.isFinite(bytes) || bytes < 0)
        return '';
    let value = bytes;
    let step = 0;
    while (value >= 1000 && step < UNITS.length - 1) {
        value /= 1000;
        step++;
    }
    const digits = step === 0 || value >= 10 ? 0 : 1;
    return `${value.toFixed(digits)} ${UNITS[step]}`;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const DAY_MS = 24 * 3600 * 1000;

const startOfDay = ms => {
    const date = new Date(ms);
    date.setHours(0, 0, 0, 0);
    return date.getTime();
};

// When a file was last changed, as a person would say it.
// labels: translated words {today, yesterday}, so this stays pure.
export function when(ms, now, labels = {today: 'today', yesterday: 'yesterday'}) {
    if (!Number.isFinite(ms))
        return '';
    const days = Math.round((startOfDay(now) - startOfDay(ms)) / DAY_MS);
    if (days <= 0)
        return labels.today;
    if (days === 1)
        return labels.yesterday;
    const date = new Date(ms);
    const sameYear = date.getFullYear() === new Date(now).getFullYear();
    return sameYear
        ? `${date.getDate()} ${MONTHS[date.getMonth()]}`
        : `${date.getDate()} ${MONTHS[date.getMonth()]} ${date.getFullYear()}`;
}

// A folder with the home folder written as "~".
export function folder(path, home) {
    if (!path)
        return '';
    if (home && (path === home || path.startsWith(`${home}/`)))
        return `~${path.slice(home.length)}`;
    return path;
}

// The web address for a search: template with %s, the query escaped.
export function searchUrl(template, query) {
    const escaped = encodeURIComponent(query.trim()).replace(/%20/g, '+');
    return template.includes('%s') ? template.replace('%s', escaped) : `${template}${escaped}`;
}

// What LocalSearch's full-text match is asked: every word as a prefix,
// with what its syntax would read as an operator left out. Lowercase, so
// a typed OR or NOT is a word and not an operator; matching ignores case.
export function ftsQuery(query) {
    const words = (query ?? '').normalize('NFC').split(/\s+/)
        .map(word => word.replace(/[^\p{L}\p{N}]/gu, '').toLowerCase())
        .filter(word => word.length > 0);
    return words.length === 0 ? null : words.map(word => `${word}*`).join(' ');
}

// A long result such as 6.21371192237 would run out of the answer card at
// 64 px; the card shows seven significant digits and Enter copies them all.
// Whole numbers and exponents keep their size and go to exponent form.
export function shortNumber(text) {
    const value = Number(text.replace(',', '.'));
    if (text.length <= 9 || !Number.isFinite(value))
        return text;
    if (/e/i.test(text))
        return text;
    if (!/[.,]/.test(text))
        return value.toExponential(5).replace(/\.?0+e/, 'e').replace('e+', 'e');
    return String(Number.parseFloat(value.toPrecision(7)));
}
