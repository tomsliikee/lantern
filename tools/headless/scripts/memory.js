// Memory the extension adds to the shell, measured in one session: the
// shell starts without it (run with MS_WITHOUT=1), then it is enabled,
// used once, and the difference is taken after garbage collection.
export default async function ({sleep, note, rssKb, Main, type}) {
    const System = imports.system;
    const settle = async () => {
        for (let i = 0; i < 3; i++) {
            System.gc();
            await sleep(1500);
        }
        return rssKb();
    };
    await sleep(6000);
    const before = await settle();
    Main.extensionManager.enableExtension('material-search@thomashaiden');
    await sleep(4000);
    const enabled = await settle();
    const extension = Main.extensionManager.lookup('material-search@thomashaiden')?.stateObj;
    extension.toggle();
    await sleep(400);
    await type('fire', 120);
    await sleep(600);
    extension._panel.close();
    await sleep(800);
    const used = await settle();
    note(`rss without: ${before} kB`);
    note(`after enable: +${enabled - before} kB`);
    note(`after one search: +${used - before} kB`);
}
