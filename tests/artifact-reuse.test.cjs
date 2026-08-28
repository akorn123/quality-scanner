const assert = require('node:assert/strict');
const { after, describe, it } = require('node:test');
const {
  mkdtempSync,
  mkdirSync,
  rmSync,
  utimesSync,
  writeFileSync,
} = require('node:fs');
const { tmpdir } = require('node:os');
const { dirname, join } = require('node:path');

const defaults = require('../config.cjs');
const {
  isFreshArtifact,
  loadCoverage,
} = require('../lib/coverage.cjs');
const { loadTestResults } = require('../lib/quality.cjs');
const {
  findReusableArtifacts,
  runProjectTests,
} = require('../lib/test-runner.cjs');

describe('automatic test and coverage artifact reuse', () => {
  const tempRoot = mkdtempSync(
    join(tmpdir(), 'quality-scanner-reuse-'),
  );

  after(() => {
    rmSync(tempRoot, { recursive: true, force: true });
  });

  const writeArtifact = (file, modifiedAt) => {
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, '{}', 'utf8');
    utimesSync(file, modifiedAt, modifiedAt);
  };

  const configFor = (resultsPaths, coveragePaths, enabled = true) => ({
    ...defaults,
    freshness: { maxAgeHours: 24 },
    testResultsPaths: resultsPaths,
    coverageSummaryPaths: coveragePaths,
    testRunner: {
      ...defaults.testRunner,
      enabled,
    },
  });

  it('finds a valid artifact pair from configured discovery paths', () => {
    const now = Date.now();
    const staleResults = join(tempRoot, 'stale', 'test-results.json');
    const freshResults = join(tempRoot, 'fresh', 'vitest-results.json');
    const freshCoverage = join(tempRoot, 'fresh', 'coverage-final.json');

    writeArtifact(staleResults, new Date(now - 25 * 60 * 60 * 1000));
    writeArtifact(freshResults, new Date(now - 2 * 60 * 60 * 1000));
    writeArtifact(freshCoverage, new Date(now - 3 * 60 * 60 * 1000));

    const config = configFor(
      [staleResults, freshResults],
      [freshCoverage],
    );
    const reusable = findReusableArtifacts(config, now);

    assert.equal(reusable.resultsFile, freshResults);
    assert.equal(reusable.coverageFile, freshCoverage);
    assert.equal(loadTestResults(config, false).file, freshResults);
    assert.equal(loadCoverage(config, false).file, freshCoverage);
  });

  it('uses a rolling 24-hour window instead of the calendar day', () => {
    const now = new Date('2026-08-28T01:00:00.000Z').getTime();
    const file = join(tempRoot, 'rolling-window.json');

    writeArtifact(file, new Date(now - 23 * 60 * 60 * 1000));
    assert.equal(
      isFreshArtifact(file, { freshness: { maxAgeHours: 24 } }, now),
      true,
    );

    writeArtifact(file, new Date(now - 25 * 60 * 60 * 1000));
    assert.equal(
      isFreshArtifact(file, { freshness: { maxAgeHours: 24 } }, now),
      false,
    );
  });

  it('reuses recent artifacts before considering test-runner execution', async () => {
    const now = new Date();
    const resultsFile = join(tempRoot, 'automatic', 'test-results.json');
    const coverageFile = join(tempRoot, 'automatic', 'coverage-summary.json');

    writeArtifact(resultsFile, now);
    writeArtifact(coverageFile, now);

    const result = await runProjectTests({
      config: configFor([resultsFile], [coverageFile], false),
      concern: 'all',
      ciMode: true,
    });

    assert.equal(result.ran, false);
    assert.equal(result.reused, true);
    assert.equal(result.paths.resultsFile, resultsFile);
    assert.equal(result.paths.coverageSummary, coverageFile);
  });

  it('does not reuse an incomplete or stale pair', () => {
    const now = Date.now();
    const resultsFile = join(tempRoot, 'incomplete', 'test-results.json');
    const staleCoverage = join(tempRoot, 'incomplete', 'coverage-summary.json');

    writeArtifact(resultsFile, new Date(now - 60 * 60 * 1000));
    writeArtifact(staleCoverage, new Date(now - 26 * 60 * 60 * 1000));

    assert.equal(
      findReusableArtifacts(
        configFor([resultsFile], [staleCoverage]),
        now,
      ),
      null,
    );
  });
});
