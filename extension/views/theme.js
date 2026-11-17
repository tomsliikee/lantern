// Which colour scheme the panel wears: light or dark, as Lantern's scheme
// setting says, or as the desktop says when it is "system".
//
// Read when the panel opens, never watched while it is closed, so a switch
// made while the panel is hidden is in effect at the next opening.

import Gio from 'gi://Gio';

import {schemeName} from '../lib/schemename.js';

export class Theme {
    // settings: Lantern's own (scheme); without them the desktop decides.
    constructor(settings = null) {
        this._settings = settings;
        this._interface = new Gio.Settings({schema_id: 'org.gnome.desktop.interface'});
    }

    // "light" or "dark"; cheap enough for every opening.
    get scheme() {
        return schemeName(this._interface.get_string('color-scheme'), this._settings?.get_string('scheme'));
    }

    destroy() {
        this._interface = null;
        this._settings = null;
    }
}
