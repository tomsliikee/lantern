// Open windows, read at the first search after each opening: while the
// panel is closed nothing about windows is kept or watched.

import Meta from 'gi://Meta';
import Shell from 'gi://Shell';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import {gettext as _} from 'resource:///org/gnome/shell/extensions/extension.js';

import {matchAny, prepare} from '../lib/matcher.js';
import {boost} from '../lib/history.js';
import {icon} from '../views/icons.js';

// A window ranks a little below an app of the same name, so "fire" opens
// Firefox and lists its windows instead of jumping into one.
const WINDOW_BIAS = -30;

export class WindowsSource {
    constructor({history}) {
        this.id = 'windows';
        this.title = _('Windows');
        this.cost = 'instant';
        this.canTop = true;
        this._history = history;
        this._entries = null;
        this._tracker = Shell.WindowTracker.get_default();
    }

    // Forgets the windows of the last opening.
    opened() {
        this._entries = null;
    }

    closed() {
        this._entries = null;
    }

    prepare() {
        if (this._entries)
            return;
        const windows = global.display.get_tab_list(Meta.TabList.NORMAL_ALL, null);
        this._entries = windows.map(window => {
            const app = this._tracker.get_window_app(window);
            const title = window.get_title() ?? app?.get_name() ?? '';
            return {
                window,
                app,
                name: prepare(title),
                others: app ? [prepare(app.get_name())] : [],
            };
        });
    }

    search(queryTerms, query, now) {
        this.prepare();
        const results = [];
        for (const entry of this._entries) {
            const found = matchAny(queryTerms, entry.name, entry.others);
            if (!found)
                continue;
            const id = `window:${entry.window.get_stable_sequence()}`;
            const historyId = entry.app ? `window-of:${entry.app.get_id()}` : id;
            const workspace = entry.window.get_workspace();
            const where = workspace ? _('Workspace %d').format(workspace.index() + 1) : '';
            results.push({
                id,
                historyId,
                kind: 'window',
                title: entry.name.text,
                positions: found.positions,
                subtitle: [entry.app?.get_name(), where].filter(Boolean).join(' · '),
                trail: _('Window'),
                score: found.score + WINDOW_BIAS + boost(this._history.data, query, historyId, now),
                icon: {gicon: entry.app?.get_app_info()?.get_icon() ?? icon('window')},
                full: Boolean(entry.app?.get_app_info()?.get_icon()),
                tone: 'primary',
                shape: 'circle',
                activate: () => Main.activateWindow(entry.window),
                actions: () => this._actions(entry),
                preview: () => ({
                    hero: {icon: entry.app?.get_app_info()?.get_icon() ? {gicon: entry.app.get_app_info().get_icon()} : {gicon: icon('window')},
                        full: Boolean(entry.app?.get_app_info()?.get_icon()), tone: 'primary', shape: 'cookie9'},
                    name: entry.name.text,
                    kind: [entry.app?.get_name() ?? _('Window'), where].filter(Boolean).join(' · '),
                    buttons: [
                        {label: _('Switch'), icon: 'open', filled: true, run: () => Main.activateWindow(entry.window)},
                        {label: _('Close'), run: () => entry.window.delete(global.get_current_time())},
                    ],
                    list: [],
                }),
            });
        }
        return results;
    }

    _actions(entry) {
        const window = entry.window;
        const list = [
            {label: _('Switch to window'), icon: 'open', run: () => Main.activateWindow(window)},
        ];
        const here = global.workspace_manager.get_active_workspace();
        if (window.get_workspace() !== here && !window.is_on_all_workspaces()) {
            list.push({
                label: _('Move to this workspace'),
                icon: 'move',
                run: () => {
                    window.change_workspace(here);
                    Main.activateWindow(window);
                },
            });
        }
        if (window.can_minimize() && !window.minimized)
            list.push({label: _('Minimize'), icon: 'minimize', run: () => window.minimize()});
        if (window.can_close())
            list.push({label: _('Close window'), icon: 'close', run: () => window.delete(global.get_current_time())});
        return list;
    }

    destroy() {
        this._entries = null;
    }
}
