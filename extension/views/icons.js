// The launcher's own icons: Material Symbols, filled, one weight, shipped
// with the extension so they look the same on every icon theme. Symbolic
// files, so St colours them like text.

import Gio from 'gi://Gio';

let folder = null;
const cache = new Map();

export function setFolder(path) {
    folder = path;
    cache.clear();
}

export function icon(name) {
    if (!cache.has(name))
        cache.set(name, Gio.FileIcon.new(Gio.File.new_for_path(`${folder}/icons/ms-${name}-symbolic.svg`)));
    return cache.get(name);
}

// A file's icon from its kind, in the same family.
export function fileIcon(contentType) {
    if (contentType === 'inode/directory')
        return icon('folder');
    if (contentType?.startsWith('image/'))
        return icon('image');
    return icon('file');
}
