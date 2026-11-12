// GNOME's search providers: other apps that answer over D-Bus. Each one is
// a round trip into another process, so none is asked unless switched on
// in the settings, and one that does not answer in 300 ms is left out.

import Gio from 'gi://Gio';
import GLib from 'gi://GLib';

import * as RemoteSearch from 'resource:///org/gnome/shell/ui/remoteSearch.js';
import {gettext as _} from 'resource:///org/gnome/shell/extensions/extension.js';

import {SCORE, terms as termsOf} from '../lib/matcher.js';
import {icon} from '../views/icons.js';

const ANSWER_MS = 300;
const PER_PROVIDER = 3;

// Gives up on a promise after ms; the timer exists only while it waits.
function within(promise, ms) {
    let timer = 0;
    const late = new Promise(resolve => {
        timer = GLib.timeout_add(GLib.PRIORITY_DEFAULT, ms, () => {
            timer = 0;
            resolve(null);
            return GLib.SOURCE_REMOVE;
        });
    });
    return Promise.race([promise, late]).finally(() => {
        if (timer)
            GLib.source_remove(timer);
    });
}

export class ProvidersSource {
    // enabled: the desktop ids switched on in the settings.
    constructor({enabled}) {
        this.id = 'providers';
        this.title = '';
        this.cost = 'slow';
        this.canTop = false;
        this.minLength = 2;
        this._enabled = enabled;
        this._providers = null;
        this._for = '';
    }

    prepare() {}

    // Loaded at the first search that needs them, and again when the list
    // of switched-on providers changed.
    _load() {
        const wanted = this._enabled();
        const key = wanted.join(';');
        if (this._providers && this._for === key)
            return this._providers;
        this._for = key;
        this._providers = wanted.length === 0 ? [] : RemoteSearch.loadRemoteSearchProviders(
            new Gio.Settings({schema_id: 'org.gnome.desktop.search-providers'}))
            .filter(provider => wanted.includes(provider.appInfo.get_id()));
        return this._providers;
    }

    get active() {
        return this._enabled().length > 0;
    }

    async search(_queryTerms, query, _now, cancellable) {
        const providers = this._load();
        if (providers.length === 0)
            return [];
        const terms = termsOf(query);
        const answers = await Promise.all(providers.map(async provider => {
            const answer = await within(this._ask(provider, terms, cancellable), ANSWER_MS);
            if (answer === null)
                console.debug(`Material Search: ${provider.appInfo.get_id()} took longer than ${ANSWER_MS} ms`);
            return answer;
        }));
        return answers.filter(Boolean).flat();
    }

    async _ask(provider, terms, cancellable) {
        const ids = await provider.getInitialResultSet(terms, cancellable);
        if (cancellable.is_cancelled() || ids.length === 0)
            return [];
        const metas = await provider.getResultMetas(provider.filterResults(ids, PER_PROVIDER), cancellable);
        const appId = provider.appInfo.get_id();
        const group = {id: `provider:${appId}`, title: _('In %s').format(provider.appInfo.get_name()), canTop: false};
        return metas.map((meta, index) => {
            // The provider's own icon, taken out of the actor it would build.
            const actor = meta.createIcon(16);
            const gicon = actor?.gicon ?? provider.appInfo.get_icon();
            actor?.destroy();
            const activate = () => provider.activateResult(meta.id, terms);
            return {
                id: `provider:${appId}:${meta.id}`,
                historyId: null,
                kind: 'provider',
                group,
                title: meta.name ?? '',
                positions: [],
                subtitle: meta.description ?? provider.appInfo.get_name(),
                // The provider's order is kept.
                score: SCORE.keyword - index,
                icon: {gicon},
                full: true,
                tone: 'neutral',
                shape: 'circle',
                activate,
                actions: () => {
                    const list = [{label: provider.appInfo.get_name(), icon: 'open', run: activate}];
                    if (provider.canLaunchSearch)
                        list.push({label: _('Search in %s').format(provider.appInfo.get_name()), icon: 'search', run: () => provider.launchSearch(terms)});
                    return list;
                },
                preview: null,
            };
        });
    }

    destroy() {
        this._providers = null;
    }
}
