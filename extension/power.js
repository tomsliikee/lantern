// Whether the computer runs on battery, read when the panel opens and not
// watched in between: UPower's property is asked once per opening, and the
// answer counts from the first keystroke on. Until the first answer the
// computer counts as plugged in.

import Gio from 'gi://Gio';
import GLib from 'gi://GLib';

export class Power {
    constructor() {
        this.onBattery = false;
        this._cancellable = new Gio.Cancellable();
    }

    refresh() {
        Gio.DBus.system.call('org.freedesktop.UPower', '/org/freedesktop/UPower',
            'org.freedesktop.DBus.Properties', 'Get', new GLib.Variant('(ss)', ['org.freedesktop.UPower', 'OnBattery']),
            new GLib.VariantType('(v)'), Gio.DBusCallFlags.NONE, 500, this._cancellable, (connection, result) => {
                try {
                    const [value] = connection.call_finish(result).deepUnpack();
                    this.onBattery = value.deepUnpack() === true;
                } catch {
                    // No UPower: a desktop without a battery.
                }
            });
    }

    destroy() {
        this._cancellable.cancel();
    }
}
