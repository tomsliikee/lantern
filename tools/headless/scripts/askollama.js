// The ask mode against the local Ollama server (needs it running with the
// model from the settings), a follow-up, and the switch that turns AI off.
export default async function ({panel, settings, shot, sleep, type, key, Clutter}) {
    panel.open();
    await sleep(600);
    await type('ollama: Antworte in einem kurzen Satz: wofür steht rsync?');
    await sleep(300);
    await key(Clutter.KEY_Return);
    await sleep(14000);
    await shot('ollama-1-answer');
    await type('und wofür steht ssh?');
    await key(Clutter.KEY_Return);
    await sleep(12000);
    await shot('ollama-2-followup');
    await key(Clutter.KEY_Escape);
    await sleep(400);
    settings.set_boolean('ai', false);
    await type('ollama: noch eine');
    await sleep(700);
    await shot('ollama-3-ai-off');
    settings.set_boolean('ai', true);
    panel.close();
    await sleep(300);
}
