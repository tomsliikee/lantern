// The scheme setting: system follows the desktop, light and dark win over it.
export default async function ({panel, settings, shot, sleep, type, note}) {
    const Gio = imports.gi.Gio;
    const desktop = new Gio.Settings({schema_id: 'org.gnome.desktop.interface'});
    for (const colorScheme of ['prefer-dark', 'default']) {
        desktop.set_string('color-scheme', colorScheme);
        for (const choice of ['system', 'light', 'dark']) {
            settings.set_string('scheme', choice);
            const want = choice !== 'system' ? choice : (colorScheme === 'prefer-dark' ? 'dark' : 'light');
            panel.open();
            await sleep(400);
            await type('fire', 60);
            await sleep(600);
            const classes = panel._backdrop.get_style_class_name();
            const other = want === 'dark' ? 'light' : 'dark';
            const ok = classes.includes(`ms-root-${want}`) && !classes.includes(`ms-root-${other}`);
            note(`${ok ? 'PASS' : 'FAIL'} desktop ${colorScheme}, setting ${choice}: ${want} (${classes})`);
            await shot(`scheme-${colorScheme}-${choice}`);
            panel.close();
            await sleep(500);
        }
    }
    settings.reset('scheme');
}
