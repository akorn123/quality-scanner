const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const { loadCoverage } = require('../lib/coverage.cjs');
const { writeCiReport } = require('../lib/reports.cjs');
const {
  shouldRunTestCollection,
} = require('../index.cjs');

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

  it('loads coverage from an explicit coverage artifact target', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'quality-scanner-coverage-'));
    const artifactDir = path.join(tmpDir, 'coverage');
    fs.mkdirSync(artifactDir, { recursive: true });
    fs.writeFileSync(
      path.join(artifactDir, 'coverage-summary.json'),
      JSON.stringify({ total: { lines: { pct: 100 } } }),
    );

    const coverage = loadCoverage(
      { coverageSummaryPaths: [], freshness: { requireToday: false } },
      true,
      artifactDir,
    );

    assert.equal(coverage.file, path.join(artifactDir, 'coverage-summary.json'));
  });

  it('does not rerun tests when an explicit coverage target is supplied', () => {
    assert.equal(
      shouldRunTestCollection({
        coverageTarget: './coverage',
      }),
      false,
    );
    assert.equal(
      shouldRunTestCollection({
        coverageTarget: null,
      }),
      true,
    );
  });

  it('prints CI results from an existing coverage artifact without test collection', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'quality-scanner-existing-'));
    const sourceDir = path.join(tmpDir, 'src');
    const coverageDir = path.join(tmpDir, 'coverage');
    const reportsDir = path.join(tmpDir, 'reports');
    const sourceFile = path.join(sourceDir, 'example.js');
    const configFile = path.join(tmpDir, 'quality-scanner.config.cjs');
    fs.mkdirSync(sourceDir, { recursive: true });
    fs.mkdirSync(coverageDir, { recursive: true });
    fs.mkdirSync(reportsDir, { recursive: true });
    fs.writeFileSync(sourceFile, 'export const answer = 42;\n');
    fs.writeFileSync(
      configFile,
      `module.exports = {
  scanRoots: ['src'],
  reportDir: 'reports/quality-scanner',
  freshness: { requireToday: false },
};\n`,
    );
    fs.writeFileSync(
      path.join(coverageDir, 'coverage-final.json'),
      JSON.stringify({
        [sourceFile]: {
          statementMap: {
            0: { start: { line: 1 }, end: { line: 1 } },
          },
          s: { 0: 1 },
          fnMap: {},
          f: {},
          branchMap: {},
          b: {},
        },
      }),
    );
    fs.writeFileSync(
      path.join(reportsDir, 'vitest-results.json'),
      JSON.stringify({
        numTotalTests: 4,
        numPassedTests: 4,
        numFailedTests: 0,
        numPendingTests: 0,
        numTodoTests: 0,
        success: true,
      }),
    );

    const result = spawnSync(
      process.execPath,
      [
        path.resolve(__dirname, '..', 'index.cjs'),
        '-ci',
        './quality-report',
        '-coverage-target=./coverage',
        '--config',
        configFile,
      ],
      {
        cwd: tmpDir,
        encoding: 'utf8',
        env: {
          ...process.env,
          CI: 'true',
        },
      },
    );

    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /Quality Scanner CI Results/);
    assert.match(
      result.stdout,
      /Artifact:\s+coverage[\\/]coverage-final\.json/,
    );
    assert.match(result.stdout, /Test runner:\s+vitest/);
    assert.match(
      result.stdout,
      /Test artifact:\s+reports[\\/]vitest-results\.json/,
    );
    assert.match(result.stdout, /Tests:\s+4 passed \/ 4 total/);
    assert.doesNotMatch(result.stdout, /Running Vitest/);
    assert.doesNotMatch(result.stdout, /Quality test collection/);
    assert.ok(
      fs.existsSync(
        path.join(
          tmpDir,
          'quality-report',
          'quality-scanner-report.json',
        ),
      ),
    );
  });

  it('loads and summarizes a Vitest coverage-final artifact', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'quality-scanner-final-'));
    const artifactDir = path.join(tmpDir, 'coverage');
    const sourceFile = path.join(tmpDir, 'src', 'example.js');
    fs.mkdirSync(artifactDir, { recursive: true });
    fs.writeFileSync(
      path.join(artifactDir, 'coverage-final.json'),
      JSON.stringify({
        [sourceFile]: {
          statementMap: {
            0: { start: { line: 1 }, end: { line: 1 } },
            1: { start: { line: 2 }, end: { line: 2 } },
          },
          s: { 0: 1, 1: 0 },
          fnMap: {
            0: { loc: { start: { line: 1 }, end: { line: 2 } } },
          },
          f: { 0: 1 },
          branchMap: {
            0: {
              locations: [
                { start: { line: 1 }, end: { line: 1 } },
                { start: { line: 1 }, end: { line: 1 } },
              ],
            },
          },
          b: { 0: [1, 0] },
        },
      }),
    );

    const coverage = loadCoverage(
      { coverageSummaryPaths: [], freshness: { requireToday: false } },
      true,
      artifactDir,
    );

    assert.equal(
      coverage.file,
      path.join(artifactDir, 'coverage-final.json'),
    );
    assert.deepEqual(
      coverage.summary.total,
      {
        lines: { total: 2, covered: 1, skipped: 0, pct: 50 },
        statements: { total: 2, covered: 1, skipped: 0, pct: 50 },
        functions: { total: 1, covered: 1, skipped: 0, pct: 100 },
        branches: { total: 2, covered: 1, skipped: 0, pct: 50 },
      },
    );
    assert.equal(coverage.byFile.size, 1);
  });

  it('writes a CI-friendly dashboard JSON artifact', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'quality-scanner-ci-'));
    const outputDir = path.join(tmpDir, 'ci-output');

    const ciPath = writeCiReport({
      scans: {
        behavior: [],
        testability: [],
        security: [],
      },
      artifacts: {
        source: null,
        eMarkers: 0,
        approvedExcluded: 0,
        fixableCandidates: 0,
        unclassified: 0,
        byFile: [],
      },
      quality: {
        overallScore: 100,
        behavior: { score: 100 },
        testability: { score: 100 },
        security: { score: 100 },
        releaseConfidence: 'High',
      },
      testFiles: [],
      outputDir,
    });

    assert.ok(fs.existsSync(ciPath));

    const report = JSON.parse(fs.readFileSync(ciPath, 'utf8'));
    assert.equal(report.quality.summary.overallScore, 100);
    assert.equal(report.behavior.kind, 'behavior');
    assert.equal(report.testability.kind, 'testability');
    assert.equal(report.security.kind, 'security');
  });
});
