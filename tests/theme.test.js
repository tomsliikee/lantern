import {test, equal, done} from './harness.js';
import {schemeName} from '../extension/lib/schemename.js';

test('only prefer-dark is dark', () => {
    equal(schemeName('prefer-dark'), 'dark');
    equal(schemeName('default'), 'light');
    equal(schemeName('prefer-light'), 'light');
    equal(schemeName(undefined), 'light');
});

test('the setting wins over the desktop', () => {
    equal(schemeName('prefer-dark', 'light'), 'light');
    equal(schemeName('default', 'dark'), 'dark');
    equal(schemeName('prefer-dark', 'system'), 'dark');
    equal(schemeName('prefer-light', 'system'), 'light');
    equal(schemeName('prefer-dark', 'bogus'), 'dark');
    equal(schemeName('prefer-dark', undefined), 'dark');
});

done('theme');
