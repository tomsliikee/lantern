// Minimal test harness for gjs; the project has no test dependency on purpose.
let failed = 0;
let passed = 0;

export function test(name, fn) {
    try {
        fn();
        passed++;
    } catch (e) {
        failed++;
        printerr(`FAIL ${name}\n  ${e.message}`);
    }
}

export function equal(actual, expected) {
    const a = JSON.stringify(actual);
    const b = JSON.stringify(expected);
    if (a !== b)
        throw new Error(`expected ${b}, got ${a}`);
}

export function done(suite) {
    print(`${suite}: ${passed} passed, ${failed} failed`);
    if (failed > 0)
        imports.system.exit(1);
}
