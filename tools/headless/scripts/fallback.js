// What Enter does when nothing is found: the chosen row first and selected,
// the others below; Enter on Ask Ollama sends at once (needs Ollama running
// with the model from the settings); the ai switch takes the AI rows away.
export default async function ({panel, settings, shot, sleep, note, type, key, Clutter}) {
    const check = (ok, what) => note(`${ok ? 'PASS' : 'FAIL'} ${what}`);
    const ids = () => panel._rows.map(row => row.id).join(',');
    const query = 'was ist kmeans xqzv';

    panel.open();
    await sleep(600);
    await type(query);
    await sleep(1500);
    check(ids().startsWith('fallback:web,'), `by default the web is first (${ids()})`);
    panel.close();
    await sleep(400);

    settings.set_string('nothing-found', 'ollama');
    panel.open();
    await sleep(600);
    await type(query);
    await sleep(1500);
    await shot('fallback-1-ollama-first');
    check(ids() === 'fallback:ollama,fallback:web,fallback:files,fallback:claude,fallback:agy', `Ollama first, the others below (${ids()})`);
    check(panel._selected === 0, 'the first row is selected');
    await key(Clutter.KEY_Return);
    await sleep(1000);
    check(panel._ask?.provider.id === 'ollama', 'Enter switched to asking Ollama');
    check(panel._ask?.running === true, 'and sent the question at once');
    await sleep(14000);
    await shot('fallback-2-answer');
    check(panel._askCard.lastReply !== '', `Ollama answered (${panel._askCard.lastReply.slice(0, 60)}…)`);
    await key(Clutter.KEY_Escape);
    await sleep(400);
    panel.close();
    await sleep(400);

    settings.set_boolean('ai', false);
    panel.open();
    await sleep(600);
    await type(query);
    await sleep(1500);
    await shot('fallback-3-ai-off');
    check(ids() === 'fallback:web,fallback:files', `ai off: no AI rows, the web first (${ids()})`);
    settings.set_boolean('ai', true);
    settings.set_string('nothing-found', 'web');
    panel.close();
    await sleep(300);
}
