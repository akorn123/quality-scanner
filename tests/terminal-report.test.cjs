const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const {
  buildFileScores,
  formatCiSummary,
  scoreBar,
} = require('../lib/terminal-report.cjs');

const scans = {
  behavior: [
    {
      relativeFile: 'src/healthy.cjs',
      score: 100,
    },
    {
      relativeFile: 'src/nested/risky.cjs',
      score: 60,
    },
  ],
  testability: [
    {
      relativeFile: 'src/healthy.cjs',
      score: 80,
    },
    {
      relativeFile: 'src/nested/risky.cjs',
      score: 40,
    },
  ],
  security: [
    {
      relativeFile: 'src/healthy.cjs',
      score: 90,
    },
  ],
};

describe('CI terminal report', () => {
  it('renders a fixed-width score bar', () => {
    assert.equal(
      scoreBar(50, 'Example', { width: 10 }),
      '█████░░░░░      50%  Example',
    );
  });

  it('combines the available concern scores for each file', () => {
    assert.deepEqual(
      buildFileScores(scans),
      [
        {
          file: 'src/healthy.cjs',
          concerns: {
            behavior: 100,
            testability: 80,
            security: 90,
          },
          score: 90,
        },
        {
          file: 'src/nested/risky.cjs',
          concerns: {
            behavior: 60,
            testability: 40,
          },
          score: 50,
        },
      ],
    );
  });

  it('includes dashboard scores and folder/file score bars', () => {
    const output = formatCiSummary({
      scans,
      quality: {
        overallScore: 87.5,
        healthLabel: 'Healthy',
        releaseConfidence: 'Needs Review',
        releaseChecks: [
          {
            level: 'review',
            message: 'Review this result.',
          },
        ],
        behavior: { score: 80, findings: 1 },
        testability: { score: 60, findings: 2 },
        security: { score: 90, findings: 0 },
        coverage: {
          rawAverage: 75,
          adjustedAverage: 80,
          adjusted: {
            statements: 80,
            branches: 70,
            functions: 90,
            lines: 80,
          },
        },
        tests: {
          runner: 'vitest',
          passRate: 100,
          passed: 4,
          total: 4,
        },
      },
      artifacts: {
        approvedExcluded: 1,
        fixableCandidates: 2,
        unclassified: 3,
      },
      coverageFile: 'coverage/coverage-summary.json',
      testResultsFile: 'reports/vitest-results.json',
      width: 10,
    });

    assert.match(output, /Quality Scanner CI Results/);
    assert.match(output, /87\.5%  Overall quality/);
    assert.match(output, /src\/ \(2 files\)/);
    assert.match(output, /healthy\.cjs \(B 100% · T 80% · S 90%\)/);
    assert.match(output, /nested\/ \(1 file\)/);
    assert.match(output, /risky\.cjs \(B 60% · T 40%\)/);
    assert.match(output, /Artifact:\s+coverage\/coverage-summary\.json/);
    assert.match(output, /Test runner:\s+vitest/);
    assert.match(output, /Test artifact:\s+reports\/vitest-results\.json/);
    assert.match(output, /\[REVIEW\] Review this result\./);
  });
});
