import {test, equal, done} from './harness.js';
import {evaluate, formatNumber, prettyExpression} from '../extension/lib/calc.js';

const close = (a, b) => Math.abs(a - b) < 1e-9;
test('the sum of the design', () => {
    equal(formatNumber(evaluate('128 * 1.2')), '153.6');
});
test('precedence and brackets', () => {
    equal(evaluate('2 + 3 * 4'), 14);
    equal(evaluate('(2 + 3) * 4'), 20);
    equal(evaluate('2 ^ 3 ^ 2'), 512);
    equal(evaluate('-2 ^ 2'), -4);
    equal(evaluate('2 ** 10'), 1024);
});
test('a comma is a decimal mark', () => {
    equal(evaluate('1,5 * 2'), 3);
});
test('signs from the keyboard and from texts', () => {
    equal(evaluate('6 × 7'), 42);
    equal(evaluate('10 ÷ 4'), 2.5);
    equal(evaluate('10 − 4'), 6);
    equal(evaluate('3x4'), 12);
});
test('percent', () => {
    equal(evaluate('20%'), 0.2);
    equal(evaluate('200 + 10%'), 220);
    equal(evaluate('200 - 10%'), 180);
    equal(evaluate('50% * 30'), 15);
});
test('functions, constants and implicit products', () => {
    equal(evaluate('sqrt 16'), 4);
    equal(evaluate('sqrt(16) + 1'), 5);
    equal(close(evaluate('2pi'), 2 * Math.PI), true);
    equal(close(evaluate('sin(pi/2)'), 1), true);
    equal(evaluate('5!'), 120);
    equal(evaluate('7 mod 3'), 1);
    equal(evaluate('log 1000'), 3);
    equal(close(evaluate('pi'), Math.PI), true);
});
test('a bracket still being typed is forgiven', () => {
    equal(evaluate('(2 + 3'), 5);
});
test('what is not a sum is not answered', () => {
    for (const text of ['128', 'firefox', 'fire 2', '2 +', '', ')', '1/0', 'e mail', 'abc+1', '3.5.1'])
        equal([text, evaluate(text)], [text, null]);
});
test('numbers are shown plainly', () => {
    equal(formatNumber(0.1 + 0.2), '0.3');
    equal(formatNumber(1 / 3), '0.333333333333');
    equal(formatNumber(2e20), '2e20');
    equal(formatNumber(-0), '0');
});
test('the expression with proper signs', () => {
    equal(prettyExpression('128*1.2'), '128 × 1.2');
    equal(prettyExpression('10-4/2'), '10 − 4 ÷ 2');
});
done('calc');
