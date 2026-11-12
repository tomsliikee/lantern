// Loads the script named in MS_SCRIPT and hands it what it needs to drive
// Material Search: the running extension, a virtual pointer and keyboard,
// screenshots and a log.

import Clutter from 'gi://Clutter';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Shell from 'gi://Shell';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';

const OUT = GLib.getenv('MS_OUT');
const sleep = ms => new Promise(resolve => GLib.timeout_add(GLib.PRIORITY_DEFAULT, ms, () => {
    resolve();
    return GLib.SOURCE_REMOVE;
}));

async function shot(name) {
    const stream = Gio.File.new_for_path(`${OUT}/shots/${name}.png`).replace(null, false, Gio.FileCreateFlags.NONE, null);
    const screenshot = new Shell.Screenshot();
    await new Promise(resolve => screenshot.screenshot(false, stream, (_source, result) => {
        try {
            screenshot.screenshot_finish(result);
        } catch (e) {
            logError(e);
        }
        resolve();
    }));
    stream.close(null);
}

const lines = [];
function note(line) {
    lines.push(line);
    GLib.file_set_contents(`${OUT}/log.txt`, `${lines.join('\n')}\n`);
}

// CPU time of this process (the shell) in milliseconds.
function cpuMs() {
    const [, bytes] = GLib.file_get_contents('/proc/self/stat');
    const fields = new TextDecoder().decode(bytes).split(') ')[1].split(' ');
    const ticks = Number(fields[11]) + Number(fields[12]);
    return ticks * 10;
}

function rssKb() {
    const [, bytes] = GLib.file_get_contents('/proc/self/status');
    return Number(/VmRSS:\s+(\d+)/.exec(new TextDecoder().decode(bytes))[1]);
}

export default class Driver extends Extension {
    enable() {
        this._run().catch(e => {
            note(`DRIVER ERROR ${e.message}\n${e.stack}`);
            global.context.terminate();
        });
    }

    disable() {}

    async _run() {
        await sleep(3000);
        for (let calm = 0, tries = 0; calm < 8 && tries < 60; tries++) {
            if (Main.layoutManager._startingUp || Main.overview.visible) {
                calm = 0;
                if (!Main.layoutManager._startingUp)
                    Main.overview.hide();
            } else {
                calm++;
            }
            await sleep(250);
        }
        const found = Main.extensionManager.lookup('material-search@thomashaiden');
        const extension = found?.stateObj?._panel ? found.stateObj : null;
        if (!extension && GLib.getenv('MS_WITHOUT') !== '1')
            throw new Error(`Material Search is not running: ${found?.error}`);
        const seat = Clutter.get_default_backend().get_default_seat();
        const pointer = seat.create_virtual_device(Clutter.InputDeviceType.POINTER_DEVICE);
        const keyboard = seat.create_virtual_device(Clutter.InputDeviceType.KEYBOARD_DEVICE);
        const time = () => GLib.get_monotonic_time();
        pointer.notify_absolute_motion(time(), 800, 500);
        const keyval = (value, down) => keyboard.notify_keyval(time(), value,
            down ? Clutter.KeyState.PRESSED : Clutter.KeyState.RELEASED);
        // keys: keyvals pressed together, the last one the key itself.
        const key = async (...values) => {
            for (const value of values)
                keyval(value, true);
            for (const value of [...values].reverse())
                keyval(value, false);
            await sleep(60);
        };
        const type = async (text, gap = 90) => {
            for (const ch of text) {
                const value = Clutter.unicode_to_keysym(ch.codePointAt(0));
                keyval(value, true);
                keyval(value, false);
                await sleep(gap);
            }
        };
        const script = await import(`file://${GLib.getenv('MS_SCRIPT')}`);
        await script.default({
            extension,
            panel: extension?._panel,
            settings: extension?._settings,
            shot, sleep, note, Main, key, type, cpuMs, rssKb, Clutter,
            desktop: new Gio.Settings({schema_id: 'org.gnome.desktop.interface'}),
            move: (x, y) => pointer.notify_absolute_motion(time(), x, y),
            press: () => pointer.notify_button(time(), Clutter.BUTTON_PRIMARY, Clutter.ButtonState.PRESSED),
            release: () => pointer.notify_button(time(), Clutter.BUTTON_PRIMARY, Clutter.ButtonState.RELEASED),
        });
        global.context.terminate();
    }
}
