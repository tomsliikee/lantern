import {test, equal, done} from './harness.js';
import {schemeName} from '../extension/lib/schemename.js';

test('only prefer-dark is dark', () => {
    equal(schemeName('prefer-dark'), 'dark');
    equal(schemeName('default'), 'light');
    equal(schemeName('prefer-light'), 'light');
    equal(schemeName(undefined), 'light');
});

done('theme');
