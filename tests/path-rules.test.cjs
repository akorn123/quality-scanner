const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const { merge } = require('../lib/config.cjs');
const {
  scanPaths,
  validatePathRule,
} = require('../lib/scanner.cjs');
const defaults = require('../config.cjs');

describe('custom path rules', () => {
  it('reports matching project-relative paths', () => {
    const config = merge(defaults, {
      pathRules: [
        {
          id: 'no-pascal-case-files',
          pathPattern: /[\\/][A-Z][^\\/]*\.[cm]?[jt]sx?$/,
          severity: 'error',
          penalty: 20,
          description: 'Source filenames must use lowercase kebab-case.',
        },
      ],
    });

    const [result] = scanPaths(
      [path.join(process.cwd(), 'src', 'BadName.ts')],
      config.pathRules.map((rule) => ({
        severity: 'warning',
        penalty: 5,
        category: 'naming',
        concern: 'structure',
        ...rule,
      })),
    );

    assert.equal(result.findings.length, 1);
    assert.equal(result.findings[0].id, 'no-pascal-case-files');
    assert.equal(result.findings[0].path, 'src/BadName.ts');
    assert.equal(result.findings[0].ruleFamily, 'path');
  });

  it('rejects path rules without a regular expression', () => {
    assert.throws(
      () => validatePathRule({
        id: 'invalid',
        pathPattern: 'src',
      }),
      /pathPattern/,
    );
  });

  it('reports a missing required path and an existing forbidden path', () => {
    const root = process.cwd();
    const rules = [
      validatePathRule({
        id: 'requires-entrypoint',
        mode: 'required',
        path: 'src/missing-entrypoint.ts',
        severity: 'error',
        penalty: 25,
      }),
      validatePathRule({
        id: 'forbids-legacy-directory',
        mode: 'forbidden',
        path: 'rules',
        severity: 'warning',
        penalty: 10,
      }),
    ];

    const [result] = scanPaths([], rules, root);

    assert.deepEqual(
      result.findings.map((finding) => [finding.id, finding.path]),
      [
        ['requires-entrypoint', 'src/missing-entrypoint.ts'],
        ['forbids-legacy-directory', 'rules'],
      ],
    );
    assert.equal(result.findings[0].code, '[missing path]');
  });

  it('matches required path patterns against files and directories', () => {
    const rules = [
      validatePathRule({
        id: 'requires-domain-directory',
        mode: 'required',
        pathPattern: /^src\/domain(?:\/|$)/,
      }),
    ];

    const [result] = scanPaths(
      [
        path.join(process.cwd(), 'src', 'domain'),
        path.join(process.cwd(), 'src', 'domain', 'user.ts'),
      ],
      rules,
    );

    assert.equal(result.findings.length, 0);
  });
});
