// The colour scheme the panel wears. Mono has light and dark. The choice
// in Lantern's own settings wins; "system" (or anything unknown) follows
// the desktop's colour-scheme setting, where only "prefer-dark" is dark.

export function schemeName(colorScheme, choice = 'system') {
    if (choice === 'light' || choice === 'dark')
        return choice;
    return colorScheme === 'prefer-dark' ? 'dark' : 'light';
}
