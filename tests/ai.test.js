import {test, equal, done} from './harness.js';
import {PROVIDERS, parsePrefix, commandLine, parseLine, splitBlocks, nextShown, chatBody, warmBody} from '../extension/lib/ai.js';

test('prefixes', () => {
    equal(parsePrefix('claude: hi there')?.prompt, 'hi there');
    equal(parsePrefix('Claude:hi')?.provider.id, 'claude');
    equal(parsePrefix('AGY:   x')?.provider.id, 'agy');
    equal(parsePrefix('claude:')?.prompt, '');
    equal(parsePrefix('claude'), null);
    equal(parsePrefix('xclaude: a'), null);
    equal(parsePrefix(' claude: a'), null);
    equal(parsePrefix('claudette: a'), null);
});

test('command lines', () => {
    const claude = commandLine(PROVIDERS.claude, 'hi', null);
    equal(claude.slice(0, 3), ['claude', '-p', 'hi']);
    equal(claude.includes('--include-partial-messages'), true);
    equal(claude.includes('--resume'), false);
    const again = commandLine(PROVIDERS.claude, 'more', 'abc');
    equal(again.slice(-2), ['--resume', 'abc']);
    equal(commandLine(PROVIDERS.agy, 'hi', null), ['agy', '-p', 'hi', '--output-format', 'stream-json']);
    equal(commandLine(PROVIDERS.agy, 'hi', 'c1').slice(-2), ['--conversation', 'c1']);
});

test('claude lines', () => {
    const line = o => JSON.stringify(o);
    const p = PROVIDERS.claude;
    equal(parseLine(p, line({type: 'system', subtype: 'init', session_id: 's1'})), {kind: 'session', id: 's1'});
    equal(parseLine(p, line({type: 'stream_event', event: {type: 'content_block_delta', index: 0, delta: {type: 'thinking_delta', thinking: ''}}})), {kind: 'thinking'});
    equal(parseLine(p, line({type: 'stream_event', event: {type: 'content_block_delta', index: 1, delta: {type: 'text_delta', text: 'ok'}}})), {kind: 'text', text: 'ok'});
    equal(parseLine(p, line({type: 'result', subtype: 'success', is_error: false, result: 'ok'})), {kind: 'done'});
    equal(parseLine(p, line({type: 'result', subtype: 'success', is_error: true, result: 'Not logged in'})), {kind: 'error', message: 'Not logged in'});
    equal(parseLine(p, line({type: 'assistant', message: {}})), null);
});

test('agy lines', () => {
    const line = o => JSON.stringify(o);
    const p = PROVIDERS.agy;
    equal(parseLine(p, line({event: 'init', conversation_id: 'c1', init: {}})), {kind: 'session', id: 'c1'});
    equal(parseLine(p, line({event: 'step_update', step_update: {step_type: 'agent_response', state: 'ACTIVE', text_delta: 'ok'}})), {kind: 'text', text: 'ok'});
    equal(parseLine(p, line({event: 'step_update', step_update: {step_type: 'user_input', state: 'DONE'}})), null);
    equal(parseLine(p, line({event: 'result', result: {status: 'SUCCESS', response: 'ok\n'}})), {kind: 'done'});
    equal(parseLine(p, line({event: 'result', result: {status: 'FAILED', response: ''}})).kind, 'error');
});

test('ollama prefix and requests', () => {
    equal(parsePrefix('ollama: hi')?.provider.id, 'ollama');
    equal(parsePrefix('Ollama:x')?.prompt, 'x');
    const body = chatBody('qwen2.5:3b', [{role: 'user', content: 'hi'}]);
    equal(body.model, 'qwen2.5:3b');
    equal(body.stream, true);
    equal(body.messages.length, 1);
    equal(typeof body.keep_alive, 'string');
    equal(warmBody('m').messages, undefined);
});

test('ollama lines', () => {
    const line = o => JSON.stringify(o);
    const p = PROVIDERS.ollama;
    equal(parseLine(p, line({model: 'm', message: {role: 'assistant', content: 'Hal'}, done: false})), {kind: 'text', text: 'Hal'});
    equal(parseLine(p, line({message: {role: 'assistant', content: '', thinking: 'hm'}, done: false})), {kind: 'thinking'});
    equal(parseLine(p, line({message: {role: 'assistant', content: ''}, done: true, done_reason: 'stop'})), {kind: 'done'});
    equal(parseLine(p, line({error: "model 'x' not found"})), {kind: 'error', message: "model 'x' not found"});
    equal(parseLine(p, line({message: {role: 'assistant', content: ''}, done: false})), null);
});

test('garbage lines are ignored', () => {
    for (const p of Object.values(PROVIDERS)) {
        equal(parseLine(p, ''), null);
        equal(parseLine(p, 'not json'), null);
        equal(parseLine(p, '[1,2]'), null);
        equal(parseLine(p, '{"type":42}'), null);
    }
});

test('code blocks', () => {
    equal(splitBlocks('just text'), [{code: false, text: 'just text'}]);
    equal(splitBlocks('a\n```js\nlet x;\n```\nb'), [
        {code: false, text: 'a'}, {code: true, text: 'let x;'}, {code: false, text: 'b'}]);
    equal(splitBlocks('a\n```\nlet x'), [{code: false, text: 'a'}, {code: true, text: 'let x'}]);
    equal(splitBlocks(''), []);
});

test('the reveal always moves and never overshoots', () => {
    equal(nextShown(0, 0), 0);
    equal(nextShown(5, 5), 5);
    equal(nextShown(0, 1), 1);
    equal(nextShown(0, 3), 2);
    equal(nextShown(10, 11), 11);
    const big = nextShown(0, 1200);
    equal(big > 20 && big < 1200, true);
});

done('ai');
