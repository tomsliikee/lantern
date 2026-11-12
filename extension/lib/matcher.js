// Matches what is typed against a name, and says which letters matched.
//
// A name is prepared once (folded to lowercase without accents, with the
// start of every word noted), so a keystroke only compares strings. Scores
// are coarse classes, best first; within a class a shorter name and an
// earlier match win, so "fire" puts Firefox above Firewall-cmd-gui.

export const SCORE = {
    exact: 1000,
    prefix: 900,
    words: 760,
    wordPrefix: 740,
    initials: 620,
    substring: 420,
    keyword: 380,
    scattered: 200,
};

// The lowest score that may stand as the top hit: a name that starts with
// what was typed, or one of whose words does.
export const TOP_HIT_SCORE = SCORE.initials;

const isWordChar = ch => /[\p{L}\p{N}]/u.test(ch);
const isUpper = ch => ch !== ch.toLowerCase() && ch === ch.toUpperCase();
const isDigit = ch => ch >= '0' && ch <= '9';

// Lowercase, without accents: "Éclair" and "eclair" are the same word.
export function fold(text) {
    return text.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
}

// text: the name as shown. Returns the folded name, for each of its
// characters the index in the shown name it came from, and where its
// words start.
export function prepare(text) {
    const shown = text ?? '';
    let folded = '';
    const origin = [];
    const starts = [];
    let previous = '';
    let index = 0;
    for (const ch of shown) {
        const piece = fold(ch);
        const startsWord = isWordChar(ch) && (
            previous === '' || !isWordChar(previous) ||
            (isUpper(ch) && !isUpper(previous) && !isDigit(previous)) ||
            (isDigit(ch) !== isDigit(previous)));
        if (startsWord)
            starts.push(folded.length);
        for (let i = 0; i < piece.length; i++) {
            folded += piece[i];
            origin.push(index);
        }
        previous = ch;
        index += ch.length;
    }
    return {text: shown, folded, origin, starts};
}

// The terms of a query: folded, split at spaces, empty ones dropped.
export function terms(query) {
    return fold(query ?? '').split(/\s+/).filter(term => term.length > 0);
}

// Positions in the shown name for a run of folded characters.
function shownRange(prepared, from, length) {
    const positions = [];
    for (let i = from; i < from + length; i++) {
        const at = prepared.origin[i];
        if (positions[positions.length - 1] !== at)
            positions.push(at);
    }
    return positions;
}

const lengthPenalty = prepared => Math.min(60, prepared.folded.length) * 0.5;

// Letters of term at the starts of words, in order: "gs" in "GNOME Settings".
function initials(term, prepared) {
    if (term.length < 2 || term.length > prepared.starts.length)
        return null;
    const used = [];
    let at = 0;
    for (const start of prepared.starts) {
        if (prepared.folded[start] === term[at]) {
            used.push(start);
            at++;
            if (at === term.length)
                return used;
        }
    }
    return null;
}

// The letters of term in order with small gaps, starting at a word: "ffx"
// in Firefox, "thdbird" in Thunderbird. Only for three letters or more, so a
// short query does not light up half of every name.
function scattered(term, prepared) {
    if (term.length < 3)
        return null;
    const {folded, starts} = prepared;
    for (const start of starts) {
        if (folded[start] !== term[0])
            continue;
        const used = [start];
        let from = start + 1;
        for (const ch of term.slice(1)) {
            const at = folded.indexOf(ch, from);
            if (at < 0)
                break;
            used.push(at);
            from = at + 1;
        }
        if (used.length === term.length && used[used.length - 1] - start < term.length * 3)
            return used;
    }
    return null;
}

// One term against a prepared name: {score, folded indices} or null.
function matchTerm(term, prepared) {
    const {folded, starts} = prepared;
    if (folded === term)
        return {score: SCORE.exact, used: [...term].map((_, i) => i)};
    if (folded.startsWith(term))
        return {score: SCORE.prefix, used: [...term].map((_, i) => i)};
    for (let w = 1; w < starts.length; w++) {
        if (folded.startsWith(term, starts[w]))
            return {score: SCORE.wordPrefix - w * 4, used: [...term].map((_, i) => starts[w] + i)};
    }
    const acronym = initials(term, prepared);
    if (acronym)
        return {score: SCORE.initials, used: acronym};
    const at = folded.indexOf(term);
    if (at >= 0)
        return {score: SCORE.substring - Math.min(40, at), used: [...term].map((_, i) => at + i)};
    const loose = scattered(term, prepared);
    if (loose) {
        const spread = loose[loose.length - 1] - loose[0] - term.length + 1;
        return {score: SCORE.scattered - Math.min(100, spread * 4), used: loose};
    }
    return null;
}

// query: the terms from terms(). Returns {score, positions} with positions
// as indices into the shown name, or null when it does not match.
export function match(queryTerms, prepared) {
    if (queryTerms.length === 0 || !prepared)
        return null;
    if (queryTerms.length === 1) {
        const found = matchTerm(queryTerms[0], prepared);
        if (!found)
            return null;
        const used = [...new Set(found.used)].sort((a, b) => a - b);
        return {
            score: found.score - lengthPenalty(prepared),
            positions: used.flatMap(i => shownRange(prepared, i, 1)),
        };
    }
    // Several terms: each has to start a word, in any order. "code vis"
    // finds "Visual Studio Code".
    const whole = queryTerms.join(' ');
    if (prepared.folded.startsWith(whole)) {
        return {
            score: SCORE.prefix - lengthPenalty(prepared),
            positions: shownRange(prepared, 0, whole.length).filter(i => prepared.text[i] !== ' '),
        };
    }
    const used = new Set();
    for (const term of queryTerms) {
        const start = prepared.starts.find(s => prepared.folded.startsWith(term, s) && !used.has(s));
        if (start === undefined)
            return null;
        for (let i = 0; i < term.length; i++)
            used.add(start + i);
    }
    const sorted = [...used].sort((a, b) => a - b);
    return {
        score: SCORE.words - lengthPenalty(prepared),
        positions: sorted.flatMap(i => shownRange(prepared, i, 1)),
    };
}

// The best match among a name and its quieter companions (generic name,
// keywords, file name of the program). Only the name is highlighted; a
// match elsewhere scores as a keyword at most.
export function matchAny(queryTerms, name, others = []) {
    const best = match(queryTerms, name);
    let other = null;
    for (const candidate of others) {
        const found = match(queryTerms, candidate);
        // A companion has to match at the start of a word or by initials;
        // letters found somewhere in a long description are noise.
        if (found && found.score >= SCORE.initials - lengthPenalty(candidate) && (!other || found.score > other.score))
            other = found;
    }
    if (other) {
        const capped = Math.min(other.score, SCORE.keyword + (other.score >= SCORE.wordPrefix - 40 ? 60 : 0));
        if (!best || capped > best.score)
            return {score: capped, positions: []};
    }
    return best;
}
