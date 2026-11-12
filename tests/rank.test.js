import {test, equal, done} from './harness.js';
import {arrange, flatten, best} from '../extension/lib/rank.js';

const r = (id, score, title = id) => ({id, score, title});
test('the best result that may be top becomes the top hit and leaves its group', () => {
    const a = arrange([
        {id: 'apps', title: 'Apps', canTop: true, results: [r('ff', 890), r('fw', 880)]},
        {id: 'files', title: 'Files', canTop: false, results: [r('doc', 990)]},
    ]);
    equal(a.top.id, 'ff');
    equal(a.groups.map(g => [g.id, g.results.map(x => x.id)]), [['apps', ['fw']], ['files', ['doc']]]);
});
test('a weak match is never the top hit', () => {
    const a = arrange([{id: 'apps', title: 'Apps', canTop: true, results: [r('ff', 150)]}]);
    equal(a.top, null);
    equal(a.groups[0].results.length, 1);
});
test('groups keep the order of the sources, empty ones vanish', () => {
    const a = arrange([
        {id: 'apps', title: 'Apps', canTop: true, results: []},
        {id: 'settings', title: 'Settings', canTop: true, results: [r('s', 100)]},
        {id: 'files', title: 'Files', canTop: false, results: [r('f', 300)]},
    ]);
    equal(a.groups.map(g => g.id), ['settings', 'files']);
});
test('a locked top hit stays when better results arrive', () => {
    const top = r('ff', 800);
    const a = arrange([{id: 'apps', title: 'Apps', canTop: true, results: [top, r('better', 999)]}], {lockedTop: top});
    equal(a.top.id, 'ff');
    equal(flatten(a).map(x => x.id), ['ff', 'better']);
});
test('at most six per group, ties by title', () => {
    const many = Array.from({length: 9}, (_, i) => r(`x${i}`, 100, `t${9 - i}`));
    equal(best(many).length, 6);
    equal(best(many)[0].title, 't1');
});
done('rank');
