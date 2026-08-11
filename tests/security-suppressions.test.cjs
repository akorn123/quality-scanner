const { describe, it, after } = require('node:test');
const assert = require('node:assert/strict');
const {
  mkdtempSync,
  writeFileSync,
  rmSync,
} = require('node:fs');
const { join } = require('node:path');
const { tmpdir } = require('node:os');

const { analyzeSecurity } = require('../lib/security.cjs');
const defaults = require('../config.cjs');

describe('analyzeSecurity suppressions', () => {
  const tempRoot = mkdtempSync(join(tmpdir(), 'quality-scanner-sec-'));
  const routeFile = join(tempRoot, 'routes.js');

  after(() => {
    rmSync(tempRoot, { recursive: true, force: true });
  });

  it('records suppressed auth and rate-limit findings', () => {
    writeFileSync(
      routeFile,
      `const express = require('express');
const app = express();

// security ignore next endpoint-missing-authentication
app.get('/users', (req, res) => res.send('ok'));

// security ignore next authentication-endpoint-missing-rate-limit
app.post('/login', requireAuth, (req, res) => res.send('ok'));
`,
      'utf8',
    );

    const results = analyzeSecurity({
      files: [routeFile],
      config: defaults,
    });

    assert.ok(results.length >= 1);
    const suppressed = results.flatMap(
      (result) => result.suppressedFindings ?? [],
    );
    const ids = new Set(suppressed.map((finding) => finding.id));

    assert.ok(
      ids.has('endpoint-missing-authentication') ||
        ids.has('authentication-endpoint-missing-rate-limit'),
      `expected suppressed auth or rate-limit finding, got: ${[...ids].join(', ') || '(none)'}`,
    );

    assert.ok(
      suppressed.some(
        (finding) =>
          finding.suppressed === true &&
          finding.suppression,
      ),
    );
  });
});
