const assert = require('node:assert/strict');
const { describe, it } = require('node:test');
const {
  mkdtempSync,
  mkdirSync,
  rmSync,
  writeFileSync,
} = require('node:fs');
const { tmpdir } = require('node:os');
const { join } = require('node:path');

const defaults = require('../config.cjs');
const {
  getCoverageCompleteness,
  loadCoverage,
} = require('../lib/coverage.cjs');
const { findReusableArtifacts } = require('../lib/test-runner.cjs');

const withTempDir = (fn) => {
  const dir = mkdtempSync(join(tmpdir(), 'quality-scanner-completeness-'));
  try {
    return fn(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
};

const writeCoverageSummary = (file, relativeFiles) => {
  mkdirSync(require('node:path').dirname(file), { recursive: true });
  const entries = Object.fromEntries(
    relativeFiles.map((name) => [
      name,
      {
        lines: { total: 1, covered: 1, skipped: 0, pct: 100 },
        statements: { total: 1, covered: 1, skipped: 0, pct: 100 },
        functions: { total: 1, covered: 1, skipped: 0, pct: 100 },
        branches: { total: 0, covered: 0, skipped: 0, pct: 100 },
      },
    ]),
  );
  writeFileSync(
    file,
    JSON.stringify({
      total: {
        lines: { total: relativeFiles.length, covered: relativeFiles.length, skipped: 0, pct: 100 },
      },
      ...entries,
    }),
  );
};

describe('coverage completeness guard', () => {
  it('getCoverageCompleteness reports ratio of expected files present', () => {
    const coverage = { byFile: new Map([['src/a.js', {}], ['src/b.js', {}]]) };
    const result = getCoverageCompleteness(coverage, [
      'src/a.js',
      'src/b.js',
      'src/c.js',
      'src/d.js',
    ]);

    assert.equal(result.expected, 4);
    assert.equal(result.present, 2);
    assert.deepEqual(result.missing.sort(), ['src/c.js', 'src/d.js']);
    assert.equal(result.ratio, 0.5);
  });

  it('rejects a coverage summary that only covers a small batch of files', () => {
    withTempDir((dir) => {
      const coverageFile = join(dir, 'coverage-summary.json');
      // Only one of four testable files shows up: simulates someone running
      // `vitest run one.test.js --coverage` instead of the full suite.
      writeCoverageSummary(coverageFile, ['src/a.js']);

      const config = {
        ...defaults,
        freshness: { requireToday: false },
        coverageSummaryPaths: [coverageFile],
      };

      assert.throws(
        () =>
          loadCoverage(config, true, null, [
            'src/a.js',
            'src/b.js',
            'src/c.js',
            'src/d.js',
          ]),
        /only accounts for 1\/4 testable file/,
      );
    });
  });

  it('accepts a coverage summary that covers enough of the testable files', () => {
    withTempDir((dir) => {
      const coverageFile = join(dir, 'coverage-summary.json');
      writeCoverageSummary(coverageFile, [
        'src/a.js',
        'src/b.js',
        'src/c.js',
        'src/d.js',
      ]);

      const config = {
        ...defaults,
        freshness: { requireToday: false },
        coverageSummaryPaths: [coverageFile],
      };

      const coverage = loadCoverage(config, true, null, [
        'src/a.js',
        'src/b.js',
        'src/c.js',
        'src/d.js',
      ]);

      assert.equal(coverage.file, coverageFile);
    });
  });

  it('does not enforce completeness against an explicit --coverage-target', () => {
    withTempDir((dir) => {
      const coverageFile = join(dir, 'coverage-summary.json');
      writeCoverageSummary(coverageFile, ['src/a.js']);

      const config = {
        ...defaults,
        freshness: { requireToday: false },
        coverageSummaryPaths: [],
      };

      const coverage = loadCoverage(config, true, coverageFile, [
        'src/a.js',
        'src/b.js',
        'src/c.js',
        'src/d.js',
      ]);

      assert.equal(coverage.file, coverageFile);
    });
  });

  it('respects completeness.enabled=false to opt out entirely', () => {
    withTempDir((dir) => {
      const coverageFile = join(dir, 'coverage-summary.json');
      writeCoverageSummary(coverageFile, ['src/a.js']);

      const config = {
        ...defaults,
        freshness: { requireToday: false },
        coverageSummaryPaths: [coverageFile],
        completeness: { enabled: false },
      };

      const coverage = loadCoverage(config, true, null, [
        'src/a.js',
        'src/b.js',
        'src/c.js',
        'src/d.js',
      ]);

      assert.equal(coverage.file, coverageFile);
    });
  });

  it('findReusableArtifacts refuses to reuse a partial coverage/test-run pair', () => {
    withTempDir((dir) => {
      const resultsFile = join(dir, 'test-results.json');
      const coverageFile = join(dir, 'coverage-summary.json');

      writeFileSync(
        resultsFile,
        JSON.stringify({
          total: 1,
          passed: 1,
          failed: 0,
          testFilePaths: [join(dir, 'src', 'a.test.js')],
        }),
      );
      writeCoverageSummary(coverageFile, ['src/a.js']);

      const config = {
        ...defaults,
        freshness: { requireToday: false },
        testResultsPaths: [resultsFile],
        coverageSummaryPaths: [coverageFile],
        testRunner: { ...defaults.testRunner, enabled: false },
      };

      const reusable = findReusableArtifacts(config, Date.now(), {
        expectedCoverageFiles: ['src/a.js', 'src/b.js', 'src/c.js', 'src/d.js'],
        expectedTestFiles: [
          join(dir, 'src', 'a.test.js'),
          join(dir, 'src', 'b.test.js'),
        ],
      });

      assert.equal(reusable, null);
    });
  });

  it('findReusableArtifacts reuses a pair that covers all expected files', () => {
    withTempDir((dir) => {
      const resultsFile = join(dir, 'test-results.json');
      const coverageFile = join(dir, 'coverage-summary.json');

      writeFileSync(
        resultsFile,
        JSON.stringify({
          total: 2,
          passed: 2,
          failed: 0,
          testFilePaths: [
            join(dir, 'src', 'a.test.js'),
            join(dir, 'src', 'b.test.js'),
          ],
        }),
      );
      writeCoverageSummary(coverageFile, ['src/a.js', 'src/b.js']);

      const config = {
        ...defaults,
        freshness: { requireToday: false },
        testResultsPaths: [resultsFile],
        coverageSummaryPaths: [coverageFile],
        testRunner: { ...defaults.testRunner, enabled: false },
      };

      const reusable = findReusableArtifacts(config, Date.now(), {
        expectedCoverageFiles: ['src/a.js', 'src/b.js'],
        expectedTestFiles: [
          join(dir, 'src', 'a.test.js'),
          join(dir, 'src', 'b.test.js'),
        ],
      });

      assert.ok(reusable);
      assert.equal(reusable.resultsFile, resultsFile);
      assert.equal(reusable.coverageFile, coverageFile);
    });
  });
});
