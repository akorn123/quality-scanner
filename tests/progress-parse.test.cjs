const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

describe('vitest progress parsing', () => {
  const stripAnsi = (text) =>
    String(text).replace(/\u001b\[[0-9;]*m/g, '');

  const FILE_RESULT =
    /(?:^|\n)\s*(?:✓|✔|√|×|✖|✕|PASS|FAIL)\s+\S+/g;

  const countFileResults = (text) => {
    const matches = stripAnsi(text).match(FILE_RESULT);
    return matches?.length ?? 0;
  };

  it('counts plain vitest file lines', () => {
    const text = [
      ' ✓ src/a.test.ts (2)',
      ' ✓ src/b.test.ts (1)',
      ' × src/c.test.ts (1)',
    ].join('\n');

    assert.equal(countFileResults(text), 3);
  });

  it('counts ANSI-colored vitest checkmarks', () => {
    const text =
      '\u001b[32m✓\u001b[39m src/a.test.ts (2)\n' +
      '\u001b[31m×\u001b[39m src/b.test.ts (1)\n';

    assert.equal(countFileResults(text), 2);
  });

  it('counts jest PASS/FAIL lines', () => {
    const text = 'PASS src/a.test.js\nFAIL src/b.test.js\n';
    assert.equal(countFileResults(text), 2);
  });
});
