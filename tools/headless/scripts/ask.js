// The ask mode against a stand-in program (put its folder first in PATH):
// chip, thinking, streaming, a follow-up, Esc to stop, Esc to leave.
export default async function ({panel, shot, sleep, type, key, Clutter}) {
    panel.open();
    await sleep(600);
    await type('claude: wie sortiere ich in js ein array');
    await sleep(500);
    await shot('ask-1-chip');
    await key(Clutter.KEY_Return);
    await sleep(900);
    await shot('ask-2-thinking');
    await sleep(2400);
    await shot('ask-3-streaming');
    await sleep(3500);
    await shot('ask-4-answer');
    await type('und absteigend?');
    await key(Clutter.KEY_Return);
    await sleep(3000);
    await shot('ask-5-followup-streaming');
    await sleep(3500);
    await shot('ask-6-followup-done');
    await key(Clutter.KEY_Escape);
    await sleep(700);
    await shot('ask-7-back-to-search');
    await type('claude: noch eine');
    await key(Clutter.KEY_Return);
    await sleep(800);
    await key(Clutter.KEY_Escape);
    await sleep(500);
    await shot('ask-8-stopped');
    await key(Clutter.KEY_Escape);
    await sleep(500);
    await type('fire');
    await sleep(700);
    await shot('ask-9-normal-search-again');
    panel.close();
    await sleep(400);
}
