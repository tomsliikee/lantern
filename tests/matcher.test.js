import {test, equal, done} from './harness.js';
import {prepare, terms, match, matchAny, SCORE, TOP_HIT_SCORE, fold} from '../extension/lib/matcher.js';

const m = (q, name) => match(terms(q), prepare(name));

test('a prefix scores above a later word', () => {
    equal(m('fire', 'Firefox').score > m('fire', 'Campfire Notes').score, true);
});
test('a shorter name wins within the same class', () => {
    equal(m('fire', 'Firefox').score > m('fire', 'Firewall Configuration').score, true);
});
test('positions are the matched letters of the shown name', () => {
    equal(m('fire', 'Firefox').positions, [0, 1, 2, 3]);
    equal(m('note', 'Campfire Notes').positions, [9, 10, 11, 12]);
});
test('a camelCase boundary starts a word', () => {
    equal(prepare('LibreOffice').starts, [0, 5]);
    equal(m('off', 'LibreOffice').positions, [5, 6, 7]);
});
test('initials match the starts of words', () => {
    const found = m('gs', 'GNOME Settings');
    equal(found.score > SCORE.substring, true);
    equal(found.positions, [0, 6]);
});
test('several terms in any order', () => {
    const found = m('code vis', 'Visual Studio Code');
    equal(found !== null, true);
    equal(found.positions, [0, 1, 2, 14, 15, 16, 17]);
});
test('accents are folded', () => {
    equal(fold('Éclair Ü'), 'eclair u');
    equal(m('eclair', 'Éclair').positions, [0, 1, 2, 3, 4, 5]);
});
test('scattered letters need three of them', () => {
    equal(m('fx', 'Firefox'), null);
    equal(m('ffx', 'Firefox') !== null, true);
    equal(m('ffx', 'Firefox').score < TOP_HIT_SCORE, true);
});
test('no match is null', () => {
    equal(m('zzz', 'Firefox'), null);
    equal(m('', 'Firefox'), null);
});
test('a keyword match is quieter and highlights nothing', () => {
    const found = matchAny(terms('browser'), prepare('Firefox'), [prepare('Web Browser')]);
    equal(found.positions, []);
    equal(found.score <= SCORE.keyword + 60, true);
    equal(found.score < m('fire', 'Firefox').score, true);
});
test('the name wins over a keyword when both match', () => {
    const found = matchAny(terms('fire'), prepare('Firefox'), [prepare('fire')]);
    equal(found.positions, [0, 1, 2, 3]);
});
test('ligature-like folding keeps positions in range', () => {
    const p = prepare('İstanbul');
    const found = match(terms('ist'), p);
    equal(found.positions.every(i => i < p.text.length), true);
});
done('matcher');
