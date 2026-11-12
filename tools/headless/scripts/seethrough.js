// The see-through mode over a window, on and off.
export default async function ({panel, settings, shot, sleep, type, note}) {
    const Gio = imports.gi.Gio;
    const GLib = imports.gi.GLib;
    Gio.Subprocess.new(['gjs', '-m', `${GLib.getenv('MS_REPO')}/tools/headless/window.js`], Gio.SubprocessFlags.NONE);
    await sleep(3000);
    for (const on of [false, true]) {
        settings.set_boolean('see-through', on);
        panel.open();
        await sleep(400);
        await type('fire', 60);
        await sleep(700);
        const classes = panel._capsule.get_style_class_name();
        note(`${on === classes.includes('ms-see-through') ? 'PASS' : 'FAIL'} see-through ${on ? 'on' : 'off'} (${classes})`);
        await shot(`seethrough-${on ? 'on' : 'off'}`);
        panel.close();
        await sleep(500);
    }
    settings.reset('see-through');
}
