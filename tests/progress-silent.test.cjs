const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const {
  createDeterminateProgress,
  createProgress,
} = require('../lib/progress.cjs');

describe('silent progress', () => {
  it('does not log indeterminate progress lifecycle messages', () => {
    const originalLog = console.log;
    const output = [];
    console.log = (...values) => output.push(values.join(' '));

    try {
      const progress = createProgress({ silent: true });
      progress.start();
      progress.update('Coverage');
      progress.succeed();
    } finally {
      console.log = originalLog;
    }

    assert.deepEqual(output, []);
  });

  it('does not log determinate progress lifecycle messages', () => {
    const originalLog = console.log;
    const output = [];
    console.log = (...values) => output.push(values.join(' '));

    try {
      const progress = createDeterminateProgress({
        total: 2,
        silent: true,
      });
      progress.start();
      progress.increment();
      progress.coverage();
      progress.succeed();
    } finally {
      console.log = originalLog;
    }

    assert.deepEqual(output, []);
  });
});
