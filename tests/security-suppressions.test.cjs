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

  for (const withReason of [false, true]) {
    it(`${withReason ? 'suppresses' : 'reports'} a multiline logout route ${withReason ? 'with' : 'without'} an ignore reason`, () => {
      writeFileSync(
        routeFile,
        `const express = require('express');
const apiRouter = express.Router();
// quality-scanner-ignore-next-line endpoint-missing-authentication${withReason ? ' -- Reviewed logout exception.' : ''}
apiRouter.post("/auth/logout", auth.logoutHandler(), (_req, res) =>
  res.json({
    message: "Logged out",
  }),
);
`,
        'utf8',
      );

      const [result] = analyzeSecurity({ files: [routeFile], config: defaults });
      assert.ok(result);
      assert.equal(result.endpoints.length, 1);
      const authFindings = result.findings.filter(
        (finding) => finding.id === 'endpoint-missing-authentication',
      );
      const suppressedAuth = result.suppressedFindings.filter(
        (finding) => finding.id === 'endpoint-missing-authentication',
      );
      assert.equal(authFindings.length, withReason ? 0 : 1);
      assert.equal(suppressedAuth.length, withReason ? 1 : 0);
      assert.equal((withReason ? suppressedAuth : authFindings)[0].line, 4);
      if (withReason) {
        assert.equal(suppressedAuth[0].suppressed, true);
        assert.equal(suppressedAuth[0].suppression.reason, 'Reviewed logout exception.');
        assert.doesNotMatch(suppressedAuth[0].description, /missing a reason/);
      } else {
        assert.match(authFindings[0].description, /comment on line 3.*missing a reason/);
        assert.match(authFindings[0].description, /endpoint-missing-authentication -- Explain why/);
      }
    });
  }

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
