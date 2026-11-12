import {test, equal, done} from './harness.js';
import {colors, sizes, type, family, serifFamily} from '../extension/lib/tokens.js';

test('two schemes only', () => {
    equal(Object.keys(colors), ['light', 'dark']);
});
test('Mono colours', () => {
    equal(colors.light.bg, '#ffffff');
    equal(colors.dark.card, '#161618');
    equal(colors.light['on-solid'], '#ffffff');
});
test('sizes', () => {
    equal(sizes['radius-card'], 22);
    equal(sizes['space-card-gap'], 28);
    equal(sizes['size-search'], 52);
});
test('type roles', () => {
    equal(type.number.size, 32);
    equal(type.title.serif, true);
    equal(type.body.serif, false);
    equal(typeof type.title.tracking, 'number');
});
test('families end in a generic family, so a missing font never blanks the panel', () => {
    equal(family.endsWith('sans-serif'), true);
    equal(serifFamily.endsWith('serif'), true);
    equal(serifFamily.includes('Geist Serif'), true);
});

done('tokens');
