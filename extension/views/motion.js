// Values carried by a spring. A timeline exists only while a value moves,
// so nothing ticks while the panel rests or is hidden.

import Clutter from 'gi://Clutter';

import {SPRINGS, settleMs, springAt} from '../lib/spring.js';

// Insights Mono's spring drives scale and press (it overshoots about 28 %).
// The capsule's height uses a spring that does not overshoot, since 28 % of
// a height would show. Selection fades in 120 ms through the stylesheet.
export const OPEN = SPRINGS.mono;
export const GROW = {damping: 1, stiffness: 620};
// The panel's arrival: barely past its size (about 0.5 %), so it settles
// like Spotlight's instead of bouncing.
export const ARRIVE = {damping: 0.86, stiffness: 620};
export const SELECT_MS = 120;
export const PRESS_SCALE = 0.97;

export class Spring {
    // apply(value) is called every frame; actor gives the timeline its clock.
    // rest: the share of the way that may be left when the timeline ends.
    constructor(actor, apply, spring, rest = undefined) {
        this._rest = rest;
        this._actor = actor;
        this._apply = apply;
        this._spring = spring;
        this._timeline = null;
        this._from = 0;
        this._to = 0;
        this.value = 0;
    }

    get moving() {
        return this._timeline !== null;
    }

    get target() {
        return this._to;
    }

    // Goes to target from where it is now; onDone when it has settled.
    to(target, onDone = null) {
        this.stop();
        this._from = this.value;
        this._to = target;
        if (this._from === target) {
            this._apply(target);
            onDone?.();
            return;
        }
        const timeline = this._timeline = new Clutter.Timeline({
            actor: this._actor,
            duration: settleMs(this._spring, this._rest),
        });
        timeline.connect('new-frame', () => {
            const share = springAt(timeline.get_elapsed_time() / 1000, this._spring);
            this.value = this._from + (this._to - this._from) * share;
            this._apply(this.value);
        });
        timeline.connect('completed', () => {
            this._timeline = null;
            this.value = this._to;
            this._apply(this._to);
            onDone?.();
        });
        timeline.start();
    }

    // Straight there, without motion.
    set(value) {
        this.stop();
        this.value = this._to = value;
        this._apply(value);
    }

    stop() {
        if (!this._timeline)
            return;
        const timeline = this._timeline;
        this._timeline = null;
        timeline.stop();
        timeline.run_dispose?.();
    }
}

// Whether motion is on is the panel's call (settings, battery); the rows ask
// through this.
let allowed = () => true;

export function setMotionCheck(check) {
    allowed = check;
}

// A button that squashes to PRESS_SCALE under the pointer and springs back.
// The spring and its timeline exist only while it moves.
export function pressable(button) {
    button.set_pivot_point(0.5, 0.5);
    let spring = null;
    // A row hidden mid-squash (a click closes the panel) starts clean.
    button.connect('notify::mapped', () => {
        if (button.mapped)
            return;
        spring?.stop();
        button.set_scale(1, 1);
    });
    button.connect('notify::pressed', () => {
        if (!allowed()) {
            button.set_scale(1, 1);
            return;
        }
        spring ??= new Spring(button, value => {
            const scale = 1 - (1 - PRESS_SCALE) * value;
            button.set_scale(scale, scale);
        }, OPEN, 0.02);
        spring.to(button.pressed ? 1 : 0);
    });
}
