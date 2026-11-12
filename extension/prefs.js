// The settings window of the Extensions app.

import Adw from 'gi://Adw';
import Gdk from 'gi://Gdk';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Gtk from 'gi://Gtk';

import {ExtensionPreferences, gettext as _} from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

import {installedProviders} from './lib/providerlist.js';
import {conflicts, normalize} from './lib/shortcut.js';
import {colors, serifFamily, sizes} from './lib/tokens.js';

const SUPER_SPACE = '<Super>space';
const INPUT_SCHEMA = 'org.gnome.desktop.wm.keybindings';
const INPUT_KEY = 'switch-input-source';
// Where GNOME keeps its own shortcuts, to say when one is taken.
const BINDING_SCHEMAS = [
    'org.gnome.desktop.wm.keybindings',
    'org.gnome.shell.keybindings',
    'org.gnome.mutter.keybindings',
    'org.gnome.mutter.wayland.keybindings',
    'org.gnome.settings-daemon.plugins.media-keys',
];
const SOURCES = [
    ['apps', () => _('Apps'), () => _('Installed apps, by name, kind and keywords.')],
    ['windows', () => _('Windows'), () => _('Open windows, by title.')],
    ['settings', () => _('Settings'), () => _('The panels of GNOME Settings.')],
    ['actions', () => _('System actions'), () => _('Lock, log out, suspend, restart, power off. The last three ask in GNOME’s own dialog.')],
    ['calculator', () => _('Calculator and units'), () => _('Sums and conversions, worked out on this computer.')],
    ['files', () => _('Files by name'), () => _('From LocalSearch, after two letters and a short pause.')],
];
const ENGINES = [
    ['google', 'Google'], ['duckduckgo', 'DuckDuckGo'], ['startpage', 'Startpage'],
    ['ecosia', 'Ecosia'], ['bing', 'Bing'], ['custom', null],
];
const COMPACT = ['auto', 'never', 'always'];

// The Mono look for the window: its grounds and cards from the design
// system's colours, light or dark as the desktop is, the serif for the
// headings. Adwaita's named colours are overridden; nothing else changes.
function mono(scheme) {
    const c = colors[scheme];
    const serif = serifFamily.split(',')[0].trim();
    return `
@define-color window_bg_color ${c.bg};
@define-color window_fg_color ${c.ink};
@define-color view_bg_color ${c.bg};
@define-color view_fg_color ${c.ink};
@define-color headerbar_bg_color ${c.bg};
@define-color headerbar_fg_color ${c.ink};
@define-color headerbar_border_color transparent;
@define-color card_bg_color ${c.card};
@define-color card_fg_color ${c.ink};
@define-color card_shade_color transparent;
@define-color accent_bg_color ${c.solid};
@define-color accent_fg_color ${c['on-solid']};
@define-color accent_color ${c.ink};
@define-color popover_bg_color ${c.bar};
@define-color dialog_bg_color ${c.bg};
@define-color sidebar_bg_color ${c.bg};
.ms-prefs preferencespage > scrolledwindow > viewport > clamp > box { margin-top: ${sizes['space-card']}px; }
.ms-prefs preferencesgroup { margin-bottom: ${sizes['space-card-gap'] - 12}px; }
.ms-prefs preferencesgroup list.boxed-list { border-radius: ${sizes['radius-card']}px; box-shadow: none; border: none; background-color: ${c.card}; }
.ms-prefs row { background-color: transparent; min-height: 52px; }
.ms-prefs row:hover { background-color: ${c.fill}; }
.ms-prefs row .title { font-weight: 400; }
.ms-prefs preferencesgroup > box > box > box > label,
.ms-prefs preferencesgroup > box > box > label {
    font-family: "${serif}", serif; font-size: 24px; font-weight: 400; letter-spacing: -0.24px; margin-bottom: ${sizes['space-block'] - 6}px;
}
.ms-prefs label.ms-title { font-family: "${serif}", serif; font-size: 38px; font-weight: 400; letter-spacing: -0.76px; margin-top: 4px; }
.ms-prefs switch { background-color: ${c.fill}; border-radius: 9999px; }
.ms-prefs switch:checked { background-color: ${c.solid}; }
.ms-prefs switch slider { background-color: ${c.ink2}; }
.ms-prefs switch:checked slider { background-color: ${c['on-solid']}; }
.ms-prefs button { border-radius: 9999px; box-shadow: none; background-color: ${c.fill}; color: ${c.ink}; }
.ms-prefs button.destructive-action { background-color: ${c.fill}; color: ${c.down}; }
.ms-prefs .dim-label, .ms-prefs row .subtitle { color: ${c.ink2}; }
`;
}

function applyLook(window) {
    const provider = new Gtk.CssProvider();
    const style = Adw.StyleManager.get_default();
    const load = () => provider.load_from_string(mono(style.dark ? 'dark' : 'light'));
    load();
    Gtk.StyleContext.add_provider_for_display(Gdk.Display.get_default(), provider, Gtk.STYLE_PROVIDER_PRIORITY_APPLICATION);
    window.add_css_class('ms-prefs');
    const id = style.connect('notify::dark', load);
    window.connect('close-request', () => {
        style.disconnect(id);
        Gtk.StyleContext.remove_provider_for_display(Gdk.Display.get_default(), provider);
        return false;
    });
}

function desktopBindings() {
    const source = Gio.SettingsSchemaSource.get_default();
    const bindings = [];
    for (const id of BINDING_SCHEMAS) {
        const schema = source.lookup(id, true);
        if (!schema)
            continue;
        const settings = new Gio.Settings({schema_id: id});
        for (const key of schema.list_keys()) {
            if (schema.get_key(key).get_value_type().dup_string() !== 'as')
                continue;
            bindings.push({schema: id, key, accelerators: settings.get_strv(key)});
        }
    }
    return bindings;
}

function askForShortcut(parent, onChosen) {
    const dialog = new Adw.Window({transient_for: parent, modal: true, default_width: 380, default_height: 180, title: _('Shortcut')});
    dialog.set_content(new Adw.StatusPage({title: _('Press the keys'), description: _('Escape leaves it as it is.')}));
    const keys = new Gtk.EventControllerKey();
    keys.connect('key-pressed', (_keys, keyval, _keycode, state) => {
        const modifiers = state & Gtk.accelerator_get_default_mod_mask();
        if (keyval === Gdk.KEY_Escape && modifiers === 0) {
            dialog.close();
            return true;
        }
        if (!Gtk.accelerator_valid(keyval, modifiers) && !(keyval === Gdk.KEY_space && modifiers !== 0))
            return true;
        onChosen(Gtk.accelerator_name(keyval, modifiers));
        dialog.close();
        return true;
    });
    dialog.add_controller(keys);
    dialog.present();
}

function generalPage(settings, window) {
    const page = new Adw.PreferencesPage({title: _('General'), icon_name: 'preferences-system-symbolic'});

    // The window's title, in the serif, as on the design page.
    const title = new Gtk.Label({label: 'Material Search', xalign: 0, css_classes: ['ms-title']});
    const head = new Adw.PreferencesGroup();
    head.add(title);
    page.add(head);

    const opening = new Adw.PreferencesGroup({title: _('Opening')});
    const shortcut = new Adw.ActionRow({title: _('Shortcut')});
    const keys = new Gtk.ShortcutLabel({disabled_text: _('None'), valign: Gtk.Align.CENTER});
    const change = new Gtk.Button({label: _('Change'), valign: Gtk.Align.CENTER});
    change.connect('clicked', () => askForShortcut(window, accelerator => settings.set_strv('toggle-shortcut', [accelerator])));
    shortcut.add_suffix(keys);
    shortcut.add_suffix(change);
    opening.add(shortcut);

    // Super+Space and the input source switch.
    const input = new Gio.Settings({schema_id: INPUT_SCHEMA});
    const superRow = new Adw.ActionRow({title: _('Super+Space')});
    const superButton = new Gtk.Button({valign: Gtk.Align.CENTER});
    superRow.add_suffix(superButton);
    opening.add(superRow);
    superButton.connect('clicked', () => {
        const taken = settings.get_strv('input-source-taken');
        if (taken.length > 0) {
            // Gives Super+Space back to the input sources.
            const now = input.get_strv(INPUT_KEY);
            input.set_strv(INPUT_KEY, [...taken, ...now.filter(a => !taken.some(t => normalize(t) === normalize(a)))]);
            settings.set_strv('input-source-taken', []);
            settings.set_strv('toggle-shortcut', ['<Control>space']);
        } else {
            const before = input.get_strv(INPUT_KEY);
            const removed = before.filter(a => normalize(a) === normalize(SUPER_SPACE));
            input.set_strv(INPUT_KEY, before.filter(a => normalize(a) !== normalize(SUPER_SPACE)));
            settings.set_strv('input-source-taken', removed);
            settings.set_strv('toggle-shortcut', [SUPER_SPACE]);
        }
        settings.set_boolean('shortcut-asked', true);
    });

    const refreshShortcut = () => {
        const wanted = settings.get_strv('toggle-shortcut');
        keys.accelerator = wanted[0] ?? '';
        const clashes = conflicts(wanted, desktopBindings());
        shortcut.subtitle = clashes.length > 0
            ? _('Taken by GNOME as well (%s). Choose another, or free it there.').format(clashes.map(c => c.key).join(', '))
            : _('Opens and closes the launcher.');
        const taken = settings.get_strv('input-source-taken');
        const switching = input.get_strv(INPUT_KEY).some(a => normalize(a) === normalize(SUPER_SPACE));
        if (taken.length > 0) {
            superRow.subtitle = _('Taken from the input source switch; Shift+Super+Space still switches.');
            superButton.label = _('Give back');
            superRow.visible = true;
        } else if (switching) {
            superRow.subtitle = _('Switches input sources now. Take it for the launcher; Shift+Super+Space keeps switching.');
            superButton.label = _('Take');
            superRow.visible = true;
        } else {
            superRow.visible = false;
        }
    };
    settings.connect('changed::toggle-shortcut', refreshShortcut);
    settings.connect('changed::input-source-taken', refreshShortcut);
    input.connect(`changed::${INPUT_KEY}`, refreshShortcut);
    refreshShortcut();
    page.add(opening);

    const look = new Adw.PreferencesGroup({title: _('Look')});
    const compact = new Adw.ComboRow({
        title: _('Preview column'),
        subtitle: _('Beside the results, for the selected one.'),
        model: Gtk.StringList.new([_('On wide screens'), _('Always'), _('Never')]),
    });
    compact.selected = Math.max(0, COMPACT.indexOf(settings.get_string('compact')));
    compact.connect('notify::selected', () => settings.set_string('compact', COMPACT[compact.selected]));
    look.add(compact);
    const seeThrough = new Adw.SwitchRow({title: _('See-through'), subtitle: _('Lets the windows show through the panel.')});
    settings.bind('see-through', seeThrough, 'active', Gio.SettingsBindFlags.DEFAULT);
    look.add(seeThrough);
    page.add(look);

    const motion = new Adw.PreferencesGroup({title: _('Motion')});
    const animations = new Adw.SwitchRow({title: _('Motion'), subtitle: _('The pill scales in, the panel grows. Follows GNOME’s animation setting too.')});
    settings.bind('animations', animations, 'active', Gio.SettingsBindFlags.DEFAULT);
    const battery = new Adw.SwitchRow({title: _('Calm on battery'), subtitle: _('On battery the panel simply appears.')});
    settings.bind('calm-on-battery', battery, 'active', Gio.SettingsBindFlags.DEFAULT);
    motion.add(animations);
    motion.add(battery);
    page.add(motion);
    return page;
}

function sourcesPage(settings) {
    const page = new Adw.PreferencesPage({title: _('Sources'), icon_name: 'system-search-symbolic'});
    const group = new Adw.PreferencesGroup({title: _('What is searched'), description: _('Everything stays on this computer.')});
    for (const [id, title, subtitle] of SOURCES) {
        const row = new Adw.SwitchRow({title: title(), subtitle: subtitle()});
        const refresh = () => {
            row.active = settings.get_strv('sources').includes(id);
        };
        refresh();
        row.connect('notify::active', () => {
            const list = settings.get_strv('sources');
            if (row.active && !list.includes(id))
                settings.set_strv('sources', [...list, id]);
            else if (!row.active && list.includes(id))
                settings.set_strv('sources', list.filter(s => s !== id));
        });
        settings.connect('changed::sources', refresh);
        group.add(row);
    }
    page.add(group);

    const providers = new Adw.PreferencesGroup({
        title: _('Other apps'),
        description: _('Apps that offer GNOME their own search. Each one is asked over D-Bus after the fast results, and left out when it takes longer than 300 ms.'),
    });
    const installed = installedProviders();
    if (installed.length === 0)
        providers.add(new Adw.ActionRow({title: _('No app here offers a search.')}));
    for (const provider of installed) {
        const row = new Adw.SwitchRow({title: provider.name});
        row.active = settings.get_strv('providers').includes(provider.id);
        row.connect('notify::active', () => {
            const list = settings.get_strv('providers');
            if (row.active && !list.includes(provider.id))
                settings.set_strv('providers', [...list, provider.id]);
            else if (!row.active)
                settings.set_strv('providers', list.filter(p => p !== provider.id));
        });
        providers.add(row);
    }
    page.add(providers);

    const web = new Adw.PreferencesGroup({title: _('The web'), description: _('Only when you choose “Search the web”: the text is handed to your browser.')});
    const engine = new Adw.ComboRow({
        title: _('Search engine'),
        model: Gtk.StringList.new(ENGINES.map(([, name]) => name ?? _('Other'))),
    });
    engine.selected = Math.max(0, ENGINES.findIndex(([id]) => id === settings.get_string('web-engine')));
    const custom = new Adw.EntryRow({title: _('Address, with %s for the search'), text: settings.get_string('web-template')});
    custom.connect('changed', () => settings.set_string('web-template', custom.text));
    const refresh = () => {
        custom.visible = ENGINES[engine.selected][0] === 'custom';
    };
    engine.connect('notify::selected', () => {
        settings.set_string('web-engine', ENGINES[engine.selected][0]);
        refresh();
    });
    refresh();
    web.add(engine);
    web.add(custom);
    page.add(web);
    return page;
}

function privacyPage(settings) {
    const page = new Adw.PreferencesPage({title: _('Privacy'), icon_name: 'security-medium-symbolic'});
    const group = new Adw.PreferencesGroup({
        title: _('Ranking'),
        description: _('What you open for what you typed is counted in ~/.local/share/material-search/usage.json, so it comes first next time. Counts fade over two weeks. Nothing leaves the computer.'),
    });
    const learn = new Adw.SwitchRow({title: _('Rank by use')});
    settings.bind('learn', learn, 'active', Gio.SettingsBindFlags.DEFAULT);
    const forget = new Adw.ActionRow({title: _('Forget what was opened')});
    const button = new Gtk.Button({label: _('Forget'), valign: Gtk.Align.CENTER, css_classes: ['destructive-action']});
    button.connect('clicked', () => {
        settings.set_int64('forget-requested', GLib.get_real_time());
        forget.subtitle = _('Forgotten.');
    });
    forget.add_suffix(button);
    group.add(learn);
    group.add(forget);
    page.add(group);
    return page;
}

export default class MaterialSearchPreferences extends ExtensionPreferences {
    fillPreferencesWindow(window) {
        const settings = this.getSettings();
        window.search_enabled = false;
        applyLook(window);
        window.add(generalPage(settings, window));
        window.add(sourcesPage(settings));
        window.add(privacyPage(settings));
    }
}
