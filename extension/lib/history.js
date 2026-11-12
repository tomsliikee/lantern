// What was opened for what was typed, to rank by use. Kept as plain data,
// read once and written at most once per close.
//
// Each opening counts once for every start of the query (up to eight
// letters), so after opening Firefox for "fire" a lone "f" finds it first
// too. A count loses half its weight every two weeks, so a habit that ended
// stops ranking.

export const HALF_LIFE_MS = 14 * 24 * 3600 * 1000;
export const MAX_ENTRIES = 400;
const PREFIX_LETTERS = 8;
const WEEK_MS = 7 * 24 * 3600 * 1000;
// Kept per result for "used 41 times this week".
const MAX_TIMES = 60;
// The most a habit adds to a match: enough to lift a word match above a
// plain prefix of another name, never a scattered match above a prefix.
const MAX_BOOST = 180;

export function empty() {
    return {version: 1, prefixes: {}, times: {}};
}

const decayed = ([weight, at], now) => weight * 2 ** (-(now - at) / HALF_LIFE_MS);

// A stored file's content; anything that is not a history becomes an empty one.
export function parse(text) {
    try {
        const data = JSON.parse(text);
        if (data?.version !== 1 || typeof data.prefixes !== 'object' || typeof data.times !== 'object')
            return empty();
        const prefixes = {};
        for (const [key, value] of Object.entries(data.prefixes)) {
            if (Array.isArray(value) && value.length === 2 && value.every(Number.isFinite))
                prefixes[key] = value;
        }
        const times = {};
        for (const [id, list] of Object.entries(data.times)) {
            if (Array.isArray(list))
                times[id] = list.filter(Number.isFinite).slice(-MAX_TIMES);
        }
        return {version: 1, prefixes, times};
    } catch {
        return empty();
    }
}

export function serialize(history) {
    return JSON.stringify(history);
}

const key = (prefix, id) => `${prefix}\u0000${id}`;
const startsOf = query => {
    const text = query.trim().toLowerCase().slice(0, PREFIX_LETTERS);
    const list = [];
    for (let i = 1; i <= text.length; i++)
        list.push(text.slice(0, i));
    return list;
};

// Keeps the entries that weigh most today.
export function prune(history, now, cap = MAX_ENTRIES) {
    const entries = Object.entries(history.prefixes);
    if (entries.length > cap) {
        entries.sort((a, b) => decayed(b[1], now) - decayed(a[1], now));
        history.prefixes = Object.fromEntries(entries.slice(0, cap));
    }
    const ids = Object.keys(history.times);
    for (const id of ids) {
        history.times[id] = history.times[id].filter(t => now - t < WEEK_MS);
        if (history.times[id].length === 0)
            delete history.times[id];
    }
    return history;
}

// id was opened for query at now (milliseconds).
export function record(history, query, id, now) {
    for (const prefix of startsOf(query)) {
        const k = key(prefix, id);
        const before = history.prefixes[k];
        history.prefixes[k] = [(before ? decayed(before, now) : 0) + 1, now];
    }
    const times = history.times[id] ?? [];
    times.push(now);
    history.times[id] = times.slice(-MAX_TIMES);
    return prune(history, now);
}

// What use adds to the score of id for query.
export function boost(history, query, id, now) {
    const text = query.trim().toLowerCase().slice(0, PREFIX_LETTERS);
    if (!text)
        return 0;
    const entry = history.prefixes[key(text, id)];
    if (!entry)
        return 0;
    // log keeps ten openings from being worth ten times one.
    return Math.min(MAX_BOOST, Math.round(60 * Math.log2(1 + decayed(entry, now))));
}

// How often id was opened in the last seven days.
export function usesThisWeek(history, id, now) {
    return (history.times[id] ?? []).filter(t => now - t < WEEK_MS).length;
}

export function forget(history) {
    history.prefixes = {};
    history.times = {};
    return history;
}
