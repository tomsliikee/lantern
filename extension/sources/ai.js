// Runs one question and reports what is streamed back. Claude and agy are
// command line programs: one process per question, a follow-up resumes the
// session the first answer named. Ollama is a local server: one request per
// question carrying the conversation so far. Nothing is kept running between
// questions, and after cancel() or reset() no event is delivered any more.

import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Soup from 'gi://Soup?version=3.0';

import {OLLAMA_URL, chatBody, commandLine, parseLine, warmBody} from '../lib/ai.js';

Gio._promisify(Gio.DataInputStream.prototype, 'read_line_async', 'read_line_finish');
Gio._promisify(Soup.Session.prototype, 'send_async', 'send_finish');

const encoder = new TextEncoder();

// The shell's PATH may not hold ~/.local/bin, where these programs live.
function find(program) {
    const found = GLib.find_program_in_path(program);
    if (found)
        return found;
    const local = GLib.build_filenamev([GLib.get_home_dir(), '.local', 'bin', program]);
    return GLib.file_test(local, GLib.FileTest.IS_EXECUTABLE) ? local : null;
}

function post(path, body) {
    const message = Soup.Message.new('POST', `${OLLAMA_URL}${path}`);
    message.set_request_body_from_bytes('application/json', new GLib.Bytes(encoder.encode(JSON.stringify(body))));
    return message;
}

export class AskRunner {
    // onEvent({kind: 'thinking'|'text'|'done'|'error', ...})
    constructor({onEvent}) {
        this._onEvent = onEvent;
        this._generation = 0;
        this._process = null;
        this._cancellable = null;
        this._session = null;
        this._messages = [];
        this._reply = '';
        this._http = null;
    }

    get running() {
        return this._process !== null || this._cancellable !== null;
    }

    // options.model: the Ollama model to ask.
    send(provider, prompt, options = {}) {
        this.cancel();
        const generation = this._generation;
        if (provider.http)
            this._sendHttp(provider, prompt, options.model, generation);
        else
            this._spawn(provider, prompt, generation);
    }

    // Loads the model while the user is still typing; the answer is ignored.
    warm(model) {
        this._http ??= new Soup.Session({timeout: 0});
        this._http.send_async(post('/api/generate', warmBody(model)), GLib.PRIORITY_LOW, null)
            .then(stream => stream.close_async(GLib.PRIORITY_LOW, null)).catch(() => {});
    }

    _later(generation, event) {
        GLib.idle_add(GLib.PRIORITY_DEFAULT, () => {
            if (generation === this._generation)
                this._onEvent(event);
            return GLib.SOURCE_REMOVE;
        });
    }

    _spawn(provider, prompt, generation) {
        const program = find(provider.program);
        if (!program) {
            // Answered after the caller has set its state up.
            this._later(generation, {kind: 'error', message: `${provider.name} is not installed.`});
            return;
        }
        const argv = commandLine(provider, prompt, this._session);
        argv[0] = program;
        let process;
        try {
            const launcher = new Gio.SubprocessLauncher({
                flags: Gio.SubprocessFlags.STDOUT_PIPE | Gio.SubprocessFlags.STDERR_MERGE,
            });
            launcher.set_cwd(GLib.get_home_dir());
            process = launcher.spawnv(argv);
        } catch (e) {
            this._later(generation, {kind: 'error', message: `${provider.name} did not start: ${e.message}`});
            return;
        }
        this._process = process;
        this._run(provider, process.get_stdout_pipe(), generation, async plain => {
            await process.wait_async(null).catch(() => null);
            const code = process.get_if_exited() ? process.get_exit_status() : -1;
            return code === 0 ? {kind: 'done'}
                : {kind: 'error', message: plain || `${provider.name} stopped (exit ${code}).`};
        });
    }

    _sendHttp(provider, prompt, model, generation) {
        this._messages.push({role: 'user', content: prompt});
        this._reply = '';
        this._http ??= new Soup.Session({timeout: 0});
        const cancellable = this._cancellable = new Gio.Cancellable();
        const message = post('/api/chat', chatBody(model, this._messages));
        this._http.send_async(message, GLib.PRIORITY_DEFAULT, cancellable).then(stream => {
            if (generation !== this._generation)
                return null;
            return this._run(provider, stream, generation, async () =>
                ({kind: 'error', message: `${provider.name} stopped answering.`}), cancellable);
        }).catch(e => {
            if (generation !== this._generation)
                return;
            this._messages.pop();
            this._finish(generation, {kind: 'error', message: `${provider.name} is not reachable on this computer.`});
        });
    }

    // Reads lines until the stream ends. unended() makes the event for a
    // stream that ended without saying done or error.
    async _run(provider, input, generation, unended, cancellable = null) {
        try {
            const stream = new Gio.DataInputStream({base_stream: input});
            const decoder = new TextDecoder();
            let ended = false;
            let plain = '';
            for (;;) {
                const [bytes] = await stream.read_line_async(GLib.PRIORITY_DEFAULT, cancellable);
                if (generation !== this._generation)
                    return;
                if (bytes === null)
                    break;
                const line = decoder.decode(bytes);
                const event = parseLine(provider, line);
                if (!event) {
                    // What a program says besides its JSON, if it fails.
                    if (line.trim() !== '' && !line.trim().startsWith('{'))
                        plain = line.trim();
                    continue;
                }
                if (event.kind === 'session') {
                    this._session = event.id;
                    continue;
                }
                if (event.kind === 'done' || event.kind === 'error') {
                    ended = true;
                    this._finish(generation, event);
                    continue;
                }
                if (event.kind === 'text')
                    this._reply += event.text;
                this._onEvent(event);
            }
            if (generation === this._generation && !ended)
                this._finish(generation, await unended(plain));
        } catch (e) {
            if (generation === this._generation)
                this._finish(generation, {kind: 'error', message: e.message});
        }
    }

    _finish(generation, event) {
        if (generation !== this._generation)
            return;
        this._process = null;
        this._cancellable = null;
        if (this._messages.length > 0 && this._messages.at(-1).role === 'user') {
            // The conversation Ollama is sent grows by what it answered.
            if (event.kind === 'done' && this._reply !== '')
                this._messages.push({role: 'assistant', content: this._reply});
            else
                this._messages.pop();
        }
        this._onEvent(event);
    }

    // Stops the question that is running; its partial answer stays with the caller.
    cancel() {
        this._generation++;
        if (this._process) {
            this._process.force_exit();
            this._process = null;
        }
        if (this._cancellable) {
            this._cancellable.cancel();
            this._cancellable = null;
            if (this._messages.at(-1)?.role === 'user')
                this._messages.pop();
        }
    }

    // The conversation is over.
    reset() {
        this.cancel();
        this._session = null;
        this._messages = [];
    }

    destroy() {
        this.reset();
        this._http?.abort();
        this._http = null;
    }
}
