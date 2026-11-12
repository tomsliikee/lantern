// Lock, log out, suspend, restart, power off and the like, through the
// shell's own system actions. Logging out, restarting and powering off
// show GNOME's own dialog with its countdown; nothing is done unasked.

import * as SystemActions from 'resource:///org/gnome/shell/misc/systemActions.js';
import {gettext as _} from 'resource:///org/gnome/shell/extensions/extension.js';

import {matchAny, prepare, SCORE, terms as termsOf} from '../lib/matcher.js';
import {boost} from '../lib/history.js';
import {icon} from '../views/icons.js';

// Each action with the property that says whether it can be done here
// (lockdown, the session, the hardware); the screenshot tool always can.
const ICONS = {
    'lock-screen': 'lock', 'logout': 'logout', 'suspend': 'sleep', 'switch-user': 'person',
    'restart': 'restart', 'power-off': 'power', 'open-screenshot-ui': 'camera',
};
const IDS = {
    'lock-screen': 'can-lock-screen',
    'logout': 'can-logout',
    'suspend': 'can-suspend',
    'switch-user': 'can-switch-user',
    'restart': 'can-restart',
    'power-off': 'can-power-off',
    'open-screenshot-ui': null,
};
// A keyword names an action as well as its name does: "shutdown" is the
// top hit for Power Off.
const KEYWORD_SCORE = SCORE.wordPrefix - 100;

export class ActionsSource {
    constructor({history}) {
        this.id = 'actions';
        this.title = _('Actions');
        this.cost = 'instant';
        this.canTop = true;
        this._history = history;
        this._actions = null;
        this._names = new Map();
    }

    prepare() {
        if (!this._actions)
            this._actions = SystemActions.getDefault();
    }

    search(queryTerms, query, now) {
        this.prepare();
        const byKeyword = new Set(this._actions.getMatchingActions(termsOf(query)));
        const results = [];
        for (const [id, property] of Object.entries(IDS)) {
            if (property && !this._actions[property.replace(/-([a-z])/g, (_m, c) => c.toUpperCase())])
                continue;
            let name;
            try {
                name = this._actions.getName(id);
            } catch {
                continue;
            }
            if (!this._names.has(id))
                this._names.set(id, prepare(name));
            const found = matchAny(queryTerms, this._names.get(id));
            const keyword = byKeyword.has(id);
            if (!found && !keyword)
                continue;
            const historyId = `action:${id}`;
            const score = Math.max(found?.score ?? 0, keyword ? KEYWORD_SCORE : 0);
            const run = () => this._actions.activateAction(id);
            results.push({
                id: historyId,
                historyId,
                kind: 'action',
                title: name,
                positions: found?.positions ?? [],
                subtitle: _('System'),
                score: score + boost(this._history.data, query, historyId, now),
                icon: {gicon: icon(ICONS[id])},
                tone: 'tertiary',
                shape: 'clover4',
                activate: run,
                actions: () => [{label: name, icon: ICONS[id], run}],
                preview: () => ({
                    hero: {icon: {gicon: icon(ICONS[id])}, tone: 'tertiary', shape: 'clover4'},
                    name,
                    kind: _('System action'),
                    buttons: [{label: name, filled: true, run}],
                    list: [],
                }),
            });
        }
        return results;
    }

    destroy() {
        this._actions = null;
        this._names.clear();
    }
}
