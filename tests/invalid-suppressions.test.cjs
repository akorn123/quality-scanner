const { describe, it, after } = require('node:test');
const assert = require('node:assert/strict');
const { mkdtempSync, writeFileSync, rmSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { join } = require('node:path');
const { scanProject } = require('../lib/scanner.cjs');
const defaults = require('../config.cjs');

describe('invalid suppression feedback', () => {
  const root = mkdtempSync(join(tmpdir(), 'quality-invalid-suppression-'));
  const file = join(root, 'source.js');
  after(() => rmSync(root, { recursive: true, force: true }));

  for (const concern of ['behavior', 'testability', 'security']) {
    const id = concern === 'security' ? 'dynamic-code-execution' : 'example-rule';
    const scan = (comment) => {
      writeFileSync(file, `${comment}\nconst callback = eval(userCode);\n`);
      return scanProject({
        files: [file],
        targetToTests: new Map([[file, []]]),
        coverageByFile: new Map(),
        concern,
        config: {
          ...defaults,
          behaviorRules: [],
          testabilityRules: [],
          ...(concern === 'security' ? {} : {
            [`${concern}Rules`]: [{
              id,
              category: 'example-category',
              pattern: /eval\(/,
              description: 'Original finding.',
              suggestion: 'Original advice.',
            }],
          }),
        },
      })[concern][0];
    };

    for (const target of [id, concern, '*', `other-rule, ${id}`]) {
      for (const suffix of ['', ' --', ' --   ']) {
        it(`explains missing reasons for ${concern}: ${target}${suffix}`, () => {
          const result = scan(`// quality-scanner-ignore-next-line ${target}${suffix}`);
          const finding = result.findings.find((item) => item.id === id);
          assert.ok(finding);
          assert.match(finding.description, /comment on line 1.*missing a reason/);
          assert.match(finding.description, /Add a non-empty reason after " -- "/);
          assert.equal(result.suppressedFindings.some((item) => item.id === id), false);
          if (concern !== 'security') {
            assert.ok(finding.description.startsWith('Original finding.'));
            assert.equal(finding.suggestion, 'Original advice.');
          }
        });
      }
    }

    for (const comment of ['', '// ordinary comment', '// quality-scanner-ignore-next-line unrelated-rule']) {
      it(`does not add misleading feedback for ${concern}: ${comment || 'no comment'}`, () => {
        const result = scan(comment);
        const finding = result.findings.find((item) => item.id === id);
        assert.ok(finding);
        assert.doesNotMatch(finding.description, /missing a reason/);
      });
    }

    it(`still suppresses ${concern} with a reason`, () => {
      const result = scan(`// quality-scanner-ignore-next-line ${id} -- Reviewed exception.`);
      assert.equal(result.findings.some((item) => item.id === id), false);
      const finding = result.suppressedFindings.find((item) => item.id === id);
      assert.ok(finding);
      assert.doesNotMatch(finding.description, /missing a reason/);
    });
  }
});
