// Puts the results of all sources in order: one top hit and groups below it.
//
// Groups keep the order of their sources, and the sources are ordered by
// cost, so a slow source's results arrive below everything already shown
// and never move the top hit or the selected row.

import {TOP_HIT_SCORE} from './matcher.js';

export const PER_GROUP = 6;

// One source's results, best first, at most limit of them.
export function best(results, limit = PER_GROUP) {
    return [...results].sort((a, b) => b.score - a.score || a.title.localeCompare(b.title)).slice(0, limit);
}

// sections: [{id, title, results, canTop}] in the order of the sources.
// Returns {top, groups: [{id, title, results}]}. The top hit is the best
// result of a source that may give one, when it matches well enough; it
// is taken out of its group.
export function arrange(sections, {lockedTop = null} = {}) {
    let top = null;
    if (lockedTop) {
        top = lockedTop;
    } else {
        for (const section of sections) {
            if (!section.canTop)
                continue;
            for (const result of section.results) {
                if (result.score >= TOP_HIT_SCORE && (!top || result.score > top.score))
                    top = result;
            }
        }
    }
    const groups = [];
    for (const section of sections) {
        const results = best(section.results.filter(r => r !== top && r.id !== top?.id));
        if (results.length > 0)
            groups.push({id: section.id, title: section.title, results});
    }
    return {top, groups};
}

// The rows in the order the keyboard walks them.
export function flatten({top, groups}) {
    const rows = top ? [top] : [];
    for (const group of groups)
        rows.push(...group.results);
    return rows;
}

export function count(arrangement) {
    return flatten(arrangement).length;
}
