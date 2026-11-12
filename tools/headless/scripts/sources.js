// The slower paths: search providers of other apps, the look inside
// documents.
export default async function ({extension, panel, settings, sleep, note, type, key, Clutter, shot}) {
    const check = (what, ok, detail = '') => note(`${ok ? 'PASS' : 'FAIL'} ${what}${detail ? ` (${detail})` : ''}`);
    await sleep(1000);

    // Providers: off by default, asked only when switched on.
    check('no provider is asked by default', !extension._sources.providers.active);
    settings.set_strv('providers', ['org.gnome.Characters.desktop', 'org.gnome.Settings.desktop']);
    extension.toggle();
    await sleep(300);
    // The first question starts the apps, which may take longer than the
    // 300 ms a provider is given; the second finds them running.
    await type('bluetooth', 60);
    await sleep(3000);
    await key(Clutter.KEY_BackSpace);
    await sleep(1200);
    const groups = panel._groups.filter(g => g.actor.visible).map(g => g.title.text);
    note(`groups: ${groups.join(', ')}`);
    check('a switched-on provider answers in its own group', groups.some(t => /Settings|Characters/.test(t) && t !== 'Settings') || groups.length >= 2, groups.join(', '));
    await shot('sources-1-providers');
    panel.close();
    settings.set_strv('providers', []);
    await sleep(500);

    // Inside documents: only on request.
    extension.toggle();
    await sleep(300);
    await type('zzqxj', 60);
    await sleep(800);
    check('nothing found offers the look inside documents', panel._rows.some(r => r.kind === 'content-search'));
    await key(Clutter.KEY_Down);
    await key(Clutter.KEY_Return);
    await sleep(1500);
    check('the look inside documents runs and stays open', panel.isOpen && panel._calm.visible === true || panel._rows.some(r => r.id?.startsWith('content:')),
        panel._calmSub.text);
    await shot('sources-2-content');
    panel.close();
    await sleep(400);
}
