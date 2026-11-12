// Shortcuts as GSettings writes them ("<Super>space", "<Primary><Alt>t"),
// compared regardless of how their modifiers are spelled or ordered.

const MODIFIER_NAMES = {
    super: 'Super', meta: 'Super', mod4: 'Super',
    control: 'Control', ctrl: 'Control', primary: 'Control',
    shift: 'Shift', alt: 'Alt', mod1: 'Alt', hyper: 'Hyper',
};
const ORDER = ['Control', 'Alt', 'Shift', 'Super', 'Hyper'];

// One accelerator in a fixed spelling; null for an empty or broken one.
export function normalize(accelerator) {
    const text = (accelerator ?? '').trim();
    if (!text)
        return null;
    const modifiers = new Set();
    const rest = text.replace(/<([^>]+)>/g, (_, name) => {
        const known = MODIFIER_NAMES[name.toLowerCase()];
        if (known)
            modifiers.add(known);
        return '';
    }).trim();
    if (!rest)
        return null;
    const key = rest.length === 1 ? rest.toLowerCase() : rest.toLowerCase();
    return `${ORDER.filter(m => modifiers.has(m)).map(m => `<${m}>`).join('')}${key}`;
}

export function same(a, b) {
    const x = normalize(a);
    return x !== null && x === normalize(b);
}

// bindings: [{schema, key, accelerators: [...]}] from the desktop's settings.
// Returns those that use one of wanted.
export function conflicts(wanted, bindings) {
    const mine = new Set(wanted.map(normalize).filter(Boolean));
    return bindings.filter(binding => binding.accelerators.some(a => mine.has(normalize(a))));
}

// "<Super>space" → "Super+Space", for showing.
export function label(accelerator) {
    const normal = normalize(accelerator);
    if (!normal)
        return '';
    const parts = [...normal.matchAll(/<([^>]+)>/g)].map(m => (m[1] === 'Control' ? 'Ctrl' : m[1]));
    const key = normal.replace(/<[^>]+>/g, '');
    parts.push(key.length === 1 ? key.toUpperCase() : key[0].toUpperCase() + key.slice(1));
    return parts.join('+');
}
