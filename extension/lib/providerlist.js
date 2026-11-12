// The search providers installed on this computer, for the settings
// window, which cannot load the shell's own code: [{id, name}].

import Gio from 'gi://Gio';
import GioUnix from 'gi://GioUnix';
import GLib from 'gi://GLib';

// The installed providers, for the settings window: [{id, name}].
export function installedProviders() {
    const found = new Map();
    for (const dir of [GLib.get_user_data_dir(), ...GLib.get_system_data_dirs()]) {
        const folder = Gio.File.new_for_path(GLib.build_filenamev([dir, 'gnome-shell', 'search-providers']));
        let children;
        try {
            children = folder.enumerate_children('standard::name', Gio.FileQueryInfoFlags.NONE, null);
        } catch {
            continue;
        }
        for (const info of children) {
            const keyfile = new GLib.KeyFile();
            try {
                keyfile.load_from_file(folder.get_child(info.get_name()).get_path(), GLib.KeyFileFlags.NONE);
                const id = keyfile.get_string('Shell Search Provider', 'DesktopId');
                const app = GioUnix.DesktopAppInfo.new(id);
                if (app && !found.has(id))
                    found.set(id, {id, name: app.get_name()});
            } catch {
                // Not a provider file.
            }
        }
    }
    return [...found.values()].sort((a, b) => a.name.localeCompare(b.name));
}
