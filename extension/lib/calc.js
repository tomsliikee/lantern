// A small calculator: a parser of its own, never eval.
//
// It answers only what reads as a sum: at least one operator, function or
// constant. A lone number is a search for that number, not a question.

const FUNCTIONS = {
    sqrt: Math.sqrt, cbrt: Math.cbrt, abs: Math.abs,
    sin: Math.sin, cos: Math.cos, tan: Math.tan,
    asin: Math.asin, acos: Math.acos, atan: Math.atan,
    sinh: Math.sinh, cosh: Math.cosh, tanh: Math.tanh,
    ln: Math.log, log: Math.log10, log2: Math.log2, lg: Math.log10, exp: Math.exp,
    round: Math.round, floor: Math.floor, ceil: Math.ceil,
};

const CONSTANTS = {pi: Math.PI, 'π': Math.PI, e: Math.E, tau: 2 * Math.PI, 'τ': 2 * Math.PI};

const OPERATORS = {
    '+': '+', '-': '-', '−': '-', '–': '-',
    '*': '*', '×': '*', '·': '*', '⋅': '*',
    '/': '/', '÷': '/', ':': '/',
    '^': '^', '%': '%', '!': '!', '(': '(', ')': ')',
};

class CalcError extends Error {}

// Splits the text into numbers, names and operators. A comma is a decimal
// mark, as on a German keyboard; there is no thousands separator.
export function tokenize(text) {
    const tokens = [];
    let i = 0;
    while (i < text.length) {
        const ch = text[i];
        if (/\s/.test(ch)) {
            i++;
            continue;
        }
        if (text.startsWith('**', i)) {
            tokens.push({type: 'op', value: '^'});
            i += 2;
            continue;
        }
        const number = /^(\d+(?:[.,]\d*)?|[.,]\d+)(?:e[+-]?\d+)?/i.exec(text.slice(i));
        if (number) {
            tokens.push({type: 'num', value: Number.parseFloat(number[0].replace(',', '.'))});
            i += number[0].length;
            continue;
        }
        // "3x4": an x right after a number is a times sign, not a name.
        if ((ch === 'x' || ch === 'X') && tokens[tokens.length - 1]?.type === 'num' && /^[xX](?=[\s\d(.,])/.test(text.slice(i))) {
            tokens.push({type: 'op', value: '*'});
            i++;
            continue;
        }
        const name = /^[\p{L}_][\p{L}\p{N}_]*/u.exec(text.slice(i));
        if (name) {
            const word = name[0].toLowerCase();
            if (word === 'mod')
                tokens.push({type: 'op', value: 'mod'});
            else if (word === 'x' && tokens.length > 0)
                tokens.push({type: 'op', value: '*'});
            else
                tokens.push({type: 'name', value: word});
            i += name[0].length;
            continue;
        }
        if (OPERATORS[ch]) {
            tokens.push({type: 'op', value: OPERATORS[ch]});
            i++;
            continue;
        }
        throw new CalcError(`unexpected ${ch}`);
    }
    return tokens;
}

function factorial(n) {
    if (!Number.isInteger(n) || n < 0 || n > 170)
        throw new CalcError('factorial of a non-integer');
    let result = 1;
    for (let k = 2; k <= n; k++)
        result *= k;
    return result;
}

// Precedence climbing over the tokens.
//   sum     = product (('+' | '-') product ['%'])*
//   product = unary (('*' | '/' | 'mod' | implicit) unary)*
//   unary   = '-' unary | power
//   power   = postfix ['^' unary]
//   postfix = atom ('!' | '%')*
//   atom    = number | constant | function atom | '(' sum ')'
class Parser {
    constructor(tokens) {
        this.tokens = tokens;
        this.at = 0;
        this.operations = 0;
    }

    peek() {
        return this.tokens[this.at];
    }

    isOp(value) {
        const token = this.peek();
        return token?.type === 'op' && token.value === value;
    }

    take() {
        return this.tokens[this.at++];
    }

    parse() {
        const value = this.sum();
        if (this.at < this.tokens.length)
            throw new CalcError('trailing input');
        return value;
    }

    sum() {
        let value = this.product();
        while (this.isOp('+') || this.isOp('-')) {
            const op = this.take().value;
            this.operations++;
            const start = this.at;
            let right = this.product();
            // "200 + 10%" means ten per cent of 200 on top.
            const percent = this.tokens[this.at - 1]?.value === '%' && this.at - 1 > start;
            if (percent)
                right *= value;
            value = op === '+' ? value + right : value - right;
        }
        return value;
    }

    product() {
        let value = this.unary();
        for (;;) {
            if (this.isOp('*') || this.isOp('/') || this.isOp('mod')) {
                const op = this.take().value;
                this.operations++;
                const right = this.unary();
                if (op === '*')
                    value *= right;
                else if (op === '/')
                    value /= right;
                else
                    value = ((value % right) + right) % right;
                continue;
            }
            // "2pi", "3(4+1)", "2 sqrt 9": a factor straight after another.
            const next = this.peek();
            // Two numbers side by side are not a product: "3.5.1" is a version.
            if (next && (next.type === 'name' || (next.type === 'op' && next.value === '('))) {
                this.operations++;
                value *= this.unary();
                continue;
            }
            return value;
        }
    }

    unary() {
        if (this.isOp('-')) {
            this.take();
            return -this.unary();
        }
        if (this.isOp('+')) {
            this.take();
            return this.unary();
        }
        return this.power();
    }

    power() {
        const base = this.postfix();
        if (this.isOp('^')) {
            this.take();
            this.operations++;
            return base ** this.unary();
        }
        return base;
    }

    postfix() {
        let value = this.atom();
        for (;;) {
            if (this.isOp('!')) {
                this.take();
                this.operations++;
                value = factorial(value);
            } else if (this.isOp('%')) {
                this.take();
                this.operations++;
                value /= 100;
            } else {
                return value;
            }
        }
    }

    atom() {
        const token = this.take();
        if (!token)
            throw new CalcError('unexpected end');
        if (token.type === 'num')
            return token.value;
        if (token.type === 'name') {
            if (token.value in CONSTANTS) {
                this.operations++;
                return CONSTANTS[token.value];
            }
            if (token.value in FUNCTIONS) {
                this.operations++;
                return FUNCTIONS[token.value](this.postfix());
            }
            throw new CalcError(`unknown name ${token.value}`);
        }
        if (token.type === 'op' && token.value === '(') {
            const value = this.sum();
            // A missing closing bracket at the very end is forgiven: it is
            // still being typed.
            if (this.isOp(')'))
                this.take();
            else if (this.at < this.tokens.length)
                throw new CalcError('missing )');
            return value;
        }
        throw new CalcError(`unexpected ${token.value}`);
    }
}

// The value of text, or null when it is not a sum or cannot be worked out.
export function evaluate(text) {
    const source = (text ?? '').trim().replace(/=$/, '').trim();
    if (!source)
        return null;
    let tokens;
    try {
        tokens = tokenize(source);
    } catch {
        return null;
    }
    // One name alone (pi) is a constant; a word alone is a search.
    if (tokens.length === 1 && !(tokens[0].type === 'name' && tokens[0].value in CONSTANTS))
        return null;
    // Words that are neither functions nor constants make it a search.
    if (tokens.some(t => t.type === 'name' && !(t.value in FUNCTIONS) && !(t.value in CONSTANTS)))
        return null;
    try {
        const parser = new Parser(tokens);
        const value = parser.parse();
        if (parser.operations === 0 || !Number.isFinite(value))
            return null;
        return value;
    } catch {
        return null;
    }
}

// The answer as shown and as copied: at most twelve significant digits,
// no trailing zeros, scientific only for the very large and very small.
export function formatNumber(value) {
    if (value === 0 || Object.is(value, -0))
        return '0';
    const size = Math.abs(value);
    if (size >= 1e15 || size < 1e-9)
        return value.toExponential(6).replace(/\.?0+e/, 'e').replace('e+', 'e');
    const fixed = Number.parseFloat(value.toPrecision(12));
    return String(fixed);
}

// The expression as written back to the user, with proper signs.
export function prettyExpression(text) {
    return text.trim()
        .replace(/\*\*/g, '^')
        .replace(/\s*\*\s*/g, ' × ')
        .replace(/\s*\/\s*/g, ' ÷ ')
        .replace(/\s*\+\s*/g, ' + ')
        .replace(/(\S)\s*-\s*(?=\S)/g, '$1 − ')
        .replace(/\s+/g, ' ');
}
