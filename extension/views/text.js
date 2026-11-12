// Labels set in a type role, with the matched letters in a heavier cut.
//
// St's CSS cannot reach the axes of a variable font (weight), so
// the role is applied as Pango attributes. St replaces a label's attributes
// whenever its style is recomputed, so they are applied again after that.

import Clutter from 'gi://Clutter';
import Pango from 'gi://Pango';
import St from 'gi://St';

import {family, serifFamily, type} from '../lib/tokens.js';

const PX_TO_PT = 0.75;
const CHANNEL = 257;

const sans = (size, line, weight, tracking = 0) => ({size, line, weight, tracking, serif: false});
const serif = (size, line, tracking) => ({size, line, weight: 400, tracking, serif: true});

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
};

// The weight of the matched letters.
const MATCH_WEIGHT = 800;

const descriptions = new Map();

export function description(role, weight = null) {
    const key = `${role}/${weight}`;
    if (descriptions.has(key))
        return descriptions.get(key);
    const spec = ROLES[role] ?? ROLES.body;
    // Both stacks end in a generic family, so a missing font still draws.
    const result = Pango.FontDescription.from_string(spec.serif ? serifFamily : family);
    // Points, so the text follows the desktop's text scaling.
    result.set_size(Math.round(spec.size * PX_TO_PT * Pango.SCALE));
    // Inter's one axis; the serif has a single weight.
    if (!spec.serif)
        result.set_variations(`wght=${weight ?? spec.weight}`);
    descriptions.set(key, result);
    return result;
}

// Byte offsets of each character, for Pango's indices.
function byteOffsets(text) {
    const offsets = [];
    let bytes = 0;
    for (let i = 0; i < text.length; i++) {
        offsets.push(bytes);
        const code = text.charCodeAt(i);
        if (code < 0x80)
            bytes += 1;
        else if (code < 0x800)
            bytes += 2;
        else if (code >= 0xd800 && code <= 0xdbff) {
            // A pair of surrogates is one character of four bytes; its
            // second half points past it.
            bytes += 4;
            i++;
            offsets.push(bytes);
        } else
            bytes += 3;
    }
    offsets.push(bytes);
    return offsets;
}

function apply(label) {
    const spec = label._msText;
    if (!spec)
        return;
    const attributes = new Pango.AttrList();
    attributes.insert(Pango.attr_font_desc_new(description(spec.role)));
    attributes.insert(Pango.attr_font_features_new('tnum=1'));
    const role = ROLES[spec.role] ?? ROLES.body;
    if (role.tracking)
        attributes.insert(Pango.attr_letter_spacing_new(Math.round(role.tracking * Pango.SCALE)));
    if (role.line)
        attributes.insert(Pango.attr_line_height_new_absolute(Math.round(role.line * Pango.SCALE)));
    if (spec.positions?.length > 0 && !ROLES[spec.role]?.serif) {
        const offsets = byteOffsets(spec.text);
        const heavy = description(spec.role, MATCH_WEIGHT);
        // Neighbouring letters become one run.
        let start = null;
        let previous = null;
        const flush = () => {
            if (start === null)
                return;
            const attribute = Pango.attr_font_desc_new(heavy);
            attribute.start_index = offsets[start];
            attribute.end_index = offsets[previous + 1];
            attributes.insert(attribute);
        };
        for (const at of spec.positions) {
            if (at >= spec.text.length)
                continue;
            if (start !== null && at === previous + 1) {
                previous = at;
                continue;
            }
            flush();
            start = previous = at;
        }
        flush();
    }
    // Heavy cuts of the variable font are drawn without the label's colour
    // otherwise, so the stylesheet's colour is passed on.
    if (label.get_stage()) {
        const color = label.get_theme_node().get_foreground_color();
        attributes.insert(Pango.attr_foreground_new(color.red * CHANNEL, color.green * CHANNEL, color.blue * CHANNEL));
        if (color.alpha < 255)
            attributes.insert(Pango.attr_foreground_alpha_new(color.alpha * CHANNEL));
    }
    label.clutter_text.set_attributes(attributes);
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
    apply(actor);
    return actor;
}

// Sets the text, and which letters of it matched. Nothing is done when
// nothing changed, so a keystroke touches only the rows that differ.
export function setText(actor, text, {positions = null, role = null} = {}) {
    const spec = actor._msText;
    const same = spec.text === text && (role ?? spec.role) === spec.role &&
        JSON.stringify(spec.positions ?? []) === JSON.stringify(positions ?? []);
    if (same)
        return;
    spec.text = text;
    spec.positions = positions;
    if (role)
        spec.role = role;
    actor.text = text;
    apply(actor);
}

// An St.Entry's own text in a role. St sets the font from the stylesheet
// on every style change, so it is set again after that. Returns a function
// that changes the role later.
export function styleEntry(entry, role) {
    const set = () => {
        entry.clutter_text.set_font_description(description(role));
        const attributes = new Pango.AttrList();
        const tracking = (ROLES[role] ?? ROLES.body).tracking;
        if (tracking)
            attributes.insert(Pango.attr_letter_spacing_new(Math.round(tracking * Pango.SCALE)));
        // An attribute list drops the colour of the stylesheet otherwise.
        if (entry.get_stage()) {
            const color = entry.get_theme_node().get_foreground_color();
            attributes.insert(Pango.attr_foreground_new(color.red * CHANNEL, color.green * CHANNEL, color.blue * CHANNEL));
        }
        entry.clutter_text.set_attributes(attributes);
    };
    entry.connect_after('style-changed', set);
    set();
    return next => {
        role = next;
        set();
    };
}
