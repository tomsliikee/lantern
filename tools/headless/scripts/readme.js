// The screenshots of the README. Files are left out, so no path of the
// machine they were taken on shows.
export default async function ({panel, settings, shot: take, sleep, type, key, Clutter, desktop, note}) {
    // Each shot notes where the panel is, to cut it out afterwards.
    const shot = async name => {
        const [x, y] = panel._capsule.get_transformed_position();
        const [w, h] = panel._capsule.get_transformed_size();
        note(`${name} ${Math.round(x)} ${Math.round(y)} ${Math.round(w)} ${Math.round(h)}`);
        await take(name);
    };
    const scheme = desktop.get_string('color-scheme') === 'prefer-dark' ? 'dark' : 'light';
    settings.set_strv('sources', ['apps', 'windows', 'settings', 'actions', 'calculator']);
    settings.set_string('compact', 'never');
    const fresh = async text => {
        panel._entry.set_text('');
        await sleep(300);
        await type(text, 70);
        await sleep(700);
    };
    panel.open();
    await sleep(500);
    await shot(`readme-${scheme}-pill`);
    await fresh('fire');
    await shot(`readme-${scheme}-fire`);
    await key(Clutter.KEY_Tab);
    await sleep(400);
    await shot(`readme-${scheme}-actions`);
    await key(Clutter.KEY_Escape);
    await fresh('blue');
    await shot(`readme-${scheme}-settings`);
    panel.close();
    await sleep(400);
    settings.set_string('compact', 'always');
    panel.open();
    await fresh('128 * 1.2');
    await shot(`readme-${scheme}-sum`);
    await fresh('10 km in mi');
    await shot(`readme-${scheme}-units`);
    await fresh('quokka habitat');
    await shot(`readme-${scheme}-none`);
    panel.close();
}
