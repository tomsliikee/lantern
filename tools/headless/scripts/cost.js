// What the launcher costs: CPU while closed, the time to open, the work
// per keystroke, the first file results, and memory. Run it once as it is
// and once with MS_WITHOUT=1 (the shell without the extension) to compare.
export default async function ({panel, extension, sleep, note, type, key, cpuMs, rssKb, Clutter}) {
    const GLib = imports.gi.GLib;
    const idle = async seconds => {
        const before = cpuMs();
        await sleep(seconds * 1000);
        return (cpuMs() - before) / (seconds * 10);
    };
    await sleep(8000);
    note(`rss at rest: ${rssKb()} kB`);
    note(`cpu while closed, 30 s: ${(await idle(30)).toFixed(2)} % of one core`);
    if (!panel)
        return;

    // Opening: work in open() and the time to the next painted frame.
    const work = [];
    const frame = [];
    for (let i = 0; i < 15; i++) {
        const started = GLib.get_monotonic_time();
        const painted = new Promise(resolve => {
            const id = global.stage.connect('after-paint', () => {
                global.stage.disconnect(id);
                resolve(GLib.get_monotonic_time());
            });
        });
        extension.toggle();
        work.push((GLib.get_monotonic_time() - started) / 1000);
        frame.push((await painted - started) / 1000);
        await sleep(300);
        panel.close();
        await sleep(300);
    }
    const stats = list => {
        const sorted = [...list].sort((a, b) => a - b);
        return `median ${sorted[Math.floor(sorted.length / 2)].toFixed(2)} ms, max ${sorted[sorted.length - 1].toFixed(2)} ms, first ${list[0].toFixed(2)} ms`;
    };
    note(`open, work in open(): ${stats(work)}`);
    note(`open, key to first painted frame: ${stats(frame)}`);

    // Typing: the instant sources' work per keystroke.
    extension.toggle();
    await sleep(300);
    const perKey = [];
    for (const ch of 'firefox settings network') {
        await type(ch, 120);
        perKey.push(panel.lastMs);
    }
    note(`keystroke work (instant sources): ${stats(perKey)}`);

    // The first file results after a pause.
    const render = panel._render.bind(panel);
    let lateAt = null;
    panel._render = (arrangement, info) => {
        if (info.late && lateAt === null)
            lateAt = GLib.get_monotonic_time();
        render(arrangement, info);
    };
    panel._entry.set_text('');
    await sleep(300);
    const fileTimes = [];
    for (const word of ['readme', 'screen', 'notes', 'config']) {
        panel._entry.set_text('');
        await sleep(200);
        lateAt = null;
        await type(word.slice(0, -1), 60);
        const last = GLib.get_monotonic_time();
        await type(word.slice(-1), 0);
        await sleep(600);
        if (lateAt)
            fileTimes.push((lateAt - last) / 1000);
    }
    panel._render = render;
    note(`last keystroke to first file results (80 ms pause included): ${fileTimes.length ? stats(fileTimes) : 'none arrived'}`);
    panel.close();
    await sleep(1000);
    note(`rss after use: ${rssKb()} kB`);
    note(`cpu while closed after use, 30 s: ${(await idle(30)).toFixed(2)} % of one core`);
}
