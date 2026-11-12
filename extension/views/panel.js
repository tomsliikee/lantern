// The launcher's panel: the search pill, the results, the column beside
// them and the footer.
//
// Built once when the extension is enabled and reused for every opening.
// While closed it is hidden (out of the paint), holds no timer and no
// timeline, and asks no source anything. Opening shows the pill and takes
// the keyboard; the results stay hidden until the first character.

import Clutter from 'gi://Clutter';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Shell from 'gi://Shell';
import St from 'gi://St';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import {ensureActorVisibleInScrollView} from 'resource:///org/gnome/shell/misc/animationUtils.js';
import {gettext as _, ngettext} from 'resource:///org/gnome/shell/extensions/extension.js';

import {flatten} from '../lib/rank.js';
import {SPRINGS} from '../lib/spring.js';
import {searchUrl} from '../lib/format.js';
import {Search} from '../search.js';
import {copy} from '../sources/calculator.js';
import {launchContext} from '../sources/apps.js';
import {icon} from './icons.js';
import {GROW, OPEN, Spring, setMotionCheck} from './motion.js';
import {AnswerCard, Group, TopHit} from './rows.js';
import {ActionSheet, Preview} from './side.js';
import {label, setText, styleEntry} from './text.js';

const WIDTH = 760;
const COMPACT_WIDTH = 600;
// Below this logical width the panel leaves out the preview by itself.
const ROOMY_MONITOR = 1400;
const GUTTER = 16;
// Where the panel's top sits, as a share of the monitor's height.
const TOP_SHARE = 0.18;
const GROUPS = 8;
const ROWS_PER_GROUP = 6;
const PAGE = 5;
const CLOSE_MS = 120;
// The panel arrives at 96 % of its size.
const OPEN_SCALE = 0.96;

const ENGINES = {
    google: 'https://www.google.com/search?q=%s',
    duckduckgo: 'https://duckduckgo.com/?q=%s',
    startpage: 'https://www.startpage.com/do/search?query=%s',
    ecosia: 'https://www.ecosia.org/search?q=%s',
    bing: 'https://www.bing.com/search?q=%s',
};

export class Panel {
    constructor({settings, theme, usage, sources, files, power, onOpened = null}) {
        this._settings = settings;
        this._theme = theme;
        this._usage = usage;
        this._files = files;
        this._power = power;
        this._onOpened = onOpened;
        this._search = new Search({sources, onResults: (arrangement, info) => this._render(arrangement, info)});
        this._scheme = null;
        this._isOpen = false;
        this._grab = null;
        this._lone = true;
        this._compact = false;
        this._rows = [];
        this._actors = new Map();
        this._selected = 0;
        this._pointerMoved = false;
        this._quiet = false;
        this._saveIdle = 0;
        this._closing = false;
        this._debug = Boolean(GLib.getenv('MATERIAL_SEARCH_DEBUG'));
        this._build();
    }

    get isOpen() {
        return this._isOpen;
    }

    // For the headless rig and the footer: the work of the last keystroke.
    get lastMs() {
        return this._lastMs ?? 0;
    }

    _build() {
        this._backdrop = new St.Widget({style_class: 'ms-backdrop', reactive: true, visible: false});
        this._capsule = new St.BoxLayout({orientation: Clutter.Orientation.VERTICAL, style_class: 'ms-capsule ms-lone', reactive: true});
        this._capsule.set_pivot_point(0.5, 0);
        this._column = new St.BoxLayout({orientation: Clutter.Orientation.VERTICAL, style_class: 'ms-column', x_expand: true});
        this._capsule.add_child(this._column);
        this._backdrop.add_child(this._capsule);

        // The search pill.
        const field = new St.BoxLayout({style_class: 'ms-field', x_expand: true});
        field.add_child(new St.Icon({gicon: icon('search'), style_class: 'ms-field-icon', y_align: Clutter.ActorAlign.CENTER}));
        this._entry = new St.Entry({style_class: 'ms-entry', x_expand: true, y_align: Clutter.ActorAlign.CENTER, can_focus: true});
        const hint = label('query-hint', {style_class: 'ms-hint'});
        setText(hint, _('Search anything'));
        this._entry.hint_actor = hint;
        // The pill on its own sets its text larger than the panel does.
        this._entryRole = styleEntry(this._entry, 'query-lone');
        field.add_child(this._entry);
        const esc = label('kbd', {style_class: 'ms-kbd'});
        setText(esc, _('Esc'));
        esc.y_align = Clutter.ActorAlign.CENTER;
        field.add_child(esc);
        this._column.add_child(field);

        // Results and the column beside them.
        this._body = new St.BoxLayout({style_class: 'ms-body', x_expand: true, visible: false});
        this._resultsColumn = new St.BoxLayout({orientation: Clutter.Orientation.VERTICAL, x_expand: true});
        this._scroll = new St.ScrollView({
            style_class: 'ms-scroll',
            hscrollbar_policy: St.PolicyType.NEVER,
            vscrollbar_policy: St.PolicyType.AUTOMATIC,
            overlay_scrollbars: true,
            x_expand: true,
        });
        this._results = new St.BoxLayout({orientation: Clutter.Orientation.VERTICAL, style_class: 'ms-results', x_expand: true});
        this._scroll.set_child(this._results);
        this._resultsColumn.add_child(this._scroll);
        this._body.add_child(this._resultsColumn);

        this._topHit = new TopHit({enterText: _('Open')});
        this._answer = new AnswerCard();
        this._calm = new St.BoxLayout({orientation: Clutter.Orientation.VERTICAL, style_class: 'ms-calm', x_expand: true});
        this._calmTitle = label('calm', {wrap: true});
        this._calmSub = label('calm-sub', {style_class: 'ms-muted', wrap: true});
        this._calm.add_child(this._calmTitle);
        this._calm.add_child(this._calmSub);
        this._groups = Array.from({length: GROUPS}, () => new Group({rows: ROWS_PER_GROUP}));
        for (const actor of [this._topHit, this._answer, this._calm])
            this._results.add_child(actor);
        for (const group of this._groups)
            this._results.add_child(group.actor);
        for (const actor of [this._topHit, this._answer, this._calm])
            actor.visible = false;

        this._side = new St.BoxLayout({orientation: Clutter.Orientation.VERTICAL, y_align: Clutter.ActorAlign.START});
        this._preview = new Preview();
        this._preview.onDone = () => this.close();
        this._sheet = new ActionSheet({title: _('Actions')});
        this._sheet.onRun = item => this._runAction(item?.action);
        this._sheet.onPoint = index => {
            if (this._pointerMoved)
                this._sheet.select(index);
        };
        this._side.add_child(this._preview.actor);
        this._side.add_child(this._sheet.actor);
        this._body.add_child(this._side);
        this._column.add_child(this._body);

        // Key hints and how long the answer took.
        this._foot = new St.BoxLayout({style_class: 'ms-foot', x_expand: true, visible: false});
        this._keys = new St.BoxLayout({style_class: 'ms-keys', x_expand: true});
        this._keyLabels = Array.from({length: 3}, () => {
            const hintLabel = label('foot', {style_class: 'ms-muted'});
            this._keys.add_child(hintLabel);
            return hintLabel;
        });
        this._stats = label('foot', {style_class: 'ms-muted'});
        this._foot.add_child(this._keys);
        this._foot.add_child(this._stats);
        this._column.add_child(this._foot);

        for (const row of [this._topHit, this._answer]) {
            row.connect('chosen', () => this._activate(row.item));
            row.connect('pointed', () => this._point(row.item));
        }
        for (const group of this._groups) {
            for (const row of group.rows) {
                row.connect('chosen', () => this._activate(row.item));
                row.connect('pointed', () => this._point(row.item));
            }
        }

        // Scale and fade arrive on springs; the scale's swing past 1 is the
        // Mono spring's overshoot. The timeline ends when what is left of
        // the swing is below half a pixel.
        this._openSpring = new Spring(this._capsule, value => {
            const scale = OPEN_SCALE + (1 - OPEN_SCALE) * value;
            this._capsule.set_scale(scale, scale);
        }, OPEN, 0.02);
        this._fadeSpring = new Spring(this._capsule, value => {
            this._capsule.opacity = Math.round(255 * Math.min(1, Math.max(0, value)));
        }, SPRINGS.effect, 0.01);
        setMotionCheck(() => this._motion());
        this._growSpring = new Spring(this._capsule, value => {
            this._capsule.height = Math.round(value);
        }, GROW);

        this._entry.clutter_text.connect('text-changed', () => this._changed());
        this._entry.clutter_text.connect('key-press-event', (_actor, event) => this._key(event));
        this._backdrop.connect('button-press-event', (_actor, event) => this._pressed(event));
        this._backdrop.connect('motion-event', () => {
            this._pointerMoved = true;
            return Clutter.EVENT_PROPAGATE;
        });

        Main.uiGroup.add_child(this._backdrop);
    }

    // Resolves the styles of the whole tree once, in an idle moment after
    // the extension starts, so the first opening does not pay for it.
    warm() {
        this._applyScheme();
        const walk = actor => {
            actor.ensure_style?.();
            for (const child of actor.get_children())
                walk(child);
        };
        walk(this._backdrop);
    }

    toggle() {
        if (this._isOpen)
            this.close();
        else
            this.open();
    }

    _motion() {
        if (!St.Settings.get().enable_animations || !this._settings.get_boolean('animations'))
            return false;
        return !(this._settings.get_boolean('calm-on-battery') && this._power.onBattery);
    }

    _applyScheme() {
        const scheme = this._theme.scheme;
        if (scheme === this._scheme)
            return;
        if (this._scheme)
            this._backdrop.remove_style_class_name(`ms-root-${this._scheme}`);
        this._scheme = scheme;
        this._backdrop.add_style_class_name(`ms-root-${scheme}`);
    }

    _layout() {
        const monitor = Main.layoutManager.primaryMonitor;
        const mode = this._settings.get_string('compact');
        this._compact = mode === 'always' || (mode === 'auto' && monitor.width < ROOMY_MONITOR);
        const width = Math.min(this._compact ? COMPACT_WIDTH : WIDTH, monitor.width - 2 * GUTTER);
        this._width = width;
        this._backdrop.set_position(0, 0);
        this._backdrop.set_size(global.stage.width, global.stage.height);
        this._capsule.width = width;
        this._capsule.set_position(
            Math.round(monitor.x + (monitor.width - width) / 2),
            Math.round(monitor.y + monitor.height * TOP_SHARE));
        this._side.visible = !this._compact;
        // A compact sheet hides the results; leaving it any other way than
        // Esc must not leave them hidden.
        this._resultsColumn.visible = true;
        if (this._settings.get_boolean('see-through'))
            this._capsule.add_style_class_name('ms-see-through');
        else
            this._capsule.remove_style_class_name('ms-see-through');
    }

    // animate: false puts every value at its end at once (reduced motion,
    // battery); the default follows the settings.
    open({animate = this._motion()} = {}) {
        if (this._isOpen)
            return;
        const started = GLib.get_monotonic_time();
        const mark = label => {
            if (this._debug)
                console.log(`Material Search: open ${label} ${(GLib.get_monotonic_time() - started) / 1000} ms`);
        };
        // A closing fade still running is cut short.
        if (this._closing)
            this._finishClose();
        this._applyScheme();
        mark('scheme');
        this._layout();
        mark('layout');
        this._power.refresh();
        this._quiet = true;
        this._entry.text = '';
        this._quiet = false;
        this._setLone(true, false);
        this._pointerMoved = false;
        this._backdrop.show();
        mark('shown');
        this._grab = Main.pushModal(this._backdrop, {actionMode: Shell.ActionMode.POPUP});
        mark('grab');
        this._isOpen = true;
        this._entry.grab_key_focus();
        if (animate) {
            this._fadeSpring.set(0);
            this._openSpring.set(0);
            this._fadeSpring.to(1);
            this._openSpring.to(1);
        } else {
            this._fadeSpring.set(1);
            this._openSpring.set(1);
        }
        this._onOpened?.(started);
    }

    close() {
        if (!this._isOpen)
            return;
        this._isOpen = false;
        this._search.stop();
        this._sheet.hide();
        if (this._grab) {
            Main.popModal(this._grab);
            this._grab = null;
        }
        this._openSpring.stop();
        this._fadeSpring.stop();
        this._growSpring.stop();
        if (this._motion()) {
            this._closing = true;
            this._capsule.ease({
                opacity: 0,
                duration: CLOSE_MS,
                mode: Clutter.AnimationMode.EASE_OUT_QUAD,
                onStopped: () => {
                    if (this._closing)
                        this._finishClose();
                },
            });
        } else {
            this._finishClose();
        }
    }

    _finishClose() {
        this._closing = false;
        this._capsule.remove_all_transitions();
        this._backdrop.hide();
        this._capsule.opacity = 255;
        this._capsule.set_scale(1, 1);
        this._quiet = true;
        this._entry.text = '';
        this._quiet = false;
        this._clearResults();
        this._setLone(true, false);
        this._closedHook?.();
        // Written once per closing, after the panel is gone.
        if (!this._saveIdle) {
            this._saveIdle = GLib.idle_add(GLib.PRIORITY_LOW, () => {
                this._saveIdle = 0;
                this._usage.save();
                return GLib.SOURCE_REMOVE;
            });
        }
    }

    set onClosed(callback) {
        this._closedHook = callback;
    }

    _pressed(event) {
        const [x, y] = event.get_coords();
        const [cx, cy] = this._capsule.get_transformed_position();
        const [cw, ch] = this._capsule.get_transformed_size();
        if (x < cx || y < cy || x > cx + cw || y > cy + ch) {
            this.close();
            return Clutter.EVENT_STOP;
        }
        return Clutter.EVENT_PROPAGATE;
    }

    _changed() {
        if (this._quiet)
            return;
        this._sheet.hide();
        this._resultsColumn.visible = true;
        this._search.run(this._entry.get_text());
    }

    // Opened, nothing typed: the pill on its own. With text: the panel.
    _setLone(lone, animate) {
        if (lone === this._lone)
            return;
        this._lone = lone;
        const from = this._capsule.height;
        if (lone)
            this._capsule.add_style_class_name('ms-lone');
        else
            this._capsule.remove_style_class_name('ms-lone');
        this._entryRole(lone ? 'query-lone' : 'query');
        this._body.visible = !lone;
        this._foot.visible = !lone;
        this._growSpring.stop();
        this._capsule.height = -1;
        // The shadow reaches past the capsule, so shrinking leaves the old
        // area undamaged and its pixels stay on screen as a ghost rectangle.
        this._backdrop.queue_redraw();
        if (!animate || !this._motion())
            return;
        // Only the height moves; the field stays where it is.
        const [, to] = this._capsule.get_preferred_height(this._width);
        this._growSpring.set(from);
        this._growSpring.to(to, () => {
            this._capsule.height = -1;
            this._backdrop.queue_redraw();
        });
    }

    _clearResults() {
        this._rows = [];
        this._actors.clear();
        this._selected = 0;
        for (const actor of [this._topHit, this._answer, this._calm])
            actor.visible = false;
        for (const group of this._groups)
            group.hide();
        this._preview.show(null);
    }

    _render(arrangement, info) {
        if (!this._isOpen)
            return;
        const query = info.query.trim();
        if (!query) {
            this._clearResults();
            this._setLone(true, true);
            return;
        }
        this._lastMs = info.ms;
        const previous = this._rows[this._selected] ?? null;
        let rows = flatten(arrangement);
        this._actors.clear();
        const empty = rows.length === 0;
        let groupIndex = 0;

        if (empty) {
            rows = this._fallback(query, info);
            this._topHit.visible = this._answer.visible = false;
            this._calm.visible = true;
            setText(this._calmTitle, _('Nothing here for “%s”').format(query));
            let sub = _('No app, file or setting has that name.');
            if (info.pending)
                sub = _('Still looking through files…');
            else if (info.content?.done)
                sub = _('Nothing inside documents either.');
            setText(this._calmSub, sub);
        } else {
            this._calm.visible = false;
        }

        // Keeps the selection on the same result when late results come in.
        let selected = 0;
        if (info.late && previous) {
            const again = rows.findIndex(row => row.id === previous.id);
            selected = again >= 0 ? again : 0;
        }
        this._rows = rows;
        this._selected = selected;
        const current = rows[selected];

        if (!empty) {
            const top = arrangement.top;
            if (top) {
                if (top.kind === 'answer') {
                    this._topHit.visible = false;
                    this._answer.show(top, top === current, _('Enter copies'), _('Worked out on this computer.'));
                    this._actors.set(top, this._answer);
                } else {
                    this._answer.visible = false;
                    this._topHit.show(top, top === current, _('Open'));
                    this._actors.set(top, this._topHit);
                }
            } else {
                this._topHit.visible = this._answer.visible = false;
            }
            for (const group of arrangement.groups) {
                if (groupIndex >= this._groups.length)
                    break;
                const slot = this._groups[groupIndex++];
                slot.show(group.title, group.results, current, {first: !top && groupIndex === 1});
                group.results.slice(0, ROWS_PER_GROUP).forEach((item, i) => this._actors.set(item, slot.rows[i]));
            }
        } else {
            const slot = this._groups[groupIndex++];
            slot.show(null, rows, current);
            slot.actor.add_style_class_name('ms-fallback');
            rows.forEach((item, i) => this._actors.set(item, slot.rows[i]));
        }
        if (!empty)
            this._groups[0].actor.remove_style_class_name('ms-fallback');
        for (let i = groupIndex; i < this._groups.length; i++)
            this._groups[i].hide();

        // Only what the keyboard can reach counts as a row.
        this._rows = rows.filter(row => this._actors.has(row));
        this._selected = Math.min(this._selected, Math.max(0, this._rows.length - 1));
        this._showSelection(false);
        this._footer(info, empty);
        this._setLone(false, true);
    }

    // When nothing matches: the web, and the slower look inside documents.
    _fallback(query, info) {
        const browser = Gio.AppInfo.get_default_for_uri_scheme('https');
        const rows = [{
            id: 'fallback:web',
            kind: 'web',
            title: _('Search the web for “%s”').format(query),
            positions: [],
            subtitle: browser ? _('Opens in %s').format(browser.get_name()) : '',
            trail: _('Enter'),
            icon: {gicon: icon('globe')},
            activate: () => this._searchWeb(query),
            actions: () => [],
            preview: null,
        }];
        if (this._files() && !info.content) {
            rows.push({
                id: 'fallback:content',
                kind: 'content-search',
                title: _('Search in Files'),
                positions: [],
                subtitle: _('Looks inside documents, slower'),
                icon: {gicon: icon('file')},
                actions: () => [],
                preview: null,
            });
        }
        return rows;
    }

    _searchWeb(query) {
        const engine = this._settings.get_string('web-engine');
        const template = engine === 'custom' ? this._settings.get_string('web-template') : ENGINES[engine] ?? ENGINES.google;
        try {
            Gio.AppInfo.launch_default_for_uri(searchUrl(template || ENGINES.google, query), launchContext());
        } catch (e) {
            console.error(`Material Search: the browser did not open: ${e.message}`);
        }
    }

    _footer(info, empty) {
        const current = this._rows[this._selected];
        let hints;
        if (empty)
            hints = current?.kind === 'content-search' ? [_('Enter to look inside documents')] : [_('Enter to search the web')];
        else if (current?.kind === 'answer')
            hints = [_('Enter to copy'), _('Tab for actions')];
        else if (current?.kind === 'file')
            hints = [_('Enter to open'), _('Tab for actions'), _('Ctrl+Enter to show in folder')];
        else
            hints = [_('Enter to open'), _('Tab for actions')];
        if (this._compact)
            hints = hints.slice(0, 2);
        this._keyLabels.forEach((hintLabel, i) => {
            hintLabel.visible = i < hints.length;
            if (i < hints.length)
                setText(hintLabel, hints[i]);
        });
        if (empty) {
            this._stats.visible = false;
        } else {
            const n = this._rows.length;
            const ms = Math.max(1, Math.round(info.ms));
            setText(this._stats, ngettext('%d result in %d ms', '%d results in %d ms', n).format(n, ms));
            this._stats.visible = true;
        }
    }

    _showSelection(scroll) {
        const current = this._rows[this._selected];
        for (const [item, actor] of this._actors)
            actor.setSelected(item === current);
        if (scroll && current) {
            const actor = this._actors.get(current);
            if (actor)
                ensureActorVisibleInScrollView(this._scroll, actor);
        }
        if (!this._compact && !this._sheet.open) {
            const data = current?.preview?.() ?? null;
            this._preview.show(data);
            this._side.visible = Boolean(data);
        }
    }

    _move(by) {
        if (this._sheet.open) {
            this._sheet.move(by);
            return;
        }
        if (this._rows.length === 0)
            return;
        this._selected = Math.max(0, Math.min(this._rows.length - 1, this._selected + by));
        this._showSelection(true);
        this._footer({ms: this._lastMs}, this._rows[0]?.id?.startsWith('fallback:'));
    }

    _point(item) {
        if (!this._pointerMoved || this._sheet.open)
            return;
        const index = this._rows.indexOf(item);
        if (index < 0 || index === this._selected)
            return;
        this._selected = index;
        this._showSelection(false);
    }

    _activate(item, {alternate = false} = {}) {
        if (!item)
            return;
        if (item.kind === 'content-search') {
            this._search.searchContent(this._files());
            return;
        }
        const query = this._entry.get_text();
        this._usage.record(query, item.historyId);
        // The panel lets go of the keyboard first, so the window that is
        // opened or raised gets it.
        this.close();
        try {
            item.activate?.({alternate, query});
        } catch (e) {
            console.error(`Material Search: opening ${item.id} failed: ${e.message}`);
        }
    }

    _openSheet() {
        const current = this._rows[this._selected];
        const actions = current?.actions?.() ?? [];
        if (actions.length === 0)
            return;
        this._sheet.show(current, actions);
        this._preview.show(null);
        const hints = [_('Enter to run'), _('Esc or Tab to go back')];
        this._keyLabels.forEach((hintLabel, i) => {
            hintLabel.visible = i < hints.length;
            if (i < hints.length)
                setText(hintLabel, hints[i]);
        });
        this._side.visible = true;
        if (this._compact) {
            this._resultsColumn.visible = false;
            this._sheet.actor.width = this._width - 2 * 8;
        } else {
            this._sheet.actor.width = -1;
        }
    }

    _closeSheet() {
        this._sheet.hide();
        this._resultsColumn.visible = true;
        this._side.visible = !this._compact;
        this._showSelection(false);
        this._footer({ms: this._lastMs}, this._rows[0]?.id?.startsWith('fallback:'));
    }

    _runAction(action) {
        if (!action)
            return;
        const current = this._rows[this._selected];
        if (action.stay) {
            action.run();
            this._openSheet();
            return;
        }
        this._usage.record(this._entry.get_text(), current?.historyId);
        this.close();
        try {
            action.run();
        } catch (e) {
            console.error(`Material Search: "${action.label}" failed: ${e.message}`);
        }
    }

    _key(event) {
        const symbol = event.get_key_symbol();
        const state = event.get_state();
        const ctrl = (state & Clutter.ModifierType.CONTROL_MASK) !== 0;
        switch (symbol) {
        case Clutter.KEY_Escape:
            if (this._sheet.open)
                this._closeSheet();
            else
                this.close();
            return Clutter.EVENT_STOP;
        case Clutter.KEY_Up:
        case Clutter.KEY_KP_Up:
            this._move(-1);
            return Clutter.EVENT_STOP;
        case Clutter.KEY_Down:
        case Clutter.KEY_KP_Down:
            this._move(1);
            return Clutter.EVENT_STOP;
        case Clutter.KEY_Page_Up:
            this._move(-PAGE);
            return Clutter.EVENT_STOP;
        case Clutter.KEY_Page_Down:
            this._move(PAGE);
            return Clutter.EVENT_STOP;
        case Clutter.KEY_Return:
        case Clutter.KEY_KP_Enter:
        case Clutter.KEY_ISO_Enter:
            if (this._sheet.open)
                this._runAction(this._sheet.current?.action);
            else
                this._activate(this._rows[this._selected], {alternate: ctrl});
            return Clutter.EVENT_STOP;
        case Clutter.KEY_Tab:
            if (this._sheet.open)
                this._closeSheet();
            else
                this._openSheet();
            return Clutter.EVENT_STOP;
        case Clutter.KEY_ISO_Left_Tab:
            if (this._sheet.open)
                this._closeSheet();
            return Clutter.EVENT_STOP;
        case Clutter.KEY_Left:
            if (this._sheet.open) {
                this._closeSheet();
                return Clutter.EVENT_STOP;
            }
            return Clutter.EVENT_PROPAGATE;
        case Clutter.KEY_n:
        case Clutter.KEY_p:
            if (ctrl) {
                this._move(symbol === Clutter.KEY_n ? 1 : -1);
                return Clutter.EVENT_STOP;
            }
            return Clutter.EVENT_PROPAGATE;
        case Clutter.KEY_c:
        case Clutter.KEY_C: {
            if (!ctrl)
                return Clutter.EVENT_PROPAGATE;
            // Copies the answer unless text in the field is selected.
            const answer = this._rows.find(row => row.kind === 'answer');
            if (answer && !this._entry.clutter_text.get_selection()) {
                copy(answer.copyText);
                return Clutter.EVENT_STOP;
            }
            return Clutter.EVENT_PROPAGATE;
        }
        default:
            return Clutter.EVENT_PROPAGATE;
        }
    }

    destroy() {
        if (this._isOpen)
            this.close();
        if (this._closing)
            this._finishClose();
        if (this._saveIdle) {
            GLib.source_remove(this._saveIdle);
            this._saveIdle = 0;
            this._usage.save();
        }
        this._search.stop();
        this._openSpring.stop();
        this._fadeSpring.stop();
        this._growSpring.stop();
        setMotionCheck(() => true);
        this._backdrop.destroy();
    }
}
