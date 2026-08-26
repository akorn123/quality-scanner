const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const {
  buildFileScores,
  formatCiReadout,
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
      scoreBar(50, 'Example', {
        width: 10,
        color: true,
      }),
      '\x1b[33m█████░░░░░\x1b[0m      50%  Example',
    );
  });

  it('colors bars using CI quality thresholds', () => {
    assert.match(
      scoreBar(80, 'Green', { width: 4, color: true }),
      /^\x1b\[32m/,
    );
    assert.match(
      scoreBar(79.99, 'Yellow', { width: 4, color: true }),
      /^\x1b\[33m/,
    );
    assert.match(
      scoreBar(50, 'Yellow', { width: 4, color: true }),
      /^\x1b\[33m/,
    );
    assert.match(
      scoreBar(49.99, 'Red', { width: 4, color: true }),
      /^\x1b\[31m/,
    );
    assert.match(
      scoreBar(null, 'Unknown', { width: 4, color: true }),
      /^\x1b\[90m/,
    );
  });

  it('colors the GitLab status and release confidence independently', () => {
    assert.equal(
      formatCiReadout({
        passed: true,
        releaseConfidence: 'Needs Review',
        color: true,
      }),
      'GitLab CI readout: \x1b[32mPASS\x1b[0m releaseConfidence=\x1b[33mNeeds Review\x1b[0m',
    );
    assert.equal(
      formatCiReadout({
        passed: false,
        releaseConfidence: 'Blocked',
        color: true,
      }),
      'GitLab CI readout: \x1b[31mFAIL\x1b[0m releaseConfidence=\x1b[31mBlocked\x1b[0m',
    );
  });

  it('colors summary status values and release checks', () => {
    const output = formatCiSummary({
      scans: {
        behavior: [],
        testability: [],
        security: [],
      },
      quality: {
        overallScore: 90,
        healthLabel: 'Strong',
        releaseConfidence: 'Needs Review',
        releaseChecks: [
          {
            level: 'review',
            message: 'Review this result.',
          },
        ],
        behavior: {
          score: 90,
          findings: 1,
          errors: 1,
        },
        testability: {
          score: 90,
          findings: 1,
          warnings: 1,
        },
        security: { score: 100, findings: 0 },
        coverage: {
          rawAverage: 90,
          adjustedAverage: 90,
          adjusted: {},
        },
        tests: {
          passRate: 50,
          passed: 1,
          failed: 1,
          total: 2,
        },
      },
      artifacts: {
        approvedExcluded: 0,
        fixableCandidates: 1,
        unclassified: 1,
      },
      width: 4,
      color: true,
    });

    assert.match(
      output,
      /Release confidence: \x1b\[33mNeeds Review\x1b\[0m/,
    );
    assert.match(
      output,
      /Health:\s+\x1b\[32mStrong\x1b\[0m/,
    );
    assert.match(
      output,
      /Tests:\s+\x1b\[31m1 passed \/ 2 total\x1b\[0m/,
    );
    assert.match(
      output,
      /Findings:\s+behavior \x1b\[31m1\x1b\[0m · testability \x1b\[33m1\x1b\[0m · security \x1b\[32m0\x1b\[0m/,
    );
    assert.match(
      output,
      /\x1b\[33m\[REVIEW\] Review this result\.\x1b\[0m/,
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
      color: false,
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
