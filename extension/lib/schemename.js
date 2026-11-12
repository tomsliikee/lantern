// The colour scheme the panel wears, from the desktop's colour-scheme
// setting: Mono has light and dark, and only "prefer-dark" is dark.

export function schemeName(colorScheme) {
    return colorScheme === 'prefer-dark' ? 'dark' : 'light';
}
