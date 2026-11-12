// The column beside the results: the preview of the selected result, or,
// behind Tab, the sheet of what can be done with it.

import Clutter from 'gi://Clutter';
import Gio from 'gi://Gio';
import St from 'gi://St';

import {Badge} from './badge.js';
import {icon} from './icons.js';
import {Group, Pill} from './rows.js';
import {label, setText} from './text.js';

const HERO = 72;
const BUTTONS = 3;
const LIST_ROWS = 3;
const SHEET_ROWS = 10;

export class Preview {
    constructor() {
        this.actor = new St.BoxLayout({orientation: Clutter.Orientation.VERTICAL, style_class: 'ms-preview', y_expand: false, y_align: Clutter.ActorAlign.START});
        this._hero = new Badge({size: HERO, styleClass: 'ms-hero'});
        this._picture = new St.Bin({style_class: 'ms-thumb', width: 280 - 36, height: 144, x_align: Clutter.ActorAlign.CENTER, visible: false});
        this._name = label('preview-name', {style_class: 'ms-preview-name', align: Clutter.ActorAlign.CENTER, wrap: true});
        this._name.clutter_text.line_alignment = 1; // Pango.Alignment.CENTER
        this._kind = label('kind', {style_class: 'ms-muted ms-preview-kind', align: Clutter.ActorAlign.CENTER, wrap: true});
        this._kind.clutter_text.line_alignment = 1;
        this._text = label('row-sub', {style_class: 'ms-muted ms-aside', align: Clutter.ActorAlign.CENTER, wrap: true});
        this._text.clutter_text.line_alignment = 1;
        this._buttons = new St.BoxLayout({style_class: 'ms-buttons', x_align: Clutter.ActorAlign.CENTER});
        this._pills = Array.from({length: BUTTONS}, () => {
            const pill = new Pill();
            pill.visible = false;
            this._buttons.add_child(pill);
            return pill;
        });
        this._list = new St.BoxLayout({orientation: Clutter.Orientation.VERTICAL, style_class: 'ms-preview-list', x_expand: true});
        this._group = new Group({rows: LIST_ROWS, small: true});
        this._list.add_child(this._group.actor);
        for (const child of [this._hero, this._picture, this._name, this._kind, this._text, this._buttons, this._list])
            this.actor.add_child(child);
        this._group.rows.forEach(row => row.connect('chosen', () => {
            row.item?.activate?.();
            this.onDone?.();
        }));
        this._pills.forEach(pill => pill.connect('clicked', () => this.onDone?.()));
        this.onDone = null;
        this._showing = null;
    }

    // data: what a result's preview() gave. Returns false when there is
    // nothing to show, so the column can stay empty.
    show(data) {
        if (!data) {
            this._showing = null;
            this.actor.visible = false;
            return false;
        }
        this._showing = data;
        const {hero} = data;
        if (hero.picture) {
            this._hero.visible = false;
            this._picture.visible = true;
            this._picture.style = `background-image: url("${Gio.File.new_for_path(hero.picture).get_uri()}");`;
        } else {
            this._picture.visible = false;
            this._picture.style = null;
            this._hero.visible = true;
            this._hero.set({icon: hero.icon, full: hero.full});
        }
        setText(this._name, data.name);
        setText(this._kind, data.kind ?? '');
        this._kind.visible = Boolean(data.kind);
        setText(this._text, data.text ?? '');
        this._text.visible = Boolean(data.text);
        const buttons = data.buttons ?? [];
        this._pills.forEach((pill, i) => {
            if (i < buttons.length)
                pill.show(buttons[i]);
            else
                pill.visible = false;
        });
        this._buttons.visible = buttons.length > 0;
        const list = data.list ?? [];
        if (list.length > 0 && data.listTitle) {
            this._group.show(data.listTitle, list, null);
            this._list.visible = true;
        } else {
            this._group.hide();
            this._list.visible = false;
        }
        this.actor.visible = true;
        return true;
    }
}

// The actions of one result, as a list group the keyboard walks.
export class ActionSheet {
    constructor({title}) {
        this.actor = new St.BoxLayout({orientation: Clutter.Orientation.VERTICAL, style_class: 'ms-sheet', y_align: Clutter.ActorAlign.START, visible: false});
        this._heading = label('sheet-title', {style_class: 'ms-sheet-head'});
        setText(this._heading, title);
        this.actor.add_child(this._heading);
        this._group = new Group({rows: SHEET_ROWS, sheet: true, titled: false});
        this.actor.add_child(this._group.actor);
        this._items = [];
        this.selected = 0;
        this.onRun = null;
        this.onPoint = null;
        this._group.rows.forEach((row, i) => {
            row.connect('chosen', () => this.onRun?.(this._items[i]));
            row.connect('pointed', () => this.onPoint?.(i));
        });
    }

    get open() {
        return this.actor.visible;
    }

    show(result, actions) {
        this._items = actions.map(action => ({
            title: action.label,
            positions: [],
            icon: {gicon: icon(action.icon ?? 'next')},
            trail: action.shortcut ?? '',
            action,
        }));
        this.selected = 0;
        this._render();
        this.actor.visible = true;
    }

    move(by) {
        if (this._items.length === 0)
            return;
        this.selected = Math.max(0, Math.min(this._items.length - 1, this.selected + by));
        this._render();
    }

    select(index) {
        this.selected = index;
        this._render();
    }

    get current() {
        return this._items[this.selected] ?? null;
    }

    _render() {
        this._group.show(null, this._items, this._items[this.selected]);
    }

    hide() {
        this.actor.visible = false;
        this._items = [];
        this._group.hide();
    }
}
