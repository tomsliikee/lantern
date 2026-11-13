// A blur behind the capsule, drawn by Blur My Shell while it is enabled.
//
// Lantern paints no blur of its own: it borrows Blur My Shell's pipeline
// (the one chosen for applications, liquid glass included) and its rounded
// corners. Without Blur My Shell nothing here exists, so a laptop pays
// nothing for it. This reaches into Blur My Shell's modules, which are not
// an API: if they change shape, the blur is left out and Lantern carries on.

import Clutter from 'gi://Clutter';
import Gio from 'gi://Gio';
import St from 'gi://St';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';

import {colors} from '../lib/tokens.js';

const UUID = 'blur-my-shell@aunetx';
const SCHEMA = 'org.gnome.shell.extensions.blur-my-shell.applications';
// ExtensionState.ENABLED, as Blur My Shell itself compares it.
const ENABLED = 1;
// The capsule's radius once it holds results (stylesheet .ms-capsule).
const PANEL_RADIUS = 30;
// All four corners, in Blur My Shell's corner policy.
const ALL_CORNERS = 0;

export class CapsuleBlur {
    // settings: Lantern's own (blur-follow); scheme: () => 'light' | 'dark'.
    constructor(backdrop, capsule, settings, scheme) {
        this._backdrop = backdrop;
        this._capsule = capsule;
        this._lantern = settings;
        this._scheme = scheme;
        this._style = null;
        this._followId = settings.connect('changed::blur-follow', () => this.refresh());
        this._holder = null;
        this._pipeline = null;
        this._settings = null;
        this._settingsIds = [];
        this._capsuleIds = [];
        // Bumped on every change, so a slow import cannot attach late.
        this._generation = 0;
        this._stateId = Main.extensionManager.connect('extension-state-changed', (_m, extension) => {
            if (extension.uuid === UUID)
                this._sync();
        });
        this._sync();
    }

    _sync() {
        const extension = Main.extensionManager.lookup(UUID);
        if (extension?.state === ENABLED && global.blur_my_shell)
            this._attach(extension).catch(error => {
                console.warn(`Lantern: no blur from Blur My Shell: ${error.message}`);
                this._detach();
            });
        else
            this._detach();
    }

    async _attach(extension) {
        if (this._pipeline)
            return;
        const generation = ++this._generation;
        const uri = extension.dir.resolve_relative_path('render/dynamic_surface.js').get_uri();
        const {DynamicPipeline} = await import(uri);
        const bms = global.blur_my_shell;
        if (generation !== this._generation || this._pipeline || !bms?._effects_manager)
            return;

        this._settings = this._openSettings(extension);
        const pipelineId = this._settings?.get_string('pipeline') || 'pipeline_default';

        this._holder = new St.Widget({reactive: false});
        this._holder.set_pivot_point(0.5, 0);
        this._holder.add_constraint(new Clutter.BindConstraint({
            source: this._capsule,
            coordinate: Clutter.BindCoordinate.ALL,
        }));
        this._backdrop.insert_child_below(this._holder, this._capsule);

        this._pipeline = new DynamicPipeline(bms._effects_manager, bms._pipelines_manager, pipelineId, {
            corner_radius: this._radius(),
            get_corners: () => ALL_CORNERS,
        });
        this._pipeline.attach_to_container(this._holder, 'lantern-blur');

        // The capsule's springs move scale, fade and height; the blur follows.
        const follow = () => {
            this._holder.set_scale(this._capsule.scale_x, this._capsule.scale_y);
            this._holder.opacity = this._capsule.opacity;
            this._pipeline?.set_corner_radius(this._radius());
            this.refresh();
        };
        this._capsuleIds = ['notify::scale-x', 'notify::opacity', 'notify::height', 'style-changed']
            .map(signal => this._capsule.connect(signal, follow));
        follow();

        if (this._settings) {
            this._settingsIds = [
                this._settings.connect('changed::pipeline', () =>
                    this._pipeline?.change_pipeline_to(this._settings.get_string('pipeline'))),
                this._settings.connect('changed::opacity', () => this.refresh()),
            ];
        }

        this._capsule.add_style_class_name('ms-blurred');
        this.refresh();
    }

    // The capsule's face over the blur. Following Blur My Shell, it takes
    // the opacity Blur My Shell gives windows (0 to 255); otherwise the
    // stylesheet's .ms-blurred (50 %) stands. Call after a scheme change.
    refresh() {
        let style = null;
        if (this._pipeline && this._settings && this._lantern.get_boolean('blur-follow')) {
            const bar = (colors[this._scheme()] ?? colors.dark).bar;
            const [r, g, b] = [1, 3, 5].map(i => parseInt(bar.slice(i, i + 2), 16));
            const alpha = Math.min(255, Math.max(0, this._settings.get_int('opacity'))) / 255;
            style = `background-color: rgba(${r}, ${g}, ${b}, ${alpha.toFixed(3)});`;
        }
        // set_style raises style-changed, which calls here again.
        if (style === this._style)
            return;
        this._style = style;
        this._capsule.set_style(style);
    }

    // Blur My Shell's schema ships with the extension, not in the system.
    _openSettings(extension) {
        const dir = extension.dir.get_child('schemas');
        const parent = Gio.SettingsSchemaSource.get_default();
        const source = dir.query_exists(null)
            ? Gio.SettingsSchemaSource.new_from_directory(dir.get_path(), parent, false)
            : parent;
        const schema = source?.lookup(SCHEMA, true);
        return schema ? new Gio.Settings({settings_schema: schema}) : null;
    }

    // The pill on its own is round at the ends; with results the capsule
    // has its fixed radius. Blur My Shell scales logical pixels itself.
    _radius() {
        if (!this._capsule.has_style_class_name('ms-lone'))
            return PANEL_RADIUS;
        const scale = St.ThemeContext.get_for_stage(global.stage).scale_factor;
        return Math.round(this._capsule.height / scale / 2);
    }

    _detach() {
        this._generation++;
        for (const id of this._capsuleIds)
            this._capsule.disconnect(id);
        this._capsuleIds = [];
        for (const id of this._settingsIds)
            this._settings.disconnect(id);
        this._settingsIds = [];
        this._settings = null;
        // Blur My Shell may already have torn its effects down.
        try {
            this._pipeline?.destroy();
        } catch (error) {
            console.warn(`Lantern: blur teardown: ${error.message}`);
        }
        this._pipeline = null;
        this._holder?.destroy();
        this._holder = null;
        this._capsule.remove_style_class_name('ms-blurred');
        this.refresh();
    }

    destroy() {
        Main.extensionManager.disconnect(this._stateId);
        this._stateId = 0;
        this._lantern.disconnect(this._followId);
        this._followId = 0;
        this._detach();
    }
}
