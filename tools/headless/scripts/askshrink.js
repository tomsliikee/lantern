// Cases where the ask card gets smaller without the pill/panel switch:
// the thinking dots go away, a running answer is stopped, the card is left.
export default async function ({panel, shot, sleep, type, key, Clutter}) {
    panel.open();
    await sleep(600);
    await type('claude: erste frage');
    await key(Clutter.KEY_Return);
    await sleep(500);
    await shot('shrink-1-thinking');
    await key(Clutter.KEY_Escape);
    await sleep(900);
    await shot('shrink-2-after-stop');
    await key(Clutter.KEY_Escape);
    await sleep(900);
    await shot('shrink-3-after-leave');
    panel.close();
    await sleep(300);
}
