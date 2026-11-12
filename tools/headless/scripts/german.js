// The panel in German (run with LANG=de_AT.UTF-8): the longer labels must
// ellipsise, never push the layout; the panel keeps its width.
export default async function ({panel, settings, shot, sleep, type, key, note, Clutter}) {
    const check = (what, ok, detail = '') => note(`${ok ? 'PASS' : 'FAIL'} ${what}${detail ? ` (${detail})` : ''}`);
    const clear = async () => {
        panel._entry.set_text('');
        await sleep(400);
    };
    for (const compact of ['never', 'always']) {
        settings.set_string('compact', compact);
        const tag = compact === 'never' ? 'wide' : 'compact';
        panel.open();
        await sleep(400);
        await type('quokka', 60);
        await sleep(900);
        note(`calm: ${panel._calmTitle.text} / ${panel._calmSub.text}`);
        note(`hint: ${panel._entry.hint_actor.text}`);
        await shot(`german-${tag}-1-none`);
        await clear();
        await type('einstell', 60);
        await sleep(700);
        const [width] = panel._capsule.get_transformed_size();
        check(`the ${tag} panel keeps its width`, Math.round(width) === Math.round(panel._width), `${width} of ${panel._width}`);
        await shot(`german-${tag}-2-settings`);
        await key(Clutter.KEY_Tab);
        await sleep(400);
        await shot(`german-${tag}-3-actions`);
        await key(Clutter.KEY_Escape);
        panel.close();
        await sleep(400);
    }
    settings.reset('compact');
}
