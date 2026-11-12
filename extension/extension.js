// Material Search: a launcher for GNOME Shell in the manner of Spotlight.
//
// While closed it costs nothing: the only things that wait are the key
// binding and a few change signals that mark an index as stale.

import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Meta from 'gi://Meta';
import Shell from 'gi://Shell';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as MessageTray from 'resource:///org/gnome/shell/ui/messageTray.js';
import {Extension, gettext as _} from 'resource:///org/gnome/shell/extensions/extension.js';

import {conflicts, normalize} from './lib/shortcut.js';
import {Power} from './power.js';
import {ActionsSource} from './sources/actions.js';
import {AppsSource} from './sources/apps.js';
import {CalculatorSource} from './sources/calculator.js';
import {FilesSource} from './sources/files.js';
import {ProvidersSource} from './sources/providers.js';
import {SettingsSource} from './sources/settings.js';
import {WindowsSource} from './sources/windows.js';
import {Usage} from './usage.js';
import {setFolder} from './views/icons.js';
import {Panel} from './views/panel.js';
import {Theme} from './views/theme.js';

const SHORTCUT = 'toggle-shortcut';
const SUPER_SPACE = '<Super>space';
const CTRL_SPACE = '<Control>space';
const INPUT_SCHEMA = 'org.gnome.desktop.wm.keybindings';
const INPUT_KEY = 'switch-input-source';

export default class MaterialSearchExtension extends Extension {
    enable() {
        this.initTranslations();
        setFolder(this.path);
        this._settings = this.getSettings();
        this._usage = new Usage();
        this._usage.learning = this._settings.get_boolean('learn');
        this._power = new Power();
        this._theme = new Theme();

        const history = this._usage;
        this._sources = {
            apps: new AppsSource({history}),
            windows: new WindowsSource({history}),
            settings: new SettingsSource({history}),
            actions: new ActionsSource({history}),
            calculator: new CalculatorSource(),
            files: new FilesSource({history, onBattery: () => this._power.onBattery}),
            providers: new ProvidersSource({enabled: () => this._settings.get_strv('providers')}),
        };
        const order = ['apps', 'windows', 'settings', 'actions', 'calculator', 'files'];
        const active = () => {
            const on = new Set(this._settings.get_strv('sources'));
            const list = order.filter(id => on.has(id)).map(id => this._sources[id]);
            if (this._sources.providers.active)
                list.push(this._sources.providers);
            return list;
        };

        this._panel = new Panel({
            settings: this._settings,
            theme: this._theme,
            usage: this._usage,
            sources: active,
            files: () => (this._settings.get_strv('sources').includes('files') ? this._sources.files : null),
            power: this._power,
            onOpened: started => {
                this._sources.windows.opened();
                this._prepareStale();
                if (GLib.getenv('MATERIAL_SEARCH_DEBUG'))
                    console.log(`Material Search: opened in ${(GLib.get_monotonic_time() - started) / 1000} ms of work`);
            },
        });
        this._panel.onClosed = () => this._sources.windows.closed();

        Main.wm.addKeybinding(SHORTCUT, this._settings, Meta.KeyBindingFlags.IGNORE_AUTOREPEAT,
            Shell.ActionMode.NORMAL | Shell.ActionMode.OVERVIEW | Shell.ActionMode.POPUP, () => this.toggle());

        this._settingsIds = [
            this._settings.connect('changed::learn', () => {
                this._usage.learning = this._settings.get_boolean('learn');
            }),
            this._settings.connect('changed::forget-requested', () => this._usage.forget()),
        ];

        // The indexes are built once, in the first idle moment, so even the
        // first opening after login answers at once.
        this._idle = GLib.idle_add(GLib.PRIORITY_LOW, () => {
            this._idle = 0;
            this._usage.load();
            for (const id of ['apps', 'settings', 'actions'])
                this._sources[id].prepare();
            this._panel.warm();
            return GLib.SOURCE_REMOVE;
        });

        this._askAboutShortcut();
    }

    // An index marked stale (an app was installed) is rebuilt right after
    // the panel's first frame, before the first key can arrive.
    _prepareStale() {
        if (this._staleIdle || !['apps', 'settings'].some(id => this._sources[id].stale))
            return;
        this._staleIdle = GLib.idle_add(GLib.PRIORITY_DEFAULT_IDLE, () => {
            this._staleIdle = 0;
            for (const id of ['apps', 'settings'])
                this._sources[id].prepare();
            return GLib.SOURCE_REMOVE;
        });
    }

    toggle() {
        if (this._panel.isOpen) {
            this._panel.close();
            return;
        }
        // It is not the overview and does not start it; from the overview
        // it opens over the desktop.
        if (Main.overview.visible)
            Main.overview.hide();
        else if (Main.modalCount > 0)
            return;
        this._panel.open();
    }

    // On the first enable: Super+Space also switches input sources. The
    // launcher opens with Ctrl+Space for now and asks once.
    _askAboutShortcut() {
        if (this._settings.get_boolean('shortcut-asked'))
            return;
        const input = new Gio.Settings({schema_id: INPUT_SCHEMA});
        const wanted = this._settings.get_strv(SHORTCUT);
        const taken = conflicts(wanted, [{schema: INPUT_SCHEMA, key: INPUT_KEY, accelerators: input.get_strv(INPUT_KEY)}]);
        if (taken.length === 0 || !wanted.some(a => normalize(a) === normalize(SUPER_SPACE))) {
            this._settings.set_boolean('shortcut-asked', true);
            return;
        }
        this._settings.set_strv(SHORTCUT, [CTRL_SPACE]);
        const source = MessageTray.getSystemSource();
        const notification = new MessageTray.Notification({
            source,
            title: _('Material Search opens with Ctrl+Space'),
            body: _('Super+Space switches input sources. Take it for the launcher? Shift+Super+Space keeps switching input sources.'),
            isTransient: false,
        });
        notification.addAction(_('Use Super+Space'), () => {
            takeSuperSpace(this._settings);
            this._settings.set_boolean('shortcut-asked', true);
        });
        notification.addAction(_('Keep Ctrl+Space'), () => this._settings.set_boolean('shortcut-asked', true));
        source.addNotification(notification);
    }

    disable() {
        Main.wm.removeKeybinding(SHORTCUT);
        for (const id of ['_idle', '_staleIdle']) {
            if (this[id]) {
                GLib.source_remove(this[id]);
                this[id] = 0;
            }
        }
        for (const id of this._settingsIds)
            this._settings.disconnect(id);
        this._settingsIds = [];
        this._panel.destroy();
        this._panel = null;
        for (const source of Object.values(this._sources))
            source.destroy();
        this._sources = null;
        this._theme.destroy();
        this._theme = null;
        this._power.destroy();
        this._power = null;
        this._usage = null;
        this._settings = null;
    }
}

// Removes Super+Space from the input source switch, notes what was taken
// so the settings window can give it back, and gives it to the launcher.
export function takeSuperSpace(settings) {
    const input = new Gio.Settings({schema_id: INPUT_SCHEMA});
    const before = input.get_strv(INPUT_KEY);
    const kept = before.filter(a => normalize(a) !== normalize(SUPER_SPACE));
    const removed = before.filter(a => normalize(a) === normalize(SUPER_SPACE));
    if (removed.length > 0) {
        input.set_strv(INPUT_KEY, kept);
        settings.set_strv('input-source-taken', removed);
    }
    settings.set_strv(SHORTCUT, [SUPER_SPACE]);
}
