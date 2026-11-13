// The ask mode against the real programs (needs them installed and signed in).
export default async function ({panel, shot, sleep, type, key, Clutter}) {
    for (const name of ['claude', 'agy']) {
        panel.open();
        await sleep(600);
        await type(`${name}: Antworte in einem kurzen Satz: wofür steht rsync?`);
        await key(Clutter.KEY_Return);
        await sleep(25000);
        await shot(`askreal-${name}`);
        await key(Clutter.KEY_Escape);
        await sleep(300);
        panel.close();
        await sleep(400);
    }
}
