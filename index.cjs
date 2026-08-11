#!/usr/bin/env node

const { relative } = require('node:path');

const { loadConfig } = require('./lib/config.cjs');

const {
  resolveFiles,
  isTestFile,
} = require('./lib/files.cjs');

const {
  loadCoverage,
} = require('./lib/coverage.cjs');

const {
  resolveTargetTests,
} = require('./lib/test-resolver.cjs');

const {
  getRules,
  scanProject,
} = require('./lib/scanner.cjs');

const {
  analyzeCoverageArtifacts,
} = require('./lib/artifacts.cjs');

const {
  buildQuality,
} = require('./lib/quality.cjs');

const {
  writeReports,
} = require('./lib/reports.cjs');

const {
  runProjectTests,
} = require('./lib/test-runner.cjs');

const {
  launchReport,
} = require('./lib/report-server.cjs');

const getArg = (name) => {
  const index = process.argv.indexOf(name);

  return index >= 0
    ? process.argv[index + 1]
    : null;
};

const has = (name) =>
  process.argv.includes(name);

const printRules = (rules) => {
  console.log('Behavior rules');

  for (const rule of rules.behavior) {
    console.log(
      `  ${rule.id} [${rule.severity}] ${rule.category}`,
    );
  }

  console.log('\nTestability rules');

  for (const rule of rules.testability) {
    console.log(
      `  ${rule.id} [${rule.severity}] ${rule.category}`,
    );
  }

  console.log('\nSecurity checks');

  for (const rule of rules.security) {
    console.log(
      `  ${rule.id} ${rule.category}`,
    );
  }
};

const main = async () => {
  const {
    config,
    configFile,
  } = loadConfig(
    getArg('--config'),
  );

  const concern =
    getArg('--concern') ?? 'all';

  const rules =
    getRules(config);

  if (has('--list-rules')) {
    printRules(rules);
    return 0;
  }

  const testRun =
    await runProjectTests({
      config,
      concern,
      reuseArtifacts:
        has('--reuse-artifacts'),
    });

  const files =
    resolveFiles(config);

  const sourceFiles =
    files.filter(
      (file) =>
        !isTestFile(
          file,
          config,
        ),
    );

  const {
    testFiles,
    targetToTests,
  } = resolveTargetTests(
    files,
    config,
  );

  const coverageRequired =
    concern === 'all' ||
    concern === 'testability' ||
    concern === 'coverage';

  const coverage =
    loadCoverage(
      config,
      coverageRequired,
    );

  const scans =
    scanProject({
      files:
        sourceFiles.concat(
          testFiles,
        ),

      targetToTests,

      coverageByFile:
        coverage.byFile,

      config,
    });

  const artifacts =
    analyzeCoverageArtifacts(
      scans.testability,
      config,
    );

  const quality =
    buildQuality({
      scans,

      coverageSummary:
        coverage.summary,

      artifacts,
      config,

      requireTests:
        concern === 'all',
    });

  const paths =
    writeReports({
      scans,
      artifacts,
      quality,
      config,
      testFiles,
    });

  const reportServer =
    has('--no-open')
      ? null
      : await launchReport(config);

  console.log('');
  console.log('Quality Scanner');
  console.log('---------------');

  console.log(
    `Config:               ${
      configFile
        ? relative(
            process.cwd(),
            configFile,
          )
        : 'defaults'
    }`,
  );

  console.log(
    `Test runner:          ${
      quality.tests.runner ??
      testRun.runner ??
      'N/A'
    }`,
  );

  console.log(
    `Behavior score:       ${quality.behavior.score}`,
  );

  console.log(
    `Testability score:    ${quality.testability.score}`,
  );

  console.log(
    `Security score:       ${quality.security.score}`,
  );

  console.log(
    `Raw coverage:         ${quality.coverage.rawAverage ?? 'N/A'}%`,
  );

  console.log(
    `Adjusted coverage:    ${quality.coverage.adjustedAverage ?? 'N/A'}%`,
  );

  console.log(
    `Test pass rate:       ${quality.tests.passRate ?? 'N/A'}%`,
  );

  console.log(
    `Overall quality:      ${quality.overallScore ?? 'N/A'}`,
  );

  console.log(
    `Release confidence:   ${quality.releaseConfidence}`,
  );

  console.log(
    `Approved exclusions:  ${artifacts.approvedExcluded}`,
  );

  console.log(
    `Fixable candidates:   ${artifacts.fixableCandidates}`,
  );

  console.log(
    `Unclassified markers: ${artifacts.unclassified}`,
  );

  console.log('');

  console.log(
    `Dashboard file: ${relative(
      process.cwd(),
      paths.html,
    )}`,
  );

  if (reportServer) {
    console.log(
      `Dashboard URL:  ${reportServer.url}`,
    );
  }

  if (has('--no-fail')) {
    return 0;
  }

  const selectedFailures = [];

  if (
    (
      concern === 'all' ||
      concern === 'behavior'
    ) &&
    (
      quality.behavior.fatal ||
      quality.behavior.errors ||
      quality.behavior.score <
        config.thresholds.behavior
    )
  ) {
    selectedFailures.push(
      'behavior',
    );
  }

  if (
    (
      concern === 'all' ||
      concern === 'testability'
    ) &&
    quality.testability.score <
      config.thresholds.testability
  ) {
    selectedFailures.push(
      'testability',
    );
  }

  if (
    (
      concern === 'all' ||
      concern === 'coverage'
    ) &&
    (
      quality.coverage.adjusted
        ?.branches ?? 100
    ) <
      config.thresholds.adjustedBranches
  ) {
    selectedFailures.push(
      'coverage',
    );
  }

  if (
    (
      concern === 'all' ||
      concern === 'security'
    ) &&
    (
      quality.security.fatal > 0 ||
      quality.security.errors > 0 ||
      quality.security.score <
        config.thresholds.security
    )
  ) {
    selectedFailures.push(
      'security',
    );
  }

  if (
    concern === 'all' &&
    (
      quality.tests.failed ?? 0
    ) > 0
  ) {
    selectedFailures.push(
      'tests',
    );
  }

  return selectedFailures.length
    ? 1
    : 0;
};

main()
  .then((exitCode) => {
    process.exitCode = exitCode;
  })
  .catch((error) => {
    console.error(
      '\nQuality scanner failed\n----------------------',
    );

    let current = error;

    while (current) {
      console.error(
        current.message ?? String(current),
      );

      current = current.cause;
    }

    process.exitCode = 1;
  });
