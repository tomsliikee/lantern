// The icon badge of the design system: an icon at half size on a filled
// circle. The circle is the widget's own background from the stylesheet, so
// nothing is drawn in code, a colour scheme change needs no work, and a
// keystroke only sets the icon.

import Clutter from 'gi://Clutter';
import GObject from 'gi://GObject';
import St from 'gi://St';

// size: of the circle. A symbolic icon takes half of it; a full-colour icon
// (an app's) more, since it carries its own margin.
export const Badge = GObject.registerClass({GTypeName: 'MaterialSearchBadge'},
class Badge extends St.Widget {
    _init({size, styleClass = ''}) {
        super._init({
            style_class: `ms-badge ${styleClass}`.trim(),
            layout_manager: new Clutter.BinLayout(),
            width: size,
            height: size,
            y_align: Clutter.ActorAlign.CENTER,
            x_align: Clutter.ActorAlign.CENTER,
        });
        this._size = size;
        this._icon = new St.Icon({x_align: Clutter.ActorAlign.CENTER, y_align: Clutter.ActorAlign.CENTER});
        this.add_child(this._icon);
    }

    // icon: {gicon} or {name}; full: a full-colour icon (an app's). The
    // tone and shape that sources still give are not used: Mono has one
    // circle for all.
    set({icon, full = false}) {
        const size = Math.round(this._size * (full ? 0.66 : 0.5));
        if (this._icon.icon_size !== size)
            this._icon.icon_size = size;
        const style = full ? '' : 'ms-badge-icon';
        if (this._icon.style_class !== style)
            this._icon.style_class = style;
        if (icon?.gicon) {
            if (this._icon.gicon !== icon.gicon)
                this._icon.gicon = icon.gicon;
        } else {
            const name = icon?.name ?? 'application-x-executable-symbolic';
            if (this._icon.icon_name !== name)
                this._icon.icon_name = name;
        }
    }
});
