// The ask mode's widgets: the chip in the field and the card of turns.
//
// A turn is the question in the serif above the answer in Inter, with code
// on a filled box. Text that arrives is shown a few characters per tick
// (see nextShown), so a burst from the program still reads as typing. The
// tick's timer and the dots' pulse exist only while something is arriving.

import Clutter from 'gi://Clutter';
import GLib from 'gi://GLib';
import St from 'gi://St';

import {nextShown, splitBlocks} from '../lib/ai.js';
import {icon} from './icons.js';
import {label, setText} from './text.js';

const TICK_MS = 16;
const PULSE_MS = 600;
const PULSE_STAGGER_MS = 150;

export class AskChip {
    constructor() {
        this.actor = new St.BoxLayout({style_class: 'ms-chip', y_align: Clutter.ActorAlign.CENTER, visible: false});
        this.actor.add_child(new St.Icon({gicon: icon('spark'), style_class: 'ms-chip-icon', y_align: Clutter.ActorAlign.CENTER}));
        this._name = label('chip');
        this.actor.add_child(this._name);
    }

    show(name) {
        setText(this._name, name);
        this.actor.visible = true;
    }

    hide() {
        this.actor.visible = false;
    }
}

export class AskCard {
    // motion(): whether animations are allowed right now.
    constructor({motion}) {
        this._motion = motion;
        this.actor = new St.BoxLayout({orientation: Clutter.Orientation.VERTICAL, style_class: 'ms-ask', x_expand: true, visible: false});
        this._turns = [];
        this._timer = 0;
    }

    get visible() {
        return this.actor.visible;
    }

    get lastReply() {
        return this._turns.at(-1)?.target ?? '';
    }

    get empty() {
        return this._turns.length === 0;
    }

    addTurn(said) {
        const box = new St.BoxLayout({orientation: Clutter.Orientation.VERTICAL, style_class: 'ms-ask-turn', x_expand: true});
        if (this._turns.length > 0)
            box.add_style_class_name('ms-ask-next');
        const question = label('ask-said', {style_class: 'ms-ask-said', wrap: true});
        setText(question, said);
        const reply = new St.BoxLayout({orientation: Clutter.Orientation.VERTICAL, style_class: 'ms-ask-reply', x_expand: true});
        const dots = new St.BoxLayout({style_class: 'ms-ask-dots', visible: false});
        const dotActors = [0, 1, 2].map(() => {
            const dot = new St.Widget({style_class: 'ms-ask-dot'});
            dots.add_child(dot);
            return dot;
        });
        box.add_child(question);
        box.add_child(reply);
        box.add_child(dots);
        this.actor.add_child(box);
        this._turns.push({box, reply, dots, dotActors, segments: [], target: '', shown: 0, notice: null});
        this.actor.visible = true;
        this.thinking(true);
    }

    // The dots pulse while the program thinks.
    thinking(on) {
        const turn = this._turns.at(-1);
        if (!turn)
            return;
        turn.dots.visible = on;
        turn.dotActors.forEach((dot, i) => {
            dot.remove_transition('pulse');
            if (!on || !this._motion())
                return;
            const pulse = new Clutter.PropertyTransition({
                property_name: 'opacity',
                duration: PULSE_MS,
                repeat_count: -1,
                auto_reverse: true,
                progress_mode: Clutter.AnimationMode.EASE_IN_OUT_SINE,
                delay: i * PULSE_STAGGER_MS,
            });
            pulse.set_from(90);
            pulse.set_to(255);
            dot.opacity = 90;
            dot.add_transition('pulse', pulse);
        });
    }

    // Streamed text for the last turn.
    append(text) {
        const turn = this._turns.at(-1);
        if (!turn)
            return;
        if (turn.target === '')
            this.thinking(false);
        turn.target += text;
        if (!this._motion()) {
            turn.shown = turn.target.length;
            this._render(turn);
            return;
        }
        if (!this._timer) {
            this._timer = GLib.timeout_add(GLib.PRIORITY_DEFAULT, TICK_MS, () => this._tick());
        }
    }

    _tick() {
        let waiting = false;
        for (const turn of this._turns) {
            if (turn.shown >= turn.target.length)
                continue;
            turn.shown = nextShown(turn.shown, turn.target.length);
            this._render(turn);
            waiting ||= turn.shown < turn.target.length;
        }
        if (waiting)
            return GLib.SOURCE_CONTINUE;
        this._timer = 0;
        return GLib.SOURCE_REMOVE;
    }

    _render(turn) {
        const blocks = splitBlocks(turn.target.slice(0, turn.shown));
        blocks.forEach((block, i) => {
            let segment = turn.segments[i];
            if (segment && segment.code !== block.code) {
                segment.actor.destroy();
                segment = null;
                turn.segments.length = i;
            }
            if (!segment) {
                const text = label(block.code ? 'ask-code' : 'ask-reply', {wrap: true});
                let actor = text;
                if (block.code) {
                    actor = new St.BoxLayout({style_class: 'ms-ask-code', x_expand: true});
                    actor.add_child(text);
                }
                turn.reply.add_child(actor);
                segment = {code: block.code, actor, label: text};
                turn.segments.push(segment);
            }
            setText(segment.label, block.text);
        });
        // The text shrank to fewer blocks: cannot happen while appending.
        this.onChange?.();
    }

    _halt() {
        if (this._timer) {
            GLib.source_remove(this._timer);
            this._timer = 0;
        }
        this.thinking(false);
    }

    // What the program streamed is all there: no waiting for the reveal.
    stop() {
        this._halt();
        for (const turn of this._turns) {
            turn.shown = turn.target.length;
            this._render(turn);
        }
    }

    // One plain sentence where the answer would be.
    fail(title, sub) {
        const turn = this._turns.at(-1);
        if (!turn)
            return;
        this.thinking(false);
        const notice = new St.BoxLayout({orientation: Clutter.Orientation.VERTICAL, style_class: 'ms-calm', x_expand: true});
        const head = label('calm', {wrap: true});
        setText(head, title);
        notice.add_child(head);
        if (sub) {
            const detail = label('calm-sub', {style_class: 'ms-muted', wrap: true});
            setText(detail, sub);
            notice.add_child(detail);
        }
        turn.box.add_child(notice);
        turn.notice = notice;
        this.onChange?.();
    }

    clear() {
        this._halt();
        for (const turn of this._turns)
            turn.box.destroy();
        this._turns = [];
        this.actor.visible = false;
    }
}
