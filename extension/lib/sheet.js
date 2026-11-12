// Fills the stylesheet template in for one colour scheme. Used when the
// extension is built.

function channels(hex) {
    const value = Number.parseInt(hex.slice(1), 16);
    return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
}

function rgba(hex, percent) {
    const [r, g, b] = channels(hex);
    return `rgba(${r}, ${g}, ${b}, ${percent / 100})`;
}

// St has no color-mix(): base with percent of over laid on top, opaque.
function mix(base, over, percent) {
    const a = channels(base);
    const b = channels(over);
    const share = percent / 100;
    const hex = a.map((c, i) => Math.round(c + (b[i] - c) * share).toString(16).padStart(2, '0')).join('');
    return `#${hex}`;
}

// $token is a size or a colour; $token@80 is that colour at 80 % opacity;
// $base+over@7 is base with 7 % of over mixed in.
// palette may be null for a part of the template that carries no colour.
export function expand(css, sizes, palette = null) {
    return css.replace(/\$([a-z0-9-]+)(?:\+([a-z0-9-]+))?(?:@(\d+))?/g, (_, name, over, alpha) => {
        if (name in sizes && !over && !alpha)
            return `${sizes[name]}px`;
        if (!palette || !(name in palette) || (over && !(over in palette)))
            throw new Error(`Unknown token in the template: ${name}${over ? `+${over}` : ''}`);
        if (over)
            return mix(palette[name], palette[over], Number(alpha ?? 50));
        return alpha ? rgba(palette[name], Number(alpha)) : palette[name];
    });
}

// The coloured rules for one scheme, "light" or "dark".
export function schemeSheet(themed, scheme, sizes, palette) {
    return expand(themed.replace(/\.ms-root(?![-\w])/g, `.ms-root-${scheme}`), sizes, palette).trim();
}
