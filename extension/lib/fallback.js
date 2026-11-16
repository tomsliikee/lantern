// The rows shown when nothing matches, in order: the one chosen in the
// settings first, the others below it. Without the shell, so it is tested.

export const FALLBACKS = ['web', 'files', 'claude', 'agy', 'ollama'];
const AI = new Set(['claude', 'agy', 'ollama']);

// choice: the nothing-found setting. ai: the ask switch. files: whether
// "Search in Files" can be offered. A choice that cannot be offered gives
// way to the web.
export function fallbackOrder(choice, {ai, files}) {
    const offered = FALLBACKS.filter(id => (id !== 'files' || files) && (!AI.has(id) || ai));
    const first = offered.includes(choice) ? choice : 'web';
    return [first, ...offered.filter(id => id !== first)];
}
