import {test, equal, done} from './harness.js';
import {fallbackOrder} from '../extension/lib/fallback.js';

test('the web first by default, the rest in their order', () => {
    equal(fallbackOrder('web', {ai: true, files: true}), ['web', 'files', 'claude', 'agy', 'ollama']);
});
test('the chosen one moves to the top', () => {
    equal(fallbackOrder('ollama', {ai: true, files: true}), ['ollama', 'web', 'files', 'claude', 'agy']);
});
test('with the ask switch off no AI is offered, and an AI choice gives way to the web', () => {
    equal(fallbackOrder('claude', {ai: false, files: true}), ['web', 'files']);
});
test('files gives way to the web when files cannot be searched', () => {
    equal(fallbackOrder('files', {ai: true, files: false}), ['web', 'claude', 'agy', 'ollama']);
});
test('an unknown value gives way to the web', () => {
    equal(fallbackOrder('nonsense', {ai: false, files: false}), ['web']);
});
done('fallback');
