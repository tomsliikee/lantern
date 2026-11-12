// The keyboard and the pointer, checked: each line of the log says what
// was expected and what happened.
export default async function ({panel, settings, extension, sleep, note, type, key, Clutter, move, press, release, Main}) {
    const check = (what, ok, detail = '') => note(`${ok ? 'PASS' : 'FAIL'} ${what}${detail ? ` (${detail})` : ''}`);
    const St = imports.gi.St;
    const clipboard = () => new Promise(resolve => St.Clipboard.get_default().get_text(St.ClipboardType.CLIPBOARD, (_c, text) => resolve(text)));

    // The rig pre-sets the removed "style" key to wallpaper, as an older
    // version left it; the extension must run on, in the light or dark scheme.
    check('an old style value is ignored', panel._scheme === 'light' || panel._scheme === 'dark' || panel._scheme === null,
        String(panel._scheme));

    // The first enable moved the launcher to Ctrl+Space: Super+Space
    // switches input sources in a fresh session.
    check('first enable takes Ctrl+Space while Super+Space is taken', settings.get_strv('toggle-shortcut')[0] === '<Control>space',
        settings.get_strv('toggle-shortcut').join());
    await key(Clutter.KEY_Control_L, Clutter.KEY_space);
    await sleep(500);
    check('Ctrl+Space opens', panel.isOpen);
    check('opened empty, as the pill alone', panel._entry.get_text() === '' && !panel._body.visible);
    await key(Clutter.KEY_Control_L, Clutter.KEY_space);
    await sleep(400);
    check('Ctrl+Space again closes', !panel.isOpen);

    extension.toggle();
    await sleep(400);
    await type('fire');
    await sleep(600);
    check('typing shows the panel', panel._body.visible);
    check('Firefox is the top hit', panel._rows[0]?.title === 'Firefox', panel._rows[0]?.title);
    note(`rows for fire: ${panel._rows.map(r => r.title).join(', ')}`);
    for (let i = 0; i < 4; i++)
        await key(Clutter.KEY_BackSpace);
    await type('te');
    await sleep(500);
    const first = panel._selected;
    await key(Clutter.KEY_Down);
    check('Down moves the selection', panel._selected === first + 1, `${panel._rows.length} rows`);
    await key(Clutter.KEY_Up);
    await key(Clutter.KEY_Up);
    check('Up stops at the top', panel._selected === 0);
    await key(Clutter.KEY_Tab);
    await sleep(200);
    check('Tab opens the actions', panel._sheet.open, panel._sheet._items.map(i => i.title).join(', '));
    await key(Clutter.KEY_Down);
    check('Down moves inside the actions', panel._sheet.selected === 1);
    await key(Clutter.KEY_Escape);
    await sleep(200);
    check('Esc closes the actions, not the panel', !panel._sheet.open && panel.isOpen);

    for (let i = 0; i < 2; i++)
        await key(Clutter.KEY_BackSpace);
    await sleep(500);
    check('an empty field shrinks back to the pill', !panel._body.visible);

    await type('6*7');
    await sleep(300);
    await key(Clutter.KEY_Control_L, Clutter.KEY_c);
    await sleep(200);
    check('Ctrl+C copies the answer', await clipboard() === '42', await clipboard());
    await key(Clutter.KEY_Return);
    await sleep(300);
    check('Enter on an answer copies and closes', !panel.isOpen && await clipboard() === '42');

    extension.toggle();
    await sleep(400);
    await type('setti');
    await sleep(400);
    check('search runs within a frame', panel.lastMs < 8, `${panel.lastMs.toFixed(2)} ms`);
    // A press outside the panel closes it.
    move(60, 900);
    await sleep(200);
    press();
    release();
    await sleep(400);
    check('a click outside closes', !panel.isOpen);

    // A press inside does not.
    extension.toggle();
    await sleep(400);
    await type('te');
    await sleep(500);
    const [x, y] = panel._capsule.get_transformed_position();
    move(x + 300, y + 28);
    await sleep(200);
    press();
    release();
    await sleep(300);
    check('a click on the field keeps it open', panel.isOpen);
    // Hovering a row selects it once the pointer moved.
    const row = panel._groups[0].rows[1];
    const [rx, ry] = row.get_transformed_position();
    move(rx + 100, ry + 20);
    await sleep(300);
    check('the pointer selects the row under it', panel._rows[panel._selected] === row.item, row.item?.title);
    await key(Clutter.KEY_Escape);
    await sleep(300);
    check('Esc closes', !panel.isOpen);

    // A source switched off is not asked.
    settings.set_strv('sources', ['windows', 'settings', 'actions', 'calculator', 'files']);
    extension.toggle();
    await sleep(300);
    await type('fire');
    await sleep(500);
    check('apps switched off leave Firefox out', !panel._rows.some(r => r.kind === 'app'));
    panel.close();
    settings.reset('sources');

    // System actions match by keyword.
    extension.toggle();
    await sleep(300);
    // The headless session may not power off; the screenshot tool always can.
    await type('snip');
    await sleep(400);
    check('a keyword finds its system action', panel._rows[0]?.kind === 'action', panel._rows.map(r => r.title).join(', '));
    panel.close();
    await sleep(300);

    // The use counts: opening something writes the file after closing.
    extension.toggle();
    await sleep(300);
    await type('abou');
    await sleep(400);
    const chosen = panel._rows[0];
    panel._usage.record('abou', chosen?.historyId);
    panel.close();
    await sleep(800);
    const GLib = imports.gi.GLib;
    const path = GLib.build_filenamev([GLib.get_user_data_dir(), 'material-search', 'usage.json']);
    check('use counts are written after closing', GLib.file_test(path, GLib.FileTest.EXISTS));
    await sleep(400);
    check('nothing is left running after closing', panel._search._timer === 0 && !panel._growSpring.moving && !panel._openSpring.moving && !panel._fadeSpring.moving);
    check('the panel is hidden, not transparent', !panel._backdrop.visible);
    check('no grab is left', Main.modalCount === 0, `${Main.modalCount}`);

    // Without animation the panel is at its final values in the same tick.
    panel.open({animate: false});
    check('open without animation: scale 1, opaque, nothing moving at once',
        panel._capsule.scale_x === 1 && panel._capsule.opacity === 255 && !panel._openSpring.moving && !panel._fadeSpring.moving,
        `scale ${panel._capsule.scale_x}, opacity ${panel._capsule.opacity}`);
    panel.close();
    await sleep(400);
    // With animation: it moves, and ends at the same values with no spring left.
    panel.open({animate: true});
    check('open with animation: springs run', panel._openSpring.moving && panel._fadeSpring.moving);
    await sleep(900);
    check('the opening settles: scale 1, opaque, nothing moving',
        panel._capsule.scale_x === 1 && panel._capsule.opacity === 255 && !panel._openSpring.moving && !panel._fadeSpring.moving,
        `scale ${panel._capsule.scale_x}`);
    panel.close();
    await sleep(500);
    check('closed: no spring moves and the fade is done', !panel._openSpring.moving && !panel._fadeSpring.moving && !panel._growSpring.moving && !panel._backdrop.visible);

    // Compact: leaving the sheet by typing must bring the results back.
    settings.set_string('compact', 'always');
    panel.open();
    await sleep(300);
    await type('te');
    await sleep(500);
    await key(Clutter.KEY_Tab);
    await sleep(200);
    check('compact: the sheet hides the results', panel._sheet.open && !panel._resultsColumn.visible);
    await type('x', 60);
    await sleep(500);
    check('compact: typing on shows the results again', !panel._sheet.open && panel._resultsColumn.visible);
    await key(Clutter.KEY_Tab);
    await sleep(200);
    await key(Clutter.KEY_Return);
    await sleep(400);
    panel.open();
    await sleep(300);
    check('compact: reopening after an action shows results column', panel._resultsColumn.visible);
    panel.close();
    await sleep(400);
    settings.reset('compact');
}
