// Opens the settings window, one page after the other, and checks that a
// change made there reaches the running extension.
// Where the See-through switch is in the maximised window (see prefs-1-general).
const SWITCH = {x: 1050, y: 543};
export default async function ({extension, settings, shot, sleep, note, move, press, release}) {
    await sleep(1500);
    extension.openPreferences();
    await sleep(7000);
    const windows = global.get_window_actors().map(actor => actor.meta_window);
    note(`windows: ${JSON.stringify(windows.map(w => w.get_title()))}`);
    const window = windows.find(w => w.get_title()?.includes('Material Search'));
    if (!window) {
        note('FAIL no settings window');
        return;
    }
    window.maximize();
    await sleep(800);
    await shot('prefs-1-general');
    const click = async (x, y) => {
        move(x, y);
        await sleep(250);
        press();
        release();
        await sleep(700);
    };
    // The See-through switch: a change made in the window reaches the settings.
    const before = settings.get_boolean('see-through');
    await click(SWITCH.x, SWITCH.y);
    note(`${settings.get_boolean('see-through') !== before ? 'PASS' : 'FAIL'} a switch in the window changes the setting (see-through ${before} -> ${settings.get_boolean('see-through')})`);
    extension.toggle();
    await sleep(500);
    note(`${extension._panel._capsule.has_style_class_name('ms-see-through') === settings.get_boolean('see-through') ? 'PASS' : 'FAIL'} the panel wears it at the next opening`);
    extension._panel.close();
    await sleep(500);
    settings.set_boolean('see-through', before);
    await click(737, 54);
    await shot('prefs-2-sources');
    await click(860, 54);
    await shot('prefs-3-ask');
    await click(983, 54);
    await shot('prefs-4-privacy');
}
