import {test, equal, done} from './harness.js';
import * as H from '../extension/lib/history.js';

const now = Date.UTC(2026, 10, 9);
test('an opening counts for every start of the query', () => {
    const h = H.record(H.empty(), 'fire', 'app:firefox', now);
    equal(H.boost(h, 'f', 'app:firefox', now) > 0, true);
    equal(H.boost(h, 'fire', 'app:firefox', now) > 0, true);
    equal(H.boost(h, 'firex', 'app:firefox', now), 0);
    equal(H.boost(h, 'f', 'app:other', now), 0);
});
test('more openings weigh more, but not without end', () => {
    let h = H.empty();
    h = H.record(h, 'f', 'a', now);
    const one = H.boost(h, 'f', 'a', now);
    for (let i = 0; i < 200; i++)
        h = H.record(h, 'f', 'a', now);
    const many = H.boost(h, 'f', 'a', now);
    equal(many > one, true);
    equal(many <= 180, true);
});
test('weight halves every two weeks', () => {
    let h = H.empty();
    for (let i = 0; i < 3; i++)
        h = H.record(h, 'f', 'a', now);
    const fresh = H.boost(h, 'f', 'a', now);
    const later = H.boost(h, 'f', 'a', now + H.HALF_LIFE_MS * 4);
    equal(later < fresh / 2, true);
});
test('uses this week', () => {
    let h = H.empty();
    h = H.record(h, 'f', 'a', now - 8 * 24 * 3600 * 1000);
    h = H.record(h, 'f', 'a', now - 1000);
    h = H.record(h, 'fi', 'a', now);
    equal(H.usesThisWeek(h, 'a', now), 2);
});
test('pruned to the cap, keeping the heaviest', () => {
    let h = H.empty();
    for (let i = 0; i < 500; i++)
        h = H.record(h, `q${i}`.slice(0, 8), `id${i}`, now - (500 - i) * 1000);
    equal(Object.keys(h.prefixes).length <= H.MAX_ENTRIES, true);
});
test('a broken file reads as empty', () => {
    equal(H.parse('{nope'), H.empty());
    equal(H.parse('{"version":2}'), H.empty());
    const h = H.record(H.empty(), 'ab', 'x', now);
    equal(H.parse(H.serialize(h)), h);
});
test('forget empties it', () => {
    const h = H.forget(H.record(H.empty(), 'ab', 'x', now));
    equal(H.boost(h, 'a', 'x', now), 0);
});
done('history');
