// Runs a query through the sources, cheapest first.
//
// The instant sources answer within the keystroke, in plain JS on prepared
// strings. The slow ones wait for two letters and 80 ms without a key, and
// every new keystroke cancels what they were asked. Their results are
// added below what is shown; the top hit stays.

import Gio from 'gi://Gio';
import GLib from 'gi://GLib';

import {terms as termsOf} from './lib/matcher.js';
import {arrange, count} from './lib/rank.js';

const DEBOUNCE_MS = 80;
const DEBUG = Boolean(GLib.getenv('MATERIAL_SEARCH_DEBUG'));

export class Search {
    // sources(): the switched-on sources in order of cost.
    // onResults(arrangement, info): info is {query, ms, pending, late, content}.
    constructor({sources, onResults}) {
        this._sources = sources;
        this._onResults = onResults;
        this._query = '';
        this._generation = 0;
        this._timer = 0;
        this._cancellable = null;
        this._instant = [];
        this._slow = new Map();
        this._top = null;
        this._ms = 0;
        this._pending = 0;
        this._content = null;
    }

    get query() {
        return this._query;
    }

    run(query) {
        this._stopSlow();
        this._query = query;
        this._generation++;
        this._slow.clear();
        this._content = null;
        this._top = null;
        const text = query.trim();
        if (!text) {
            this._instant = [];
            this._onResults({top: null, groups: []}, {query, ms: 0, pending: false, late: false});
            return;
        }
        const queryTerms = termsOf(text);
        const now = Date.now();
        const started = GLib.get_monotonic_time();
        const sources = this._sources();
        this._instant = [];
        for (const source of sources) {
            if (source.cost !== 'instant')
                continue;
            try {
                const before = DEBUG ? GLib.get_monotonic_time() : 0;
                this._instant.push({source, results: source.search(queryTerms, text, now)});
                if (DEBUG)
                    console.log(`Material Search: ${source.id} ${(GLib.get_monotonic_time() - before) / 1000} ms`);
            } catch (e) {
                console.error(`Material Search: ${source.id} failed: ${e.message}`);
            }
        }
        // A sum is answered here; files named like its numbers are noise.
        const answered = this._instant.some(({results}) => results.some(result => result.kind === 'answer'));
        const slow = answered ? [] : sources.filter(source => source.cost === 'slow' &&
            text.length >= (source.minLength ?? 1) && (source.active ?? true));
        this._pending = slow.length;
        const arrangement = this._arrange();
        this._ms = (GLib.get_monotonic_time() - started) / 1000;
        this._top = arrangement.top;
        this._onResults(arrangement, {query, ms: this._ms, pending: this._pending > 0, late: false});
        if (slow.length > 0)
            this._askLater(slow, queryTerms, text, now);
    }

    _askLater(slow, queryTerms, text, now) {
        const generation = this._generation;
        this._timer = GLib.timeout_add(GLib.PRIORITY_DEFAULT, DEBOUNCE_MS, () => {
            this._timer = 0;
            const cancellable = this._cancellable = new Gio.Cancellable();
            for (const source of slow) {
                source.search(queryTerms, text, now, cancellable).then(results => {
                    if (generation !== this._generation)
                        return;
                    this._slow.set(source.id, {source, results});
                }).catch(e => {
                    if (!e.matches?.(Gio.IOErrorEnum, Gio.IOErrorEnum.CANCELLED))
                        console.debug(`Material Search: ${source.id} did not answer: ${e.message}`);
                }).finally(() => {
                    if (generation !== this._generation)
                        return;
                    this._pending--;
                    this._publish();
                });
            }
            return GLib.SOURCE_REMOVE;
        });
    }

    // The full-text search inside documents, on request.
    searchContent(files) {
        const text = this._query.trim();
        if (!text || !files)
            return;
        const generation = this._generation;
        this._cancellable ??= new Gio.Cancellable();
        this._pending++;
        this._content = {results: [], done: false};
        this._publish();
        files.searchContent(text, Date.now(), this._cancellable).then(results => {
            if (generation === this._generation)
                this._content = {results, done: true};
        }).catch(e => {
            if (generation === this._generation)
                this._content = {results: [], done: true};
            if (!e.matches?.(Gio.IOErrorEnum, Gio.IOErrorEnum.CANCELLED))
                console.debug(`Material Search: the full-text search failed: ${e.message}`);
        }).finally(() => {
            if (generation !== this._generation)
                return;
            this._pending--;
            this._publish();
        });
    }

    _publish() {
        const arrangement = this._arrange();
        this._onResults(arrangement, {
            query: this._query,
            ms: this._ms,
            pending: this._pending > 0,
            late: true,
            content: this._content,
        });
    }

    // Sections in the order of the sources; a result may name a group of
    // its own (the calculator's "Also", one group per search provider).
    _arrange() {
        const sections = [];
        const byId = new Map();
        const add = (source, results) => {
            for (const result of results) {
                const group = result.group ?? {id: source.id, title: source.title, canTop: source.canTop};
                let section = byId.get(group.id);
                if (!section) {
                    section = {id: group.id, title: group.title, canTop: group.canTop, results: []};
                    byId.set(group.id, section);
                    sections.push(section);
                }
                section.results.push(result);
            }
        };
        for (const {source, results} of this._instant)
            add(source, results);
        // Slow sources in their own order, not in the order they answered.
        for (const source of this._sources()) {
            const answer = this._slow.get(source.id);
            if (answer)
                add(answer.source, answer.results);
        }
        if (this._content)
            add({id: 'content', title: '', canTop: false}, this._content.results);
        return arrange(sections, {lockedTop: this._top});
    }

    total(arrangement) {
        return count(arrangement);
    }

    _stopSlow() {
        if (this._timer) {
            GLib.source_remove(this._timer);
            this._timer = 0;
        }
        this._cancellable?.cancel();
        this._cancellable = null;
        this._pending = 0;
    }

    // The panel closed: nothing is left running.
    stop() {
        this._stopSlow();
        this._generation++;
        this._instant = [];
        this._slow.clear();
        this._content = null;
        this._top = null;
        this._query = '';
    }
}
