// The springs of Material 3 Expressive: where a mass on a spring is at a
// given time, on its way from 0 to 1. Spatial springs (moving, scaling,
// shapes) are underdamped and pass their target before they settle; effect
// springs (opacity, colour, counting numbers) never do.

// damping: 1 settles without passing the target, less than 1 swings past it.
// stiffness: how hard the spring pulls; higher is quicker.
export const SPRINGS = {
    // The expressive scheme's spatial springs.
    fast: {damping: 0.6, stiffness: 800},
    spatial: {damping: 0.8, stiffness: 380},
    slow: {damping: 0.8, stiffness: 200},
    // Insights Mono: mass 1, stiffness 520, damping 17 (ratio 17 / (2 sqrt 520)).
    // It swings about 28 % past its target and peaks at 148 ms: used for
    // scale and press only, never for a height.
    mono: {damping: 17 / (2 * Math.sqrt(520)), stiffness: 520},
    // Looser than Material's own, for what should be seen to swing: a sheet
    // of widgets that arrives, a ring that fills.
    bouncy: {damping: 0.55, stiffness: 320},
    // The effect springs.
    effect: {damping: 1, stiffness: 1600},
    effectSlow: {damping: 1, stiffness: 800},
    // For what dies down rather than arrives: a wave that was stirred.
    calm: {damping: 1, stiffness: 100},
};

// How far past its target an underdamped spring swings, as a fraction of
// the way (0.28 means 28 % beyond); 0 when it does not pass.
export function overshoot({damping}) {
    if (damping >= 1)
        return 0;
    return Math.exp(-Math.PI * damping / Math.sqrt(1 - damping * damping));
}

// Below this share of the way, what is left of the swing cannot be seen.
const AT_REST = 0.001;

// seconds: time since the spring was let go. Returns 0 at the start and
// comes to rest at 1; an underdamped spring is above 1 on the way.
export function springAt(seconds, {damping, stiffness}) {
    if (seconds <= 0)
        return 0;
    const natural = Math.sqrt(stiffness);
    if (damping >= 1)
        return 1 - Math.exp(-natural * seconds) * (1 + natural * seconds);
    const decay = damping * natural;
    const swing = natural * Math.sqrt(1 - damping * damping);
    return 1 - Math.exp(-decay * seconds) * (Math.cos(swing * seconds) + (decay / swing) * Math.sin(swing * seconds));
}

// How long the spring takes to come to rest, in milliseconds.
// rest: how much of the way may be left; a visible spring needs far less
// precision than the default.
export function settleMs({damping, stiffness}, rest = AT_REST) {
    const natural = Math.sqrt(stiffness);
    // A critically damped spring carries a linear term that keeps it out
    // a little longer than its envelope alone.
    const decay = Math.min(damping, 1) * natural;
    const seconds = -Math.log(rest) / decay * (damping >= 1 ? 1.35 : 1);
    return Math.round(seconds * 1000);
}

// A number on its way from one value to another; decimals as the target has.
export function between(from, to, share) {
    return from + (to - from) * share;
}

// Splits a text into what stands before its first number, the number, and
// what follows: "42 %" → {before: "", value: 42, decimals: 0, after: " %"}.
// null when there is no number in it, or more than one: a time of day or a
// range is not a value to count up to.
export function numberIn(content) {
    const match = /^(\D*?)(-?\d+(?:[.,]\d+)?)(\D*)$/s.exec(content ?? '');
    if (!match)
        return null;
    const [, before, digits, after] = match;
    const mark = digits.includes(',') ? ',' : '.';
    const decimals = digits.includes(mark) ? digits.length - digits.indexOf(mark) - 1 : 0;
    return {before, value: Number.parseFloat(digits.replace(',', '.')), decimals, mark, after};
}

// The text between two readings of the same kind, share of the way along.
// Readings that are not the same kind (other unit, no number) do not count:
// the target is returned as it is.
export function countBetween(from, to, share) {
    const a = numberIn(from);
    const b = numberIn(to);
    if (!b || share >= 1)
        return to;
    // Without a number to come from, the count starts at nothing.
    const start = a && a.before === b.before && a.after === b.after ? a.value : 0;
    const value = between(start, b.value, Math.min(1, Math.max(0, share)));
    return `${b.before}${value.toFixed(b.decimals).replace('.', b.mark)}${b.after}`;
}
