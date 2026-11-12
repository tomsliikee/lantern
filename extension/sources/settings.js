// The panels of GNOME Settings, from their .desktop files, read once.

import Shell from 'gi://Shell';

import {gettext as _} from 'resource:///org/gnome/shell/extensions/extension.js';

import {matchAny, prepare} from '../lib/matcher.js';
import {boost} from '../lib/history.js';
import {launchContext} from './apps.js';
import {icon} from '../views/icons.js';

const PANEL_CATEGORY = 'X-GNOME-Settings-Panel';

export class SettingsSource {
    constructor({history}) {
        this.id = 'settings';
        this.title = _('Settings');
        this.cost = 'instant';
        this.canTop = true;
        this._history = history;
        this._entries = null;
        this._system = Shell.AppSystem.get_default();
        this._changedId = this._system.connect('installed-changed', () => {
            this._entries = null;
        });
    }

    get stale() {
        return this._entries === null;
    }

    prepare() {
        if (this._entries)
            return;
        this._entries = [];
        // The shell's own list, already read: GIO's would read every
        // .desktop file again (20 ms on the laptop).
        for (const info of this._system.get_installed()) {
            const categories = info.get_categories?.() ?? '';
            if (!categories.split(';').includes(PANEL_CATEGORY))
                continue;
            const others = (info.get_keywords?.() ?? []).map(keyword => prepare(keyword));
            const description = info.get_description();
            if (description)
                others.push(prepare(description));
            this._entries.push({info, id: info.get_id(), name: prepare(info.get_name()), others});
        }
    }

    search(queryTerms, query, now) {
        this.prepare();
        const results = [];
        for (const entry of this._entries) {
            const found = matchAny(queryTerms, entry.name, entry.others);
            if (!found)
                continue;
            const historyId = `setting:${entry.id}`;
            const open = () => entry.info.launch([], launchContext());
            const description = entry.info.get_description();
            results.push({
                id: historyId,
                historyId,
                kind: 'setting',
                title: entry.info.get_name(),
                positions: found.positions,
                subtitle: description ? _('Settings · %s').format(description) : _('Settings'),
                score: found.score + boost(this._history.data, query, historyId, now),
                icon: {gicon: icon('tune')},
                tone: 'neutral',
                shape: 'circle',
                activate: open,
                actions: () => [{label: _('Open in Settings'), icon: 'open', run: open}],
                preview: () => ({
                    hero: {icon: {gicon: entry.info.get_icon() ?? icon('tune')}, tone: 'secondary', shape: 'cookie9'},
                    name: entry.info.get_name(),
                    kind: _('Settings'),
                    text: description,
                    buttons: [{label: _('Open'), icon: 'open', filled: true, run: open}],
                    list: [],
                }),
            });
        }
        return results;
    }

    destroy() {
        this._system.disconnect(this._changedId);
        this._entries = null;
    }
}
