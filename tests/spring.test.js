import {test, equal, done} from './harness.js';
import {SPRINGS, overshoot, springAt} from '../extension/lib/spring.js';

test('mono spring: stiffness 520, damping ratio 17 / (2 sqrt 520)', () => {
    equal(SPRINGS.mono.stiffness, 520);
    equal(Math.abs(SPRINGS.mono.damping - 0.3727) < 0.001, true);
});
test('mono spring overshoots about 28 %', () => {
    equal(Math.abs(overshoot(SPRINGS.mono) - 0.283) < 0.01, true);
});
test('mono spring is past 1.02 at 148 ms', () => {
    equal(springAt(0.148, SPRINGS.mono) > 1.02, true);
});
test('a critically damped spring does not overshoot', () => {
    equal(overshoot({damping: 1, stiffness: 900}), 0);
});

done('spring');
