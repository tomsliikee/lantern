// Converts between units: "10 km in mi", "100 f to c", "3.5 GiB in MB".
//
// Every unit is a factor to the base unit of its kind; temperature also
// carries an offset. Written in lowercase, so "MB" and "mb" are both bytes;
// bits are spelled "bit", "kbit", "Mbit".

import {evaluate, formatNumber} from './calc.js';

// [kind, factor to the base, names...]; the first name is the one shown.
const TABLE = [
    ['length', 1, 'm', 'meter', 'meters', 'metre', 'metres'],
    ['length', 1000, 'km', 'kilometer', 'kilometers', 'kilometre', 'kilometres'],
    ['length', 0.01, 'cm', 'centimeter', 'centimeters', 'centimetre', 'centimetres'],
    ['length', 0.001, 'mm', 'millimeter', 'millimeters', 'millimetre', 'millimetres'],
    ['length', 1e-6, 'µm', 'um', 'micrometer', 'micrometers'],
    ['length', 1609.344, 'mi', 'mile', 'miles'],
    ['length', 0.9144, 'yd', 'yard', 'yards'],
    ['length', 0.3048, 'ft', 'foot', 'feet'],
    ['length', 0.0254, 'in', 'inch', 'inches', '"'],
    ['length', 1852, 'nmi', 'nautical mile', 'nautical miles'],

    ['mass', 1, 'kg', 'kilogram', 'kilograms', 'kilo', 'kilos'],
    ['mass', 0.001, 'g', 'gram', 'grams'],
    ['mass', 1e-6, 'mg', 'milligram', 'milligrams'],
    ['mass', 1000, 't', 'tonne', 'tonnes', 'ton', 'tons'],
    ['mass', 0.45359237, 'lb', 'lbs', 'pound', 'pounds'],
    ['mass', 0.028349523125, 'oz', 'ounce', 'ounces'],
    ['mass', 6.35029318, 'st', 'stone', 'stones'],

    ['volume', 1, 'l', 'liter', 'liters', 'litre', 'litres'],
    ['volume', 0.001, 'ml', 'milliliter', 'milliliters', 'millilitre', 'millilitres'],
    ['volume', 0.01, 'cl', 'centiliter', 'centiliters'],
    ['volume', 0.1, 'dl', 'deciliter', 'deciliters'],
    ['volume', 1000, 'm³', 'm3', 'cubic meter', 'cubic meters'],
    ['volume', 3.785411784, 'gal', 'gallon', 'gallons'],
    ['volume', 0.946352946, 'qt', 'quart', 'quarts'],
    ['volume', 0.473176473, 'pt', 'pint', 'pints'],
    ['volume', 0.2365882365, 'cup', 'cups'],
    ['volume', 0.0295735295625, 'fl oz', 'floz', 'fluid ounce', 'fluid ounces'],

    ['area', 1, 'm²', 'm2', 'sqm', 'square meter', 'square meters'],
    ['area', 1e6, 'km²', 'km2', 'square kilometer', 'square kilometers'],
    ['area', 1e-4, 'cm²', 'cm2'],
    ['area', 1e4, 'ha', 'hectare', 'hectares'],
    ['area', 4046.8564224, 'acre', 'acres'],
    ['area', 0.09290304, 'ft²', 'ft2', 'sqft', 'square foot', 'square feet'],

    ['time', 1, 's', 'sec', 'second', 'seconds'],
    ['time', 0.001, 'ms', 'millisecond', 'milliseconds'],
    ['time', 60, 'min', 'minute', 'minutes'],
    ['time', 3600, 'h', 'hr', 'hour', 'hours'],
    ['time', 86400, 'd', 'day', 'days'],
    ['time', 604800, 'wk', 'week', 'weeks'],
    ['time', 31557600, 'yr', 'year', 'years'],

    ['speed', 1, 'm/s', 'mps'],
    ['speed', 1000 / 3600, 'km/h', 'kmh', 'kph'],
    ['speed', 1609.344 / 3600, 'mph'],
    ['speed', 1852 / 3600, 'kn', 'knot', 'knots'],

    ['data', 1, 'B', 'b', 'byte', 'bytes'],
    ['data', 1e3, 'kB', 'kb', 'kilobyte', 'kilobytes'],
    ['data', 1e6, 'MB', 'mb', 'megabyte', 'megabytes'],
    ['data', 1e9, 'GB', 'gb', 'gigabyte', 'gigabytes'],
    ['data', 1e12, 'TB', 'tb', 'terabyte', 'terabytes'],
    ['data', 1024, 'KiB', 'kib'],
    ['data', 1024 ** 2, 'MiB', 'mib'],
    ['data', 1024 ** 3, 'GiB', 'gib'],
    ['data', 1024 ** 4, 'TiB', 'tib'],
    ['data', 1 / 8, 'bit', 'bits'],
    ['data', 1e3 / 8, 'kbit', 'kbits'],
    ['data', 1e6 / 8, 'Mbit', 'mbit', 'mbits'],
    ['data', 1e9 / 8, 'Gbit', 'gbit', 'gbits'],

    ['energy', 1, 'J', 'j', 'joule', 'joules'],
    ['energy', 1000, 'kJ', 'kj', 'kilojoule', 'kilojoules'],
    ['energy', 4184, 'kcal', 'calorie', 'calories', 'cal'],
    ['energy', 3.6e6, 'kWh', 'kwh'],
];

// Temperature is not a factor alone: value in kelvin = value * factor + offset.
const TEMPERATURE = [
    [1, 273.15, '°C', 'c', '°c', 'celsius', 'degc'],
    [5 / 9, 459.67 * 5 / 9, '°F', 'f', '°f', 'fahrenheit', 'degf'],
    [1, 0, 'K', 'k', 'kelvin'],
];

const UNITS = new Map();
for (const [kind, factor, ...names] of TABLE) {
    for (const name of names)
        UNITS.set(name.toLowerCase(), {kind, factor, offset: 0, shown: names[0]});
}
for (const [factor, offset, ...names] of TEMPERATURE) {
    for (const name of names)
        UNITS.set(name.toLowerCase(), {kind: 'temperature', factor, offset, shown: names[0]});
}

export function unit(name) {
    return UNITS.get((name ?? '').trim().toLowerCase().replace(/\s+/g, ' ')) ?? null;
}

// "<amount> <unit> in|to|as|= <unit>". The amount may be a sum ("2*3 km in m").
const PATTERN = /^(.+?)\s*([^\d\s()+*/^-][^\d()+*/^]*?)\s+(?:in|to|as|into|=|->|→)\s+(.+?)\s*$/i;

export function convert(text) {
    const match = PATTERN.exec((text ?? '').trim());
    if (!match)
        return null;
    const [, amountText, fromName, toName] = match;
    const from = unit(fromName);
    const to = unit(toName);
    if (!from || !to || from.kind !== to.kind || from === to)
        return null;
    const amount = /^\s*-?\d+(?:[.,]\d+)?\s*$/.test(amountText)
        ? Number.parseFloat(amountText.replace(',', '.'))
        : evaluate(amountText);
    if (amount === null || !Number.isFinite(amount))
        return null;
    const base = amount * from.factor + from.offset;
    const value = (base - to.offset) / to.factor;
    return {
        value,
        unit: to.shown,
        from: {amount, unit: from.shown},
        kind: from.kind,
        text: `${formatNumber(value)} ${to.shown}`,
        expression: `${formatNumber(amount)} ${from.shown} in ${to.shown}`,
    };
}
