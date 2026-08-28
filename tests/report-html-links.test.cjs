const assert = require('node:assert/strict');
const { describe, it } = require('node:test');

const { renderHtml } = require('../lib/report-html.cjs');

const report = (kind, findings = []) => ({
  kind,
  summary: {
    totalFindings: findings.length,
    endpoints: 0,
    publicEndpoints: 0,
    protectedEndpoints: 0,
  },
  results: findings.length
    ? [
        {
          file: `${kind}.cjs`,
          findings,
        },
      ]
    : [],
});

const finding = (severity) => ({
  id: `${severity}-rule`,
  severity,
  line: 12,
  category: 'test',
  code: 'example()',
  description: `${severity} description`,
  suggestion: 'Fix it.',
  source: null,
});

const baseQuality = {
  overallScore: 80,
  healthLabel: 'Healthy',
  releaseConfidence: 'Blocked',
  behavior: { score: 80 },
  testability: { score: 90 },
  security: { score: 70 },
  coverage: {
    adjustedAverage: 75,
    rawAverage: 70,
    adjusted: {
      statements: 80,
      branches: 60,
      functions: 80,
      lines: 80,
    },
  },
  tests: {
    passRate: 90,
    total: 10,
    passed: 9,
  },
};

describe('HTML release confidence links', () => {
  it('links release checks to their detailed item or referenced section', () => {
    const quality = {
      ...baseQuality,
      releaseChecks: [
        {
          id: 'failing-tests',
          level: 'blocked',
          concern: 'tests',
          message: 'One test is failing.',
        },
        {
          id: 'behavior-errors',
          level: 'review',
          concern: 'behavior',
          message: 'Review behavior errors.',
        },
        {
          id: 'branch-coverage',
          level: 'review',
          concern: 'coverage',
          message: 'Branch coverage is low.',
        },
        {
          id: 'unclassified-branches',
          level: 'review',
          concern: 'coverage',
          message: 'Branches need classification.',
        },
        {
          id: 'overall-quality',
          level: 'moderate',
          concern: 'quality',
          message: 'Overall quality is low.',
        },
      ],
    };

    const html = renderHtml({
      behavior: report('behavior', [finding('error')]),
      testability: report('testability'),
      security: report('security'),
      quality,
      artifacts: {
        eMarkers: 0,
        approvedExcluded: 0,
        fixableCandidates: 0,
        unclassified: 1,
      },
    });

    assert.match(
      html,
      /class="release-check release-check-link"\s+href="#release-check-failing-tests"/,
    );
    assert.match(
      html,
      /class="release-check release-check-link"\s+href="#behavior-findings"/,
    );
    assert.match(
      html,
      /class="release-check release-check-link"\s+href="#coverage"/,
    );
    assert.match(
      html,
      /class="release-check release-check-link"\s+href="#coverage-accountability"/,
    );
    assert.match(
      html,
      /class="release-check release-check-link"\s+href="#overall-quality"/,
    );
    assert.match(html, /id="overall-quality"/);
    assert.match(html, /id="test-pass-rate"/);
    assert.match(html, /<html lang="en" data-theme="dark">/);
    assert.match(html, /id="theme-toggle"/);
    assert.match(html, /fetch\('\/api\/preferences'/);
  });

  it('links blocking summaries to sections and findings to exact source cards', () => {
    const quality = {
      ...baseQuality,
      releaseChecks: [
        {
          id: 'failing-tests',
          level: 'blocked',
          concern: 'tests',
          message: 'One test is failing.',
        },
        {
          id: 'fatal-security-findings',
          level: 'blocked',
          concern: 'security',
          severities: ['fatal'],
          message: 'A fatal security finding exists.',
        },
      ],
    };

    const html = renderHtml({
      behavior: report('behavior'),
      testability: report('testability'),
      security: report('security', [finding('fatal')]),
      quality,
      artifacts: {
        eMarkers: 0,
        approvedExcluded: 0,
        fixableCandidates: 0,
        unclassified: 0,
      },
    });

    assert.match(
      html,
      /class="blocking-summary-note blocking-summary-link"\s+href="#test-pass-rate"/,
    );
    assert.match(
      html,
      /class="blocking-check-header blocking-check-header-link"\s+href="#security-findings"/,
    );
    assert.match(
      html,
      /class="blocking-finding"\s+href="#finding-security-1"/,
    );
  });

  it('sends the release confidence metric to all checks when none are blocked', () => {
    const html = renderHtml({
      behavior: report('behavior'),
      testability: report('testability'),
      security: report('security'),
      quality: {
        ...baseQuality,
        releaseConfidence: 'Needs Review',
        releaseChecks: [
          {
            id: 'branch-coverage',
            level: 'review',
            concern: 'coverage',
            message: 'Branch coverage is low.',
          },
        ],
      },
      artifacts: {
        eMarkers: 0,
        approvedExcluded: 0,
        fixableCandidates: 0,
        unclassified: 0,
      },
      preferences: { theme: 'light' },
    });

    assert.match(
      html,
      /class="metric-card metric-card-link"[\s\S]*?href="#release-confidence-checks"/,
    );
    assert.match(html, /<html lang="en" data-theme="light">/);
  });
});
