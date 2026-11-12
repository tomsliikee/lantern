// Files by name, and on request inside documents, from LocalSearch.
//
// Asked only after two letters and a pause, and every new keystroke cancels
// the last question. The connection is made at the first file search, not
// before. The name query asks for no order and no joins across graphs:
// measured on this machine (163 000 files), that keeps it at 1 to 3 ms,
// where ordering by date or asking for folders took 100 to 600 ms.

import Gio from 'gi://Gio';
import GLib from 'gi://GLib';

import {gettext as _} from 'resource:///org/gnome/shell/extensions/extension.js';

import {folder, ftsQuery, size, when} from '../lib/format.js';
import {boost} from '../lib/history.js';
import {match, prepare, SCORE} from '../lib/matcher.js';
import {copy} from './calculator.js';
import {launchContext} from './apps.js';
import {fileIcon} from '../views/icons.js';

const SERVICE = 'org.freedesktop.LocalSearch3';
const ROWS = 40;
const WEEK_MS = 7 * 24 * 3600 * 1000;
// A file changed this week ranks a little higher.
const RECENT_BONUS = 25;

const NAME_QUERY = `SELECT ?url ?name ?modified ?size WHERE {
    GRAPH tracker:FileSystem {
        ?f fts:match ~match ; nfo:fileName ?name ; nie:url ?url .
        OPTIONAL { ?f nfo:fileLastModified ?modified }
        OPTIONAL { ?f nfo:fileSize ?size }
    }
} LIMIT ${ROWS}`;

const CONTENT_QUERY = `SELECT ?url ?name fts:snippet(?ie, "", "", "…", 8) WHERE {
    ?ie fts:match ~match ; nie:isStoredAs ?f .
    ?f nie:url ?url ; nfo:fileName ?name .
} LIMIT 20`;

let Tsparql = null;

async function loadTsparql() {
    if (Tsparql === null) {
        try {
            Tsparql = (await import('gi://Tsparql?version=3.0')).default;
        } catch (e) {
            console.debug(`Material Search: no TinySPARQL: ${e.message}`);
            Tsparql = false;
        }
    }
    return Tsparql;
}

function execute(statement, cancellable) {
    return new Promise((resolve, reject) => {
        statement.execute_async(cancellable, (_source, result) => {
            try {
                resolve(statement.execute_finish(result));
            } catch (e) {
                reject(e);
            }
        });
    });
}

function nextRow(cursor, cancellable) {
    return new Promise((resolve, reject) => {
        cursor.next_async(cancellable, (_source, result) => {
            try {
                resolve(cursor.next_finish(result));
            } catch (e) {
                reject(e);
            }
        });
    });
}

// The file manager's own "show in folder", which selects the file.
export function showInFolder(uri) {
    Gio.DBus.session.call('org.freedesktop.FileManager1', '/org/freedesktop/FileManager1',
        'org.freedesktop.FileManager1', 'ShowItems', new GLib.Variant('(ass)', [[uri], '']),
        null, Gio.DBusCallFlags.NONE, -1, null, (connection, result) => {
            try {
                connection.call_finish(result);
            } catch (e) {
                console.error(`Material Search: the folder could not be shown: ${e.message}`);
            }
        });
}

function openUri(uri) {
    try {
        Gio.AppInfo.launch_default_for_uri(uri, launchContext());
    } catch (e) {
        console.error(`Material Search: ${uri} could not be opened: ${e.message}`);
    }
}

// What kind of file, from its name alone; a name without an ending is
// asked of the disk, since it is often a folder.
function contentType(file, name) {
    if (!name.includes('.')) {
        try {
            if (file.query_file_type(Gio.FileQueryInfoFlags.NONE, null) === Gio.FileType.DIRECTORY)
                return 'inode/directory';
        } catch {
            // Gone meanwhile; the name's guess is as good as any.
        }
    }
    return Gio.content_type_guess(name, null)[0];
}

// The cached thumbnail of a file, if GNOME made one; never made here.
function thumbnailOf(uri) {
    const hash = GLib.compute_checksum_for_string(GLib.ChecksumType.MD5, uri, -1);
    for (const kind of ['large', 'x-large', 'normal']) {
        const path = GLib.build_filenamev([GLib.get_user_cache_dir(), 'thumbnails', kind, `${hash}.png`]);
        if (GLib.file_test(path, GLib.FileTest.EXISTS))
            return path;
    }
    return null;
}

export class FilesSource {
    constructor({history, onBattery}) {
        this.id = 'files';
        this.title = _('Files');
        this.cost = 'slow';
        this.canTop = false;
        this.minLength = 2;
        this._history = history;
        this._onBattery = onBattery;
        this._connection = null;
        this._connecting = null;
        this._statements = {};
        this._home = GLib.get_home_dir();
    }

    prepare() {}

    async _statement(name) {
        if (!this._connection) {
            this._connecting ??= (async () => {
                const lib = await loadTsparql();
                if (!lib)
                    return null;
                return new Promise(resolve => {
                    lib.SparqlConnection.bus_new_async(SERVICE, null, null, null, (_source, result) => {
                        try {
                            resolve(lib.SparqlConnection.bus_new_finish(result));
                        } catch (e) {
                            console.debug(`Material Search: LocalSearch is not there: ${e.message}`);
                            resolve(null);
                        }
                    });
                });
            })();
            this._connection = await this._connecting;
            this._connecting = null;
            if (!this._connection)
                return null;
        }
        this._statements[name] ??= this._connection.query_statement(name === 'name' ? NAME_QUERY : CONTENT_QUERY, null);
        return this._statements[name];
    }

    async search(queryTerms, query, now, cancellable) {
        const fts = ftsQuery(query);
        if (!fts)
            return [];
        const statement = await this._statement('name');
        if (!statement || cancellable.is_cancelled())
            return [];
        statement.bind_string('match', fts);
        const cursor = await execute(statement, cancellable);
        const results = [];
        try {
            while (await nextRow(cursor, cancellable)) {
                const uri = cursor.get_string(0)[0];
                const name = cursor.get_string(1)[0];
                const found = match(queryTerms, prepare(name));
                if (!uri || !name)
                    continue;
                const modifiedText = cursor.get_string(2)[0];
                const modified = modifiedText ? Date.parse(modifiedText) : NaN;
                const bytes = cursor.get_integer(3);
                results.push(this._result({uri, name, modified, bytes}, found, query, now));
            }
        } finally {
            cursor.close();
        }
        return results;
    }

    // Inside documents; only when asked for with "Search in Files".
    async searchContent(query, now, cancellable) {
        const fts = ftsQuery(query);
        if (!fts)
            return [];
        const statement = await this._statement('content');
        if (!statement)
            return [];
        statement.bind_string('match', fts);
        const cursor = await execute(statement, cancellable);
        const results = [];
        try {
            while (await nextRow(cursor, cancellable)) {
                const uri = cursor.get_string(0)[0];
                const name = cursor.get_string(1)[0];
                const snippet = (cursor.get_string(2)[0] ?? '').replace(/\s+/g, ' ').trim();
                if (!uri || !name)
                    continue;
                const result = this._result({uri, name, modified: NaN, bytes: -1}, null, query, now);
                result.id = `content:${uri}`;
                result.subtitle = snippet || result.subtitle;
                result.group = {id: 'content', title: _('In documents'), canTop: false};
                result.score = SCORE.substring;
                results.push(result);
            }
        } finally {
            cursor.close();
        }
        return results;
    }

    _result({uri, name, modified, bytes}, found, query, now) {
        const file = Gio.File.new_for_uri(uri);
        const path = file.get_path();
        const parent = path ? folder(GLib.path_get_dirname(path), this._home) : '';
        const type = contentType(file, name);
        const isFolder = type === 'inode/directory';
        const changed = when(modified, now, {today: _('edited today'), yesterday: _('edited yesterday')});
        const subtitle = [parent, changed].filter(Boolean).join(' · ');
        const historyId = `file:${uri}`;
        const recent = Number.isFinite(modified) && now - modified < WEEK_MS ? RECENT_BONUS : 0;
        const badge = {gicon: fileIcon(type)};
        return {
            id: historyId,
            historyId,
            kind: 'file',
            title: name,
            positions: found?.positions ?? [],
            subtitle,
            trail: isFolder || bytes < 0 ? '' : size(bytes),
            score: (found?.score ?? SCORE.keyword) + recent + boost(this._history.data, query, historyId, now),
            icon: badge,
            tone: 'neutral',
            shape: 'square',
            uri,
            activate: ctx => (ctx?.alternate ? showInFolder(uri) : openUri(uri)),
            actions: () => this._actions(uri, path, type, isFolder),
            preview: () => this._preview({uri, name, path, parent, type, isFolder, bytes, modified, now, badge}),
        };
    }

    _actions(uri, path, type, isFolder) {
        const list = [{label: _('Open'), icon: 'open', run: () => openUri(uri)}];
        if (!isFolder) {
            const preferred = Gio.AppInfo.get_default_for_type(type, false);
            for (const app of Gio.AppInfo.get_recommended_for_type(type).slice(0, 4)) {
                if (preferred && app.equal(preferred))
                    continue;
                list.push({
                    label: _('Open with %s').format(app.get_name()),
                    icon: 'next',
                    run: () => app.launch_uris([uri], launchContext()),
                });
            }
        }
        list.push({label: _('Show in folder'), icon: 'folder-open', run: () => showInFolder(uri)});
        list.push({label: _('Copy path'), icon: 'copy', run: () => copy(path ?? uri)});
        list.push({
            label: _('Move to trash'),
            icon: 'trash',
            run: () => Gio.File.new_for_uri(uri).trash_async(GLib.PRIORITY_DEFAULT, null, (file, result) => {
                try {
                    file.trash_finish(result);
                } catch (e) {
                    console.error(`Material Search: ${uri} could not be moved to the trash: ${e.message}`);
                }
            }),
        });
        return list;
    }

    _preview({uri, name, parent, type, isFolder, bytes, modified, now, badge}) {
        // On battery no picture is decoded for the preview.
        const thumbnail = this._onBattery() ? null : thumbnailOf(uri);
        const kind = [Gio.content_type_get_description(type), isFolder || bytes < 0 ? null : size(bytes)].filter(Boolean).join(' · ');
        const changed = when(modified, now, {today: _('Edited today'), yesterday: _('Edited yesterday')});
        return {
            hero: thumbnail ? {picture: thumbnail} : {icon: badge, tone: 'neutral', shape: 'square'},
            name,
            kind,
            text: [parent, Number.isFinite(modified) ? changed : null].filter(Boolean).join('\n'),
            buttons: [
                {label: _('Open'), icon: 'open', filled: true, run: () => openUri(uri)},
                {label: _('Show in folder'), run: () => showInFolder(uri)},
            ],
            list: [],
        };
    }

    destroy() {
        this._statements = {};
        this._connection?.close?.();
        this._connection = null;
    }
}
