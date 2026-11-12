// Renders the states of the design in the theme the run was started with
// (MS_SCHEME=prefer-dark or default), wide and compact.
export default async function ({panel, settings, shot, sleep, type, key, Clutter, desktop}) {
    const scheme = desktop.get_string('color-scheme') === 'prefer-dark' ? 'dark' : 'light';
    const clear = async () => {
        panel._entry.set_text('');
        await sleep(400);
    };
    for (const compact of ['never', 'always']) {
        settings.set_string('compact', compact);
        const tag = `${scheme}-${compact === 'never' ? 'wide' : 'compact'}`;
        panel.open();
        await sleep(600);
        await shot(`gallery-${tag}-1-pill`);
        await type('fire');
        await sleep(800);
        await shot(`gallery-${tag}-2-fire`);
        await key(Clutter.KEY_Tab);
        await sleep(400);
        await shot(`gallery-${tag}-3-actions`);
        await key(Clutter.KEY_Escape);
        await clear();
        await type('128 * 1.2');
        await sleep(500);
        await shot(`gallery-${tag}-4-sum`);
        await clear();
        await type('10 km in mi');
        await sleep(500);
        await shot(`gallery-${tag}-5-units`);
        await clear();
        await type('quokka habitat');
        await sleep(900);
        await shot(`gallery-${tag}-6-none`);
        await clear();
        await type('power');
        await sleep(500);
        await shot(`gallery-${tag}-7-actions`);
        await clear();
        await type('blue');
        await sleep(500);
        await shot(`gallery-${tag}-8-settings`);
        panel.close();
        await sleep(500);
    }
}
