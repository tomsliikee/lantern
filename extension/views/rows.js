// The parts of the result list. All of them are built once and reused: a
// keystroke sets texts, icons and visibility, and creates no actor.

import Clutter from 'gi://Clutter';
import GObject from 'gi://GObject';
import St from 'gi://St';

import {Badge} from './badge.js';
import {shortNumber} from '../lib/format.js';
import {icon} from './icons.js';
import {pressable} from './motion.js';
import {label, setText} from './text.js';

// A row in a list group.
export const Row = GObject.registerClass({
    GTypeName: 'MaterialSearchRow',
    Signals: {'chosen': {}, 'pointed': {}},
}, class Row extends St.Button {
    _init({small = false, sheet = false}) {
        super._init({
            style_class: `ms-row${small ? ' ms-row-small' : ''}${sheet ? ' ms-row-sheet' : ''}`,
            x_expand: true,
            can_focus: false,
            reactive: true,
            track_hover: true,
        });
        this.item = null;
        pressable(this);
        // St.Button lays out one child; the spacing is that box's.
        const box = new St.BoxLayout({x_expand: true, style_class: 'ms-row-box'});
        this._badge = new Badge({size: sheet ? 32 : 40});
        const text = new St.BoxLayout({orientation: Clutter.Orientation.VERTICAL, x_expand: true, y_align: Clutter.ActorAlign.CENTER, style_class: 'ms-text'});
        this._title = label('row-title', {expand: true});
        this._sub = label('row-sub', {style_class: 'ms-muted', expand: true});
        text.add_child(this._title);
        text.add_child(this._sub);
        this._trail = label('trail', {style_class: 'ms-muted'});
        box.add_child(this._badge);
        box.add_child(text);
        box.add_child(this._trail);
        this.set_child(box);
        this._selected = false;
        this.connect('clicked', () => this.emit('chosen'));
        this.connect('notify::hover', () => {
            if (this.hover)
                this.emit('pointed');
        });
    }

    show(item, {selected}) {
        this.item = item;
        setText(this._title, item.title, {positions: item.positions});
        const subtitle = item.subtitle ?? '';
        setText(this._sub, subtitle);
        this._sub.visible = subtitle.length > 0;
        const trail = item.trail ?? '';
        setText(this._trail, trail);
        this._trail.visible = trail.length > 0;
        this._badge.set({icon: item.icon, full: item.full});
        this.setSelected(selected);
        this.visible = true;
    }

    setSelected(selected) {
        if (this._selected === selected && this.item)
            return;
        this._selected = selected;
        if (selected)
            this.add_style_class_name('ms-selected');
        else
            this.remove_style_class_name('ms-selected');
    }

    clear() {
        this.item = null;
        this.visible = false;
    }
});

// A titled list group with a fixed number of rows.
export class Group {
    constructor({rows, small = false, sheet = false, titled = true}) {
        this.actor = new St.BoxLayout({orientation: Clutter.Orientation.VERTICAL, x_expand: true});
        this.title = label(small ? 'section-small' : 'section', {style_class: 'ms-section', expand: true});
        this.title.visible = titled;
        this.box = new St.BoxLayout({orientation: Clutter.Orientation.VERTICAL, style_class: 'ms-group', x_expand: true});
        this.rows = Array.from({length: rows}, () => {
            const row = new Row({small, sheet});
            row.visible = false;
            this.box.add_child(row);
            return row;
        });
        this.actor.add_child(this.title);
        this.actor.add_child(this.box);
        this.actor.visible = false;
    }

    // items: what to show; selectedItem: the selected one, if it is here.
    show(title, items, selectedItem, {first = false} = {}) {
        if (title !== null) {
            setText(this.title, title);
            this.title.visible = true;
            if (first)
                this.title.add_style_class_name('ms-section-first');
            else
                this.title.remove_style_class_name('ms-section-first');
        } else {
            this.title.visible = false;
        }
        const shown = Math.min(items.length, this.rows.length);
        for (let i = 0; i < this.rows.length; i++) {
            if (i < shown)
                this.rows[i].show(items[i], {selected: items[i] === selectedItem});
            else
                this.rows[i].clear();
        }
        this.actor.visible = shown > 0;
    }

    hide() {
        this.actor.visible = false;
        for (const row of this.rows)
            row.clear();
    }
}

// The top hit: a flat card with the one black button.
export const TopHit = GObject.registerClass({
    GTypeName: 'MaterialSearchTopHit',
    Signals: {'chosen': {}, 'pointed': {}},
}, class TopHit extends St.Button {
    _init({enterText}) {
        super._init({style_class: 'ms-tophit', x_expand: true, can_focus: false, reactive: true, track_hover: true});
        this.item = null;
        pressable(this);
        const box = new St.BoxLayout({x_expand: true, style_class: 'ms-tophit-box'});
        this._badge = new Badge({size: 48});
        const text = new St.BoxLayout({orientation: Clutter.Orientation.VERTICAL, x_expand: true, y_align: Clutter.ActorAlign.CENTER});
        this._title = label('tophit-title', {expand: true});
        this._sub = label('row-sub', {style_class: 'ms-muted', expand: true});
        text.add_child(this._title);
        text.add_child(this._sub);
        // Looks like the main button; the whole card takes the click.
        const enter = new St.BoxLayout({style_class: 'ms-button ms-button-box', y_align: Clutter.ActorAlign.CENTER});
        enter.add_child(new St.Icon({gicon: icon('return'), style_class: 'ms-button-icon', y_align: Clutter.ActorAlign.CENTER}));
        this._enter = label('button');
        setText(this._enter, enterText);
        enter.add_child(this._enter);
        box.add_child(this._badge);
        box.add_child(text);
        box.add_child(enter);
        this.set_child(box);
        this.connect('clicked', () => this.emit('chosen'));
        this.connect('notify::hover', () => {
            if (this.hover)
                this.emit('pointed');
        });
    }

    show(item, selected, enterText) {
        this.item = item;
        setText(this._title, item.title, {positions: item.positions});
        const subtitle = item.subtitle ?? '';
        setText(this._sub, subtitle);
        this._sub.visible = subtitle.length > 0;
        setText(this._enter, enterText);
        this._badge.set({icon: item.icon, full: item.full});
        this.setSelected(selected);
        this.visible = true;
    }

    setSelected(selected) {
        if (selected)
            this.add_style_class_name('ms-selected');
        else
            this.remove_style_class_name('ms-selected');
    }
});

// The answer to a sum: the number, large, and where it was worked out.
export const AnswerCard = GObject.registerClass({
    GTypeName: 'MaterialSearchAnswer',
    Signals: {'chosen': {}, 'pointed': {}},
}, class AnswerCard extends St.Button {
    _init() {
        super._init({style_class: 'ms-answer', x_expand: true, can_focus: false, reactive: true, track_hover: true});
        this.item = null;
        pressable(this);
        const box = new St.BoxLayout({x_expand: true, style_class: 'ms-answer-box'});
        this._value = label('number-hero', {ellipsize: false});
        this._unit = label('unit', {style_class: 'ms-muted'});
        this._unit.y_align = Clutter.ActorAlign.END;
        const meta = new St.BoxLayout({orientation: Clutter.Orientation.VERTICAL, x_expand: true, x_align: Clutter.ActorAlign.END, y_align: Clutter.ActorAlign.CENTER, style_class: 'ms-answer-meta'});
        this._hint = label('meta-title', {align: Clutter.ActorAlign.END, expand: true});
        this._expression = label('meta', {style_class: 'ms-muted', align: Clutter.ActorAlign.END, expand: true});
        this._note = label('meta', {style_class: 'ms-muted', align: Clutter.ActorAlign.END, expand: true});
        meta.add_child(this._hint);
        meta.add_child(this._expression);
        meta.add_child(this._note);
        const number = new St.BoxLayout({style_class: 'ms-answer-number', y_align: Clutter.ActorAlign.CENTER});
        number.add_child(this._value);
        number.add_child(this._unit);
        box.add_child(number);
        box.add_child(meta);
        this.set_child(box);
        this.connect('clicked', () => this.emit('chosen'));
        this.connect('notify::hover', () => {
            if (this.hover)
                this.emit('pointed');
        });
    }

    show(item, selected, hint, note) {
        this.item = item;
        // "6.21 mi": the number large, the unit small beside it.
        const parts = /^(-?[\d.,\s]+?)\s+(\D.*)$/.exec(item.title);
        setText(this._value, shortNumber(parts ? parts[1] : item.title));
        setText(this._unit, parts ? parts[2] : '');
        this._unit.visible = Boolean(parts);
        setText(this._hint, hint);
        setText(this._expression, item.expression ?? '');
        setText(this._note, note);
        this.setSelected(selected);
        this.visible = true;
    }

    setSelected(selected) {
        if (selected)
            this.add_style_class_name('ms-selected');
        else
            this.remove_style_class_name('ms-selected');
    }
});

// A pill button of the design system: filled, or tonal.
export const Pill = GObject.registerClass({GTypeName: 'MaterialSearchPill'},
class Pill extends St.Button {
    _init() {
        super._init({style_class: 'ms-button', can_focus: false, reactive: true, track_hover: true});
        pressable(this);
        const box = new St.BoxLayout({style_class: 'ms-button-box', y_align: Clutter.ActorAlign.CENTER});
        this._icon = new St.Icon({style_class: 'ms-button-icon'});
        this._label = label('button');
        box.add_child(this._icon);
        box.add_child(this._label);
        this.set_child(box);
        this.run = null;
        this.connect('clicked', () => this.run?.());
    }

    show({label: text, icon: name = null, filled = false, run}) {
        setText(this._label, text);
        this._icon.visible = Boolean(name);
        if (name)
            this._icon.gicon = icon(name);
        if (filled)
            this.remove_style_class_name('ms-button-tonal');
        else
            this.add_style_class_name('ms-button-tonal');
        this.run = run;
        this.visible = true;
    }
});
