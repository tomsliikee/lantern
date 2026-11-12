// Installed apps. Their names are prepared once; installing or removing an
// app only marks the list as stale, and it is prepared again at the next
// search.

import Gio from 'gi://Gio';
import GioUnix from 'gi://GioUnix';
import GLib from 'gi://GLib';
import Shell from 'gi://Shell';

import * as AppFavorites from 'resource:///org/gnome/shell/ui/appFavorites.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import {gettext as _, ngettext} from 'resource:///org/gnome/shell/extensions/extension.js';

import {matchAny, prepare} from '../lib/matcher.js';
import {boost, usesThisWeek} from '../lib/history.js';
import {icon} from '../views/icons.js';

const SOFTWARE = 'org.gnome.Software.desktop';

export function launchContext() {
    return global.create_app_launch_context(global.get_current_time(), -1);
}

function workspaceOf(window) {
    const workspace = window.get_workspace();
    return workspace ? workspace.index() + 1 : null;
}

// The windows of an app, newest first, as rows of the preview.
export function windowRows(app, scheme) {
    return app.get_windows().slice(0, 3).map(window => ({
        title: window.get_title() ?? app.get_name(),
        subtitle: workspaceOf(window) ? _('Workspace %d').format(workspaceOf(window)) : '',
        icon: {gicon: icon('window')},
        tone: 'primary',
        shape: 'circle',
        scheme,
        activate: () => Main.activateWindow(window),
    }));
}

export class AppsSource {
    constructor({history}) {
        this.id = 'apps';
        this.title = _('Apps');
        this.cost = 'instant';
        this.canTop = true;
        this._history = history;
        this._system = Shell.AppSystem.get_default();
        this._entries = null;
        // Only marks the list; preparing waits for the next search.
        this._changedId = this._system.connect('installed-changed', () => {
            this._entries = null;
        });
    }

    // In the first idle moment after the extension starts, so the first
    // search after login does not pay for it.
    get stale() {
        return this._entries === null;
    }

    prepare() {
        if (this._entries)
            return;
        this._entries = [];
        for (const info of this._system.get_installed()) {
            if (!info.should_show())
                continue;
            const id = info.get_id();
            const others = [];
            const generic = info.get_generic_name?.();
            if (generic)
                others.push(prepare(generic));
            for (const keyword of info.get_keywords?.() ?? [])
                others.push(prepare(keyword));
            const executable = info.get_executable();
            if (executable)
                others.push(prepare(GLib.path_get_basename(executable)));
            others.push(prepare(id.replace(/\.desktop$/, '').split('.').pop()));
            this._entries.push({info, id, name: prepare(info.get_name()), others});
        }
    }

    search(queryTerms, query, now) {
        this.prepare();
        const results = [];
        for (const entry of this._entries) {
            const found = matchAny(queryTerms, entry.name, entry.others);
            if (!found)
                continue;
            results.push(this._result(entry, found, query, now));
        }
        return results;
    }

    _result(entry, found, query, now) {
        const historyId = `app:${entry.id}`;
        const source = this;
        return {
            id: historyId,
            historyId,
            kind: 'app',
            title: entry.info.get_name(),
            positions: found.positions,
            score: found.score + boost(this._history.data, query, historyId, now),
            icon: {gicon: entry.info.get_icon()},
            full: true,
            tone: 'secondary',
            shape: 'cookie6',
            trail: _('App'),
            get subtitle() {
                return source._subtitle(entry);
            },
            activate: ctx => this._open(entry, ctx),
            actions: () => this._actions(entry),
            preview: () => this._preview(entry, historyId, now),
        };
    }

    _app(entry) {
        return this._system.lookup_app(entry.id);
    }

    _subtitle(entry) {
        const app = this._app(entry);
        const windows = app?.get_n_windows() ?? 0;
        if (windows > 0)
            return ngettext('App · %d window open', 'App · %d windows open', windows).format(windows);
        return entry.info.get_description() || entry.info.get_generic_name?.() || _('App');
    }

    // To its last window when it has one, as the dash does.
    _open(entry) {
        const app = this._app(entry);
        if (app)
            app.activate();
        else
            entry.info.launch([], launchContext());
    }

    _newWindow(entry) {
        const app = this._app(entry);
        if (app?.can_open_new_window())
            app.open_new_window(-1);
        else
            entry.info.launch([], launchContext());
    }

    _actions(entry) {
        const app = this._app(entry);
        const list = [
            {label: _('Open'), icon: 'open', run: () => this._open(entry)},
        ];
        if (app?.can_open_new_window())
            list.push({label: _('New window'), icon: 'add', run: () => this._newWindow(entry)});
        const own = new Set(list.map(item => item.label.toLowerCase()));
        for (const action of entry.info.list_actions()) {
            // The app's own "New Window" is the same as the one above.
            if (own.has(entry.info.get_action_name(action).toLowerCase()))
                continue;
            list.push({
                label: entry.info.get_action_name(action),
                icon: 'next',
                run: () => entry.info.launch_action(action, launchContext()),
            });
        }
        const favorites = AppFavorites.getAppFavorites();
        if (favorites.isFavorite(entry.id))
            list.push({label: _('Unpin from dash'), icon: 'pin', run: () => favorites.removeFavorite(entry.id), stay: true});
        else
            list.push({label: _('Pin to dash'), icon: 'pin', run: () => favorites.addFavorite(entry.id), stay: true});
        if (GioUnix.DesktopAppInfo.new(SOFTWARE)) {
            list.push({
                label: _('Show details'),
                icon: 'info',
                run: () => {
                    try {
                        Gio.Subprocess.new(['gnome-software', `--details=${entry.id}`], Gio.SubprocessFlags.NONE);
                    } catch (e) {
                        console.error(`Material Search: Software did not start: ${e.message}`);
                    }
                },
            });
        }
        if (app && app.get_n_windows() > 0)
            list.push({label: _('Quit'), icon: 'close', run: () => app.request_quit()});
        return list;
    }

    _preview(entry, historyId, now) {
        const app = this._app(entry);
        const uses = usesThisWeek(this._history.data, historyId, now);
        const kind = entry.info.get_generic_name?.() || entry.info.get_description() || _('App');
        const parts = [kind];
        if (uses > 0)
            parts.push(ngettext('used %d time this week', 'used %d times this week', uses).format(uses));
        const buttons = [{label: _('Open'), icon: 'open', filled: true, run: () => this._open(entry)}];
        if (app?.can_open_new_window())
            buttons.push({label: _('New window'), run: () => this._newWindow(entry)});
        return {
            hero: {icon: {gicon: entry.info.get_icon()}, full: true, tone: 'primary', shape: 'cookie9'},
            name: entry.info.get_name(),
            kind: parts.join(' · '),
            buttons,
            listTitle: app && app.get_n_windows() > 0 ? _('Open windows') : null,
            list: app ? windowRows(app) : [],
        };
    }

    destroy() {
        this._system.disconnect(this._changedId);
        this._entries = null;
    }
}
