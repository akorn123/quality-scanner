const {
    assertFresh,
    firstExisting,
    parseJsonFile,
  } = require('./coverage.cjs');
 
  const round = (value) =>
    value == null ||
    Number.isNaN(
      Number(value),
    )
      ? null
      : Math.round(
          Number(value) * 100,
        ) / 100;
  
  const avg = (values) => {
    const valid =
      values.filter(
        (value) =>
          typeof value ===
            'number' &&
          !Number.isNaN(value),
      );
  
    if (!valid.length) {
      return null;
    }
  
    return round(
      valid.reduce(
        (sum, value) =>
          sum + value,
        0,
      ) / valid.length,
    );
  };
  
  const weighted = (items) => {
    const valid =
      items.filter(
        (item) =>
          typeof item.value ===
            'number' &&
          !Number.isNaN(
            item.value,
          ),
      );
  
    const totalWeight =
      valid.reduce(
        (sum, item) =>
          sum + item.weight,
        0,
      );
  
    if (!totalWeight) {
      return null;
    }
  
    return round(
      valid.reduce(
        (sum, item) =>
          sum +
          item.value *
            item.weight,
  
        0,
      ) / totalWeight,
    );
  };
  
  const averageScore = (
    results,
  ) =>
    results.length
      ? round(
          results.reduce(
            (sum, result) =>
              sum +
              result.score,
  
            0,
          ) / results.length,
        )
      : null;

  const computePassRate = ({
    passed = 0,
    failed = 0,
  } = {}) => {
    const executed =
      (passed ?? 0) + (failed ?? 0);

    if (!executed) {
      return null;
    }

    return round(
      ((passed ?? 0) / executed) * 100,
    );
  };
  
  const getAdjustedMetric = (
    metric,
    approvedExcluded = 0,
  ) => {
    const total =
      metric?.total ?? 0;
  
    const covered =
      metric?.covered ?? 0;
  
    const skipped =
      metric?.skipped ?? 0;
  
    const excluded =
      Math.min(
        total,
  
        Math.max(
          0,
          skipped +
            approvedExcluded,
        ),
      );
  
    const adjustedTotal =
      Math.max(
        0,
        total - excluded,
      );
  
    return {
      total,
      covered,
      skipped,
      approvedExcluded,
      excluded,
      adjustedTotal,
  
      rawPercent:
        round(metric?.pct),
  
      adjustedPercent:
        adjustedTotal === 0
          ? 100
          : round(
              (covered /
                adjustedTotal) *
                100,
            ),
    };
  };
  
  const getCoverageSummary = (
    coverageSummary,
    artifacts,
  ) => {
    if (!coverageSummary?.total) {
      return {
        score: null,
        rawAverage: null,
        adjustedAverage: null,
      };
    }
  
    const total =
      coverageSummary.total;

    /*
     * HTML e-markers are not Istanbul branch units. Cap approved
     * exclusions to uncovered Istanbul branches so adjusted % cannot
     * invent coverage beyond what Istanbul reported uncovered.
     */
    const uncoveredBranches = Math.max(
      0,
      (total.branches?.total ?? 0) -
        (total.branches?.covered ?? 0),
    );

    const cappedApprovedExcluded = Math.min(
      artifacts?.approvedExcluded ?? 0,
      uncoveredBranches,
    );
  
    const statements =
      getAdjustedMetric(
        total.statements,
      );
  
    const branches =
      getAdjustedMetric(
        total.branches,
        cappedApprovedExcluded,
      );
  
    const functions =
      getAdjustedMetric(
        total.functions,
      );
  
    const lines =
      getAdjustedMetric(
        total.lines,
      );
  
    const raw = {
      statements:
        statements.rawPercent,
  
      branches:
        branches.rawPercent,
  
      functions:
        functions.rawPercent,
  
      lines:
        lines.rawPercent,
    };
  
    const adjusted = {
      statements:
        statements.adjustedPercent,
  
      branches:
        branches.adjustedPercent,
  
      functions:
        functions.adjustedPercent,
  
      lines:
        lines.adjustedPercent,
    };
  
    return {
      score:
        avg(
          Object.values(
            adjusted,
          ),
        ),
  
      rawAverage:
        avg(
          Object.values(
            raw,
          ),
        ),
  
      adjustedAverage:
        avg(
          Object.values(
            adjusted,
          ),
        ),
  
      raw,
      adjusted,
  
      counts: {
        statements,
        branches,
        functions,
        lines,
      },
  
      exclusions: {
        approvedBranchArtifacts:
          artifacts.approvedExcluded,

        approvedBranchesApplied:
          cappedApprovedExcluded,
  
        fixableBranchCandidates:
          artifacts.fixableCandidates,
  
        unclassifiedBranchMarkers:
          artifacts.unclassified,
  
        eMarkers:
          artifacts.eMarkers,

        adjustmentNote:
          'Approved HTML branch markers are capped to Istanbul uncovered branch counts before adjusting coverage.',
      },
    };
  };
  
  const loadTestResults = (
    config,
    required = true,
  ) => {
    const file =
      firstExisting(
        config.testResultsPaths,
      );
  
    if (!file) {
      if (required) {
        throw new Error(
          'Normalized test results were not found. Run the quality scanner test collection first.',
        );
      }
  
      return {
        file: null,
        runner: null,
        total: null,
        passed: null,
        failed: null,
        skipped: null,
        todo: null,
        passRate: null,
      };
    }
  
    if (required) {
      assertFresh(
        file,
        'Test results',
        config,
      );
    }
  
    const report =
      parseJsonFile(
        file,
        'test results',
      );
  
    const total =
      report.total ?? null;
  
    const passed =
      report.passed ?? null;
  
    const failed =
      report.failed ?? null;
  
    const skipped =
      report.skipped ?? 0;
  
    const todo =
      report.todo ?? 0;
  
    return {
      file,
  
      runner:
        report.runner ?? null,
  
      total,
      passed,
      failed,
      skipped,
      todo,
  
      passRate: computePassRate({
        passed,
        failed,
        skipped,
        todo,
      }),
    };
  };

  const evaluateQualityGate = ({
    quality,
    concern = 'all',
    thresholds,
  }) => {
    const selectedFailures = [];

    const scoreFails = (score, threshold) =>
      score == null || score < threshold;

    if (
      (concern === 'all' ||
        concern === 'behavior') &&
      (quality.behavior.fatal ||
        quality.behavior.errors ||
        scoreFails(
          quality.behavior.score,
          thresholds.behavior,
        ))
    ) {
      selectedFailures.push('behavior');
    }

    if (
      (concern === 'all' ||
        concern === 'testability') &&
      (quality.testability.fatal ||
        quality.testability.errors ||
        scoreFails(
          quality.testability.score,
          thresholds.testability,
        ))
    ) {
      selectedFailures.push('testability');
    }

    if (
      (concern === 'all' ||
        concern === 'coverage') &&
      (quality.coverage.adjusted
        ?.branches ?? 100) <
        thresholds.adjustedBranches
    ) {
      selectedFailures.push('coverage');
    }

    if (
      (concern === 'all' ||
        concern === 'security') &&
      (quality.security.fatal > 0 ||
        quality.security.errors > 0 ||
        scoreFails(
          quality.security.score,
          thresholds.security,
        ))
    ) {
      selectedFailures.push('security');
    }

    if (
      concern === 'all' &&
      scoreFails(
        quality.overallScore,
        thresholds.overall,
      )
    ) {
      selectedFailures.push('overall');
    }

    if (
      concern === 'all' &&
      (quality.tests.failed ?? 0) > 0
    ) {
      selectedFailures.push('tests');
    }

    return {
      failed: selectedFailures.length > 0,
      failures: selectedFailures,
      exitCode: selectedFailures.length ? 1 : 0,
    };
  };
  
  const getHealthLabel = (
    score,
  ) => {
    if (score == null) {
      return 'Unknown';
    }
  
    if (score >= 95) {
      return 'Excellent';
    }
  
    if (score >= 90) {
      return 'Strong';
    }
  
    if (score >= 80) {
      return 'Healthy';
    }
  
    if (score >= 70) {
      return 'Needs Review';
    }
  
    return 'At Risk';
  };
  
  const summarizeFindings = (
    results,
  ) => {
    const findings =
      results.flatMap(
        (result) =>
          result.findings,
      );
  
    return {
      score:
        averageScore(results),
  
      findings:
        findings.length,
  
      suppressed:
        results.reduce(
          (sum, result) =>
            sum +
            (result
              .suppressedFindings
              ?.length ?? 0),
  
          0,
        ),
  
      fatal:
        findings.filter(
          (finding) =>
            finding.severity ===
            'fatal',
        ).length,
  
      errors:
        findings.filter(
          (finding) =>
            finding.severity ===
            'error',
        ).length,
  
      warnings:
        findings.filter(
          (finding) =>
            finding.severity ===
            'warning',
        ).length,
    };
  };
  
  const getReleaseConfidence = ({
    overallScore,
    coverage,
    behavior,
    security,
    tests,
    config,
  }) => {
    const checks = [];
  
    if (
      (tests.failed ?? 0) > 0
    ) {
      checks.push({
        id: 'failing-tests',
        level: 'blocked',
        concern: 'tests',
  
        message:
          `${tests.failed} test(s) are failing.`,
      });
    }
  
    if (
      behavior.fatal > 0
    ) {
      checks.push({
        id:
          'fatal-behavior-findings',
  
        level: 'blocked',
        concern: 'behavior',
  
        severities: [
          'fatal',
        ],
  
        message:
          `${behavior.fatal} fatal behavior finding(s).`,
      });
    }
  
    if (
      behavior.errors > 0
    ) {
      checks.push({
        id:
          'behavior-errors',
  
        level: 'review',
        concern: 'behavior',
  
        severities: [
          'error',
        ],
  
        message:
          `${behavior.errors} behavior error finding(s).`,
      });
    }
  
    if (
      security.fatal > 0
    ) {
      checks.push({
        id:
          'fatal-security-findings',
  
        level: 'blocked',
        concern: 'security',
  
        severities: [
          'fatal',
        ],
  
        message:
          `${security.fatal} fatal security finding(s).`,
      });
    }
  
    if (
      security.errors > 0
    ) {
      checks.push({
        id:
          'security-errors',
  
        level: 'blocked',
        concern: 'security',
  
        severities: [
          'error',
        ],
  
        message:
          `${security.errors} security error finding(s).`,
      });
    }
  
    if (
      security.warnings > 0
    ) {
      checks.push({
        id:
          'security-warnings',
  
        level: 'review',
        concern: 'security',
  
        severities: [
          'warning',
        ],
  
        message:
          `${security.warnings} security warning finding(s).`,
      });
    }
  
    if (
      (tests.skipped ?? 0) > 0
    ) {
      checks.push({
        id: 'skipped-tests',
        level: 'review',
        concern: 'tests',
  
        message:
          `${tests.skipped} test(s) are skipped.`,
      });
    }
  
    if (
      (coverage.adjusted
        ?.branches ?? 100) <
      config.thresholds
        .adjustedBranches
    ) {
      checks.push({
        id:
          'branch-coverage',
  
        level: 'review',
        concern: 'coverage',
  
        message:
          `Adjusted branch coverage is ${coverage.adjusted.branches}%.`,
      });
    }
  
    if (
      (overallScore ?? 100) <
      config.thresholds.overall
    ) {
      checks.push({
        id:
          'overall-quality',
  
        level: 'moderate',
        concern: 'quality',
  
        message:
          `Overall quality score is ${overallScore}.`,
      });
    }
  
    if (
      coverage.exclusions
        ?.unclassifiedBranchMarkers >
      0
    ) {
      checks.push({
        id:
          'unclassified-branches',
  
        level: 'review',
        concern: 'coverage',
  
        message:
          `${coverage.exclusions.unclassifiedBranchMarkers} uncovered branch marker(s) remain unclassified.`,
      });
    }
  
    const order = [
      'blocked',
      'review',
      'moderate',
    ];
  
    const highest =
      order.find(
        (level) =>
          checks.some(
            (check) =>
              check.level ===
              level,
          ),
      );
  
    const confidence =
      highest === 'blocked'
        ? 'Blocked'
        : highest === 'review'
          ? 'Needs Review'
          : highest ===
              'moderate'
            ? 'Moderate'
            : overallScore == null
              ? 'Unknown'
              : 'High';
  
    return {
      confidence,
      checks,
    };
  };
  
  const buildQuality = ({
    scans,
    coverageSummary,
    artifacts,
    config,
    requireTests = true,
  }) => {
    const behavior =
      summarizeFindings(
        scans.behavior,
      );
  
    const testability =
      summarizeFindings(
        scans.testability,
      );
  
    const security =
      summarizeFindings(
        scans.security,
      );
  
    const coverage =
      getCoverageSummary(
        coverageSummary,
        artifacts,
      );
  
    const tests =
      loadTestResults(
        config,
        requireTests,
      );
  
    const overallScore =
      weighted([
        {
          value:
            coverage.score,
  
          weight:
            config.weights
              .coverage,
        },
        {
          value:
            tests.passRate,
  
          weight:
            config.weights
              .testPassRate,
        },
        {
          value:
            testability.score,
  
          weight:
            config.weights
              .testability,
        },
        {
          value:
            behavior.score,
  
          weight:
            config.weights
              .behavior,
        },
        {
          value:
            security.score,

          weight:
            config.weights
              .security ?? 0,
        },
      ]);
  
    const release =
      getReleaseConfidence({
        overallScore,
        coverage,
        behavior,
        security,
        tests,
        config,
      });
  
    return {
      overallScore,
  
      healthLabel:
        getHealthLabel(
          overallScore,
        ),
  
      releaseConfidence:
        release.confidence,
  
      releaseChecks:
        release.checks,
  
      weights:
        config.weights,
  
      behavior,
      testability,
      security,
      coverage,
      tests,
    };
  };
  
  module.exports = {
    averageScore,
    buildQuality,
    computePassRate,
    evaluateQualityGate,
    getAdjustedMetric,
    loadTestResults,
  };
  