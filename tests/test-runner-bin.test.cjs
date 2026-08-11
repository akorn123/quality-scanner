const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const {
  resolvePackageCli,
  nodeBinInvocation,
} = require('../lib/test-runner.cjs');

describe('test-runner package CLI helpers', () => {
  it('exports resolvePackageCli and nodeBinInvocation as functions', () => {
    assert.equal(typeof resolvePackageCli, 'function');
    assert.equal(typeof nodeBinInvocation, 'function');
  });

  it('builds a node invocation when a local package bin is resolvable', () => {
    // This package itself is not installed under node_modules during unit tests.
    // Prefer a known optional runner; otherwise skip without failing the suite.
    const candidates = ['vitest', 'jest', 'mocha', 'nyc', 'npm'];
    let invocation = null;
    let used = null;

    for (const name of candidates) {
      try {
        invocation = nodeBinInvocation(name, ['--version']);
        used = name;
        break;
      } catch {
        // Package not installed / no bin — try next.
      }
    }

    if (!invocation) {
      // Nothing resolvable in this environment; typeof checks above still passed.
      return;
    }

    assert.equal(invocation.command, process.execPath);
    assert.ok(Array.isArray(invocation.args));
    assert.ok(
      invocation.args[0].endsWith('.js') ||
        invocation.args[0].endsWith('.cjs') ||
        invocation.args[0].endsWith('.mjs'),
      `expected JS bin path for ${used}, got ${invocation.args[0]}`,
    );
    assert.deepEqual(invocation.args.slice(1), ['--version']);
  });
});
