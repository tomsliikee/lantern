import {test, equal, done} from './harness.js';
import {normalize, same, conflicts, label} from '../extension/lib/shortcut.js';
import {size, when, folder, searchUrl, ftsQuery, shortNumber} from '../extension/lib/format.js';

test('shortcuts compare regardless of spelling', () => {
    equal(normalize('<Super>space'), '<Super>space');
    equal(same('<Primary>space', '<Control>space'), true);
    equal(same('<Shift><Super>space', '<Super><Shift>Space'), true);
    equal(same('<Super>space', '<Super><Shift>space'), false);
    equal(normalize(''), null);
    equal(normalize('<Super>'), null);
});
test('conflicts with the desktop', () => {
    const found = conflicts(['<Super>space'], [
        {schema: 'org.gnome.desktop.wm.keybindings', key: 'switch-input-source', accelerators: ['<Super>space', 'XF86Keyboard']},
        {schema: 'org.gnome.desktop.wm.keybindings', key: 'switch-input-source-backward', accelerators: ['<Shift><Super>space']},
    ]);
    equal(found.map(b => b.key), ['switch-input-source']);
});
test('shortcut labels', () => {
    equal(label('<Super>space'), 'Super+Space');
    equal(label('<Primary><Alt>t'), 'Ctrl+Alt+T');
});
test('sizes', () => {
    equal(size(4096), '4.1 KB');
    equal(size(3_200_000), '3.2 MB');
    equal(size(12), '12 B');
    equal(size(15_000), '15 KB');
});
test('dates as said', () => {
    const now = new Date(2026, 10, 9, 14).getTime();
    equal(when(new Date(2026, 10, 9, 1).getTime(), now), 'today');
    equal(when(new Date(2026, 10, 8, 23).getTime(), now), 'yesterday');
    equal(when(new Date(2026, 7, 14).getTime(), now), '14 Aug');
    equal(when(new Date(2025, 7, 14).getTime(), now), '14 Aug 2025');
});
test('folders under home', () => {
    equal(folder('/home/t/git/x', '/home/t'), '~/git/x');
    equal(folder('/home/tom/x', '/home/t'), '/home/tom/x');
});
test('search addresses', () => {
    equal(searchUrl('https://www.google.com/search?q=%s', 'quokka habitat'), 'https://www.google.com/search?q=quokka+habitat');
    equal(searchUrl('https://x/?q=%s', 'a&b'), 'https://x/?q=a%26b');
});
test('full-text queries are safe', () => {
    equal(ftsQuery('fire wall'), 'fire* wall*');
    equal(ftsQuery('"a" OR b*'), 'a* or* b*');
    equal(ftsQuery('  '), null);
    equal(ftsQuery('Größe'), 'größe*');
});
test('long answers are shortened without changing their size', () => {
    equal(shortNumber('153.6'), '153.6');
    equal(shortNumber('6.21371192237'), '6.213712');
    equal(shortNumber('1099511627776'), '1.09951e12');
    equal(shortNumber('1.844674e19'), '1.844674e19');
    equal(shortNumber('-0.000123456789012'), '-0.0001234568');
}); 

done('misc');
