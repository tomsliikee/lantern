// Which colour scheme the panel wears: light or dark, as the desktop says.
//
// Read when the panel opens, never watched while it is closed, so a switch
// made while the panel is hidden is in effect at the next opening.

import Gio from 'gi://Gio';

import {schemeName} from '../lib/schemename.js';

export class Theme {
    constructor() {
        this._interface = new Gio.Settings({schema_id: 'org.gnome.desktop.interface'});
    }

    // "light" or "dark"; cheap enough for every opening.
    get scheme() {
        return schemeName(this._interface.get_string('color-scheme'));
    }

    destroy() {
        this._interface = null;
    }
}
