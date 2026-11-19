// Labels set in a type role, with the matched letters in a heavier cut.
//
// St's CSS cannot reach the axes of a variable font (weight), so labels
// pass Pango markup straight to ClutterText (parsed and owned in C, with no
// Pango.AttrList or Pango.FontDescription crossing GJS).

import Clutter from 'gi://Clutter';
import GLib from 'gi://GLib';
import Pango from 'gi://Pango';
import St from 'gi://St';

import {family, serifFamily, type} from '../lib/tokens.js';

const PX_TO_PT = 0.75;
const CHANNEL = 257;

const sans = (size, line, weight, tracking = 0) => ({size, line, weight, tracking, serif: false});
const serif = (size, line, tracking) => ({size, line, weight: 400, tracking, serif: true});
const mono = (size, line) => ({size, line, weight: 400, tracking: 0, serif: false, mono: true});

// The roles of the design system, and the cuts the launcher's design asks
// for beside them. Geist Serif has one weight and carries the statements:
// the empty field's invitation and the query, the group headings, the name in
// the preview, the title of the actions, the calm sentence. Everything else
// is Inter with tabular figures. The values follow material-search.html.
const ROLES = {
    ...type,
    query: serif(24, 30, -0.24),
    // The pill on its own is larger, and so is its hint.
    'query-lone': serif(28, 34, -0.28),
    'query-hint': serif(28, 34, -0.28),
    section: serif(20, 26, -0.2),
    'section-small': serif(18, 24, -0.18),
    'preview-name': serif(30, 34, -0.3),
    'sheet-title': serif(26, 32, -0.26),
    calm: serif(26, 32, -0.264),
    'row-title': sans(15, 21, 400),
    'tophit-title': sans(17, 22, 600, -0.17),
    'row-sub': sans(13, 18, 400),
    trail: sans(13, 18, 500),
    kbd: sans(12, 16, 600),
    button: sans(14, 18, 600),
    kind: sans(13, 18, 400),
    foot: sans(13, 18, 400),
    'calm-sub': sans(13, 18, 400),
    meta: sans(13, 18, 400),
    'meta-title': sans(14, 18, 600),
    glyph: sans(16, 20, 600),
    // The ask mode: the question in the serif, the answer in Inter.
    'ask-said': serif(20, 26, -0.2),
    'ask-reply': sans(15, 24, 400),
    'ask-code': mono(13, 20),
    chip: sans(13, 18, 600),
};

// The weight of the matched letters.
const MATCH_WEIGHT = 800;

function fontSpec(role, weight = null) {
    const spec = ROLES[role] ?? ROLES.body;
    // Both stacks end in a generic family, so a missing font still draws.
    const fam = spec.mono ? 'monospace' : spec.serif ? serifFamily : family;
    // Points, so the text follows the desktop's text scaling.
    const pt = +(spec.size * PX_TO_PT).toFixed(2);
    const base = `${fam} ${pt}`;
    // Inter's one axis; the serif has a single weight.
    return !spec.serif && !spec.mono ? `${base} @wght=${weight ?? spec.weight}` : base;
}

const escape = text => GLib.markup_escape_text(text, -1);
const hex2 = v => v.toString(16).padStart(2, '0');

// The label's role as Pango markup. ClutterText parses it in C via set_markup,
// so no Pango.AttrList or Pango.FontDescription is ever created or held by JS.
function markupOf(spec, color) {
    const role = ROLES[spec.role] ?? ROLES.body;
    const outer = [`font="${escape(fontSpec(spec.role))}"`, 'font_features="tnum=1"'];
    if (role.tracking)
        outer.push(`letter_spacing="${Math.round(role.tracking * Pango.SCALE)}"`);
    if (role.line)
        outer.push(`line_height="${Math.round(role.line * Pango.SCALE)}"`);
    // Heavy cuts of the variable font are drawn without the label's colour
    // otherwise, so the stylesheet's colour is passed on.
    if (color) {
        outer.push(`foreground="#${hex2(color.red)}${hex2(color.green)}${hex2(color.blue)}"`);
        if (color.alpha < 255)
            outer.push(`fgalpha="${Math.max(1, color.alpha * CHANNEL)}"`);
    }
    const text = spec.text;
    let body = escape(text);
    if (spec.positions?.length > 0 && !role.serif) {
        const heavy = `<span font="${escape(fontSpec(spec.role, MATCH_WEIGHT))}">`;
        const marked = new Set(spec.positions);
        body = '';
        let inRun = false;
        for (let i = 0; i < text.length; i++) {
            // A pair of surrogates is one character and is never split.
            const pair = text.charCodeAt(i) >= 0xd800 && text.charCodeAt(i) <= 0xdbff;
            const ch = pair ? text.slice(i, i + 2) : text[i];
            const on = marked.has(i);
            if (on !== inRun) {
                body += on ? heavy : '</span>';
                inRun = on;
            }
            body += escape(ch);
            if (pair)
                i++;
        }
        if (inRun)
            body += '</span>';
    }
    return `<span ${outer.join(' ')}>${body}</span>`;
}

function apply(label) {
    const spec = label._msText;
    // A label that is being torn down is not styled or drawn again.
    if (!spec || label._msGone || !label.clutter_text)
        return;
    const color = label.get_stage() ? label.get_theme_node().get_foreground_color() : null;
    const markup = markupOf(spec, color);
    if (markup === label._msMarkup)
        return;
    label._msMarkup = markup;
    label.clutter_text.set_markup(markup);
    label.clutter_text.queue_relayout();
}

export function label(role, {style_class = '', expand = false, align = Clutter.ActorAlign.START, wrap = false, ellipsize = true} = {}) {
    const actor = new St.Label({
        style_class,
        x_expand: expand,
        x_align: align,
        y_align: Clutter.ActorAlign.CENTER,
    });
    actor._msText = {role, text: '', positions: null};
    actor.clutter_text.ellipsize = ellipsize ? Pango.EllipsizeMode.END : Pango.EllipsizeMode.NONE;
    if (wrap) {
        actor.clutter_text.line_wrap = true;
        actor.clutter_text.line_wrap_mode = Pango.WrapMode.WORD_CHAR;
        actor.clutter_text.ellipsize = Pango.EllipsizeMode.NONE;
    }
    actor.connect_after('style-changed', () => apply(actor));
    actor.connect('destroy', () => {
        actor._msGone = true;
        actor._msMarkup = null;
    });
    apply(actor);
    return actor;
}

// Sets the text, and which letters of it matched. Nothing is done when
// nothing changed, so a keystroke touches only the rows that differ.
export function setText(actor, text, {positions = null, role = null} = {}) {
    if (actor._msGone)
        return;
    const spec = actor._msText;
    const same = spec.text === text && (role ?? spec.role) === spec.role &&
        JSON.stringify(spec.positions ?? []) === JSON.stringify(positions ?? []);
    if (same)
        return;
    spec.text = text;
    spec.positions = positions;
    if (role)
        spec.role = role;
    apply(actor);
}

// An St.Entry's own text in a role, applied purely through inline CSS so no
// Pango.FontDescription or Pango.AttrList is created or held by JS.
export function styleEntry(entry, role) {
    let gone = false;
    const set = () => {
        if (gone || !entry.clutter_text)
            return;
        const spec = ROLES[role] ?? ROLES.body;
        const fam = spec.mono ? 'monospace' : spec.serif ? serifFamily : family;
        const pt = +(spec.size * PX_TO_PT).toFixed(2);
        const parts = [`font-family: ${fam};`, `font-size: ${pt}pt;`];
        if (spec.tracking)
            parts.push(`letter-spacing: ${spec.tracking}px;`);
        const style = parts.join(' ');
        if (entry.get_style() !== style)
            entry.set_style(style);
    };
    entry.connect('destroy', () => {
        gone = true;
    });
    set();
    return next => {
        role = next;
        set();
    };
}
