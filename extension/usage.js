// The use counts behind the ranking, in one small file of their own.
// Read once, in an idle moment after the extension starts; written at most
// once per closing of the panel, never while typing. Nothing leaves the
// machine.

import Gio from 'gi://Gio';
import GLib from 'gi://GLib';

import * as History from './lib/history.js';

export class Usage {
    constructor() {
        this._file = Gio.File.new_for_path(GLib.build_filenamev([GLib.get_user_data_dir(), 'material-search', 'usage.json']));
        this.data = History.empty();
        this._loaded = false;
        this._dirty = false;
        this.learning = true;
    }

    load() {
        if (this._loaded)
            return;
        this._loaded = true;
        try {
            const [, contents] = this._file.load_contents(null);
            this.data = History.prune(History.parse(new TextDecoder().decode(contents)), Date.now());
        } catch (e) {
            if (!e.matches?.(Gio.IOErrorEnum, Gio.IOErrorEnum.NOT_FOUND))
                console.debug(`Material Search: the use counts could not be read: ${e.message}`);
        }
    }

    record(query, id) {
        if (!this.learning || !id || !query.trim())
            return;
        this.load();
        History.record(this.data, query, id, Date.now());
        this._dirty = true;
    }

    forget() {
        History.forget(this.data);
        this._dirty = true;
        this.save();
    }

    save() {
        if (!this._dirty)
            return;
        this._dirty = false;
        const bytes = new TextEncoder().encode(History.serialize(this.data));
        try {
            GLib.mkdir_with_parents(this._file.get_parent().get_path(), 0o700);
        } catch {
            // Reported by the write below.
        }
        this._file.replace_contents_bytes_async(new GLib.Bytes(bytes), null, false,
            Gio.FileCreateFlags.PRIVATE | Gio.FileCreateFlags.REPLACE_DESTINATION, null, (file, result) => {
                try {
                    file.replace_contents_finish(result);
                } catch (e) {
                    console.error(`Material Search: the use counts could not be written: ${e.message}`);
                }
            });
    }
}
