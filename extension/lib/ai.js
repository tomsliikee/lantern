// The ask mode's logic without the shell: which prefix names which command
// line program, how its streamed output reads, and how an answer is cut
// into text and code for showing.

export const PROVIDERS = {
    claude: {id: 'claude', name: 'Claude', program: 'claude'},
    agy: {id: 'agy', name: 'agy', program: 'agy'},
    // Answers over HTTP from the local server; the model is a setting.
    ollama: {id: 'ollama', name: 'Ollama', http: true},
};

const PREFIX = /^(claude|agy|ollama):\s*/i;

// "claude: how do I ..." -> the provider and what follows the colon.
export function parsePrefix(text) {
    const match = PREFIX.exec(text);
    if (!match)
        return null;
    return {provider: PROVIDERS[match[1].toLowerCase()], prompt: text.slice(match[0].length)};
}

// The command line of one question. session is what an earlier answer
// reported, or null for the first question of a conversation. Claude gets no
// tools: the answer is text.
export function commandLine(provider, prompt, session) {
    if (provider.id === 'claude') {
        const line = [provider.program, '-p', prompt, '--output-format', 'stream-json',
            '--include-partial-messages', '--verbose', '--tools', ''];
        if (session)
            line.push('--resume', session);
        return line;
    }
    const line = [provider.program, '-p', prompt, '--output-format', 'stream-json'];
    if (session)
        line.push('--conversation', session);
    return line;
}

export const OLLAMA_URL = 'http://127.0.0.1:11434';
// How long the server keeps the model in memory after the last question.
const KEEP_ALIVE = '10m';

// The body of a chat request: the whole conversation so far, streamed back.
export function chatBody(model, messages) {
    return {model, messages, stream: true, keep_alive: KEEP_ALIVE};
}

// A request without a prompt, which only loads the model.
export function warmBody(model) {
    return {model, keep_alive: KEEP_ALIVE};
}

function ollamaEvent(data) {
    if (typeof data.error === 'string')
        return {kind: 'error', message: data.error};
    if (data.done === true)
        return {kind: 'done'};
    const message = data.message;
    if (typeof message?.content === 'string' && message.content !== '')
        return {kind: 'text', text: message.content};
    if (typeof message?.thinking === 'string' && message.thinking !== '')
        return {kind: 'thinking'};
    return null;
}

function claudeEvent(data) {
    if (data.type === 'system' && data.subtype === 'init' && typeof data.session_id === 'string')
        return {kind: 'session', id: data.session_id};
    if (data.type === 'stream_event') {
        const delta = data.event?.type === 'content_block_delta' ? data.event.delta : null;
        if (delta?.type === 'thinking_delta')
            return {kind: 'thinking'};
        if (delta?.type === 'text_delta' && typeof delta.text === 'string')
            return {kind: 'text', text: delta.text};
        return null;
    }
    if (data.type === 'result') {
        if (data.is_error)
            return {kind: 'error', message: String(data.result ?? '')};
        return {kind: 'done'};
    }
    return null;
}

function agyEvent(data) {
    if (data.event === 'init' && typeof data.conversation_id === 'string')
        return {kind: 'session', id: data.conversation_id};
    if (data.event === 'step_update') {
        const step = data.step_update;
        if (step?.step_type === 'agent_response' && typeof step.text_delta === 'string' && step.text_delta !== '')
            return {kind: 'text', text: step.text_delta};
        return null;
    }
    if (data.event === 'result') {
        if (data.result?.status === 'SUCCESS')
            return {kind: 'done'};
        return {kind: 'error', message: String(data.result?.response || data.result?.status || '')};
    }
    return null;
}

// One line of a program's output -> an event, or null for what the card
// does not need (and for anything that is not what it expects).
export function parseLine(provider, line) {
    let data;
    try {
        data = JSON.parse(line);
    } catch {
        return null;
    }
    if (data === null || typeof data !== 'object' || Array.isArray(data))
        return null;
    if (provider.id === 'claude')
        return claudeEvent(data);
    return provider.id === 'ollama' ? ollamaEvent(data) : agyEvent(data);
}

// An answer as runs of text and code. A fence still open (the answer is
// streaming) is code up to the end.
export function splitBlocks(text) {
    const blocks = [];
    let code = false;
    let lines = [];
    const flush = () => {
        const joined = lines.join('\n');
        const body = code ? joined.replace(/\n+$/, '') : joined.replace(/^\n+|\n+$/g, '');
        if (body !== '')
            blocks.push({code, text: body});
        lines = [];
    };
    for (const line of text.split('\n')) {
        if (line.startsWith('```')) {
            flush();
            code = !code;
        } else {
            lines.push(line);
        }
    }
    flush();
    return blocks;
}

// How many characters are showing after one tick of the reveal: a few at a
// time, more when much is waiting, so the text keeps up without jumping.
export function nextShown(shown, total) {
    const backlog = total - shown;
    if (backlog <= 0)
        return total;
    return Math.min(total, shown + Math.max(2, Math.ceil(backlog / 10)));
}
