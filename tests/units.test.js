import {test, equal, done} from './harness.js';
import {convert} from '../extension/lib/units.js';

const near = (text, value, digits = 6) => {
    const result = convert(text);
    if (!result)
        throw new Error(`no answer for ${text}`);
    if (Math.abs(result.value - value) > 10 ** -digits)
        throw new Error(`${text}: ${result.value} is not ${value}`);
    return result;
};
test('lengths', () => {
    near('10 km in mi', 6.21371192);
    near('5 in in cm', 12.7);
    near('6 feet to m', 1.8288);
});
test('temperature with offsets', () => {
    near('100 c to f', 212);
    near('32 °F in °C', 0);
    near('0 k in c', -273.15);
    near('-40 c in f', -40);
});
test('data, bits and bytes', () => {
    near('1 GiB in MB', 1073.741824);
    near('100 Mbit in MB', 12.5);
});
test('a sum as the amount, a comma as decimal mark', () => {
    near('2*3 km in m', 6000);
    near('1,5 h in min', 90);
});
test('words with spaces', () => {
    near('8 fl oz in ml', 236.5882365);
});
test('the text shown', () => {
    const r = convert('10 km in mi');
    equal(r.text, '6.21371192237 mi');
    equal(r.expression, '10 km in mi');
});
test('no answer across kinds, for unknown units, or without a number', () => {
    for (const text of ['10 km in kg', '10 foo in bar', 'km in mi', 'flights to paris', '10 km in km', 'weather in vienna'])
        equal([text, convert(text)], [text, null]);
});
done('units');
