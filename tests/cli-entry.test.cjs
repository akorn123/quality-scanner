const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { loadCoverage } = require('../lib/coverage.cjs');
const { writeCiReport } = require('../lib/reports.cjs');

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
