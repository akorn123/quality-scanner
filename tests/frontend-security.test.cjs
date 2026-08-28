const assert = require('node:assert/strict');
const { after, describe, it } = require('node:test');
const {
  mkdtempSync,
  rmSync,
  writeFileSync,
} = require('node:fs');
const { tmpdir } = require('node:os');
const { join } = require('node:path');

const defaults = require('../config.cjs');
const { analyzeSecurity } = require('../lib/security.cjs');

describe('frontend security scanning', () => {
  const tempRoot = mkdtempSync(
    join(tmpdir(), 'quality-scanner-frontend-security-'),
  );

  after(() => {
    rmSync(tempRoot, { recursive: true, force: true });
  });

  const scan = (name, source, security = defaults.security) => {
    const file = join(tempRoot, name);
    writeFileSync(file, source, 'utf8');

    return analyzeSecurity({
      files: [file],
      config: {
        ...defaults,
        security,
      },
    });
  };

  it('reports high-signal browser security concerns', () => {
    const results = scan(
      'unsafe-component.jsx',
      `const panel = <div dangerouslySetInnerHTML={{ __html: userHtml }} />;
const callback = eval(userCode);
localStorage.setItem('access_token', token);
window.parent.postMessage(accountData, '*');
fetch('http://api.example.com/accounts');
const link = <a href="javascript:runAction()">Run</a>;
`,
    );

    assert.equal(results.length, 1);
    assert.equal(results[0].framework, 'browser');

    const ids = new Set(
      results[0].findings.map((finding) => finding.id),
    );

    assert.deepEqual(
      ids,
      new Set([
        'unsafe-dom-html-injection',
        'dynamic-code-execution',
        'sensitive-browser-storage',
        'wildcard-postmessage-origin',
        'insecure-frontend-transport',
        'javascript-url',
      ]),
    );

    assert.ok(
      results[0].findings.every(
        (finding) => finding.description && finding.suggestion,
      ),
    );
  });

  it('allows configured sanitizers and local development transport', () => {
    const results = scan(
      'reviewed-component.jsx',
      `const panel = <div dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(userHtml) }} />;
fetch('http://localhost:3000/api/status');
`,
    );

    assert.deepEqual(results, []);
  });

  it('supports reviewed suppressions for frontend findings', () => {
    const results = scan(
      'legacy-integration.js',
      `// quality-scanner-ignore-next-line dynamic-code-execution -- Required by the reviewed legacy sandbox.
const callback = eval(sandboxedSource);
`,
    );

    assert.equal(results.length, 1);
    assert.equal(results[0].findings.length, 0);
    assert.equal(
      results[0].suppressedFindings[0].id,
      'dynamic-code-execution',
    );
  });

  it('can disable frontend checks without disabling endpoint scanning', () => {
    const results = scan(
      'disabled.js',
      `const callback = eval(userCode);`,
      {
        ...defaults.security,
        frontendEnabled: false,
      },
    );

    assert.deepEqual(results, []);
  });
});
