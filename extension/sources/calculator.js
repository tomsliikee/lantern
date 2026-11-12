// Sums and unit conversions, worked out here with the parser in lib/.

import Gio from 'gi://Gio';
import GioUnix from 'gi://GioUnix';
import St from 'gi://St';

import {gettext as _} from 'resource:///org/gnome/shell/extensions/extension.js';

import {evaluate, formatNumber, prettyExpression} from '../lib/calc.js';
import {convert} from '../lib/units.js';
import {launchContext} from './apps.js';
import {icon} from '../views/icons.js';

// Above every match, so a sum is always the top hit.
const ANSWER_SCORE = 5000;
const CALCULATOR = 'org.gnome.Calculator.desktop';

export function copy(text) {
    St.Clipboard.get_default().set_text(St.ClipboardType.CLIPBOARD, text);
}

export class CalculatorSource {
    constructor() {
        this.id = 'calculator';
        this.title = _('Answer');
        this.cost = 'instant';
        this.canTop = true;
        this._calculator = undefined;
    }

    prepare() {}

    _app() {
        if (this._calculator === undefined)
            this._calculator = GioUnix.DesktopAppInfo.new(CALCULATOR);
        return this._calculator;
    }

    search(_terms, query) {
        // Quick refusals first: most queries are names, not sums.
        if (!/[\d.,]|pi|π|tau|sqrt|e\b/i.test(query))
            return [];
        const conversion = convert(query);
        let value = null;
        let shown = null;
        let expression = null;
        if (conversion) {
            value = conversion.text;
            shown = conversion.text;
            expression = conversion.expression;
        } else {
            const number = evaluate(query);
            if (number === null)
                return [];
            value = formatNumber(number);
            shown = value;
            expression = prettyExpression(query);
        }
        const answer = {
            id: 'calc:answer',
            historyId: null,
            kind: 'answer',
            title: shown,
            copyText: conversion ? formatNumber(conversion.value) : value,
            expression,
            positions: [],
            score: ANSWER_SCORE,
            icon: {gicon: icon('calc')},
            tone: 'sunny',
            shape: 'sunny',
            activate: () => copy(answer.copyText),
            actions: () => [
                {label: _('Copy %s').format(answer.copyText), icon: 'copy', run: () => copy(answer.copyText)},
                {label: _('Copy with the sum'), icon: 'copy', run: () => copy(`${expression} = ${shown}`)},
            ],
            preview: null,
        };
        const results = [answer];
        const app = this._app();
        if (app && !conversion) {
            results.push({
                id: 'calc:open',
                historyId: null,
                kind: 'command',
                group: {id: 'also', title: _('Also'), canTop: false},
                title: _('Open in Calculator'),
                positions: [],
                subtitle: _('App'),
                score: 0,
                icon: {gicon: icon('calc')},
                tone: 'neutral',
                shape: 'circle',
                activate: () => app.launch([], launchContext()),
                actions: () => [],
                preview: null,
            });
        }
        return results;
    }

    destroy() {
        this._calculator = null;
    }
}
