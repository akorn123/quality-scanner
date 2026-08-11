const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

describe('CLI entry (index.cjs)', () => {
  it('require does not throw, exports main, and completes synchronously', () => {
    const started = Date.now();
    const entry = require('../index.cjs');
    const elapsed = Date.now() - started;

    assert.equal(typeof entry.main, 'function');
    assert.ok(
      elapsed < 5000,
      `sync require hung or was too slow (${elapsed}ms)`,
    );
  });
});
