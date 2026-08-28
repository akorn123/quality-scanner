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
  evaluateQualityGate,
} = require('./lib/quality.cjs');

const {
  writeCiReport,
  writeReports,
} = require('./lib/reports.cjs');

const {
  runProjectTests,
} = require('./lib/test-runner.cjs');

const {
  launchReport,
} = require('./lib/report-server.cjs');

const {
  formatCiReadout,
  formatCiSummary,
} = require('./lib/terminal-report.cjs');

const getArg = (name) => {
  const index = process.argv.indexOf(name);

  if (index >= 0) {
    return process.argv[index + 1] ?? null;
  }

  const assignment =
    process.argv.find((arg) =>
      arg.startsWith(`${name}=`),
    );

  if (!assignment) {
    return null;
  }

  return assignment.slice(name.length + 1);
};

const has = (name) =>
  process.argv.includes(name);

const getArgValue = (name, aliases = []) => {
  const names = [name, ...aliases];

  for (const option of names) {
    const value = getArg(option);
    if (value) {
      return value;
    }
  }

  return null;
};

const getCiOutputDir = () => {
  const ciArg =
    getArgValue('-ci', ['--ci']);

  const skipArgs = new Set([
    '--concern',
    '--config',
    '--no-fail',
    '--reuse-artifacts',
    '--force-tests',
    '--no-open',
    '--list-rules',
  ]);

  if (!ciArg || skipArgs.has(ciArg)) {
    return null;
  }

  return ciArg;
};

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

const emptyArtifacts = () => ({
  source: null,
  eMarkers: 0,
  approvedExcluded: 0,
  fixableCandidates: 0,
  unclassified: 0,
  byFile: [],
});

const shouldRunTestCollection = ({
  coverageTarget,
}) => !coverageTarget;

const main = async () => {
  const isCiMode =
    has('-ci') ||
    has('--ci');

  const ciOutputDir =
    getCiOutputDir();

  if (isCiMode && !ciOutputDir) {
    throw new Error(
      'CI mode requires an output directory, e.g. `quality-scanner -ci ./quality-scanner-report`.',
    );
  }

  const {
    config,
    configFile,
  } = loadConfig(
    getArg('--config'),
  );

  const concern =
    getArg('--concern') ?? 'all';

  const coverageTarget =
    getArgValue('-coverage-target', ['--coverage-target']);

  const rules =
    getRules(config);

  if (has('--list-rules')) {
    printRules(rules);
    return 0;
  }

  const testRun = shouldRunTestCollection({
    coverageTarget,
  })
    ? await runProjectTests({
        config,
        concern,
        reuseArtifacts:
          !has('--force-tests'),
        ciMode: isCiMode,
      })
    : {
        ran: false,
        runner: null,
        detected: [],
      };

  const files =
    resolveFiles(config);

  if (files.length === 0) {
    throw new Error(
      'No files matched the configured scanRoots. Check scanRoots and ignore settings.',
    );
  }

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
      coverageTarget,
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
      concern,
    });

  const artifacts =
    coverageRequired
      ? analyzeCoverageArtifacts(
          scans.testability,
          config,
        )
      : emptyArtifacts();

  const quality =
    buildQuality({
      scans,

      coverageSummary:
        coverage.summary,

      artifacts,
      config,

      requireTests:
        concern === 'all' &&
        !coverageTarget,
    });

  const paths =
    writeReports({
      scans,
      artifacts,
      quality,
      config,
      testFiles,
    });

  if (isCiMode) {
    const ciJson =
      writeCiReport({
        scans,
        artifacts,
        quality,
        testFiles,
        outputDir: ciOutputDir,
      });

    console.log('');
    console.log(
      formatCiSummary({
        scans,
        quality,
        artifacts,
        coverageFile:
          coverage.file
            ? relative(
                process.cwd(),
                coverage.file,
              )
            : null,
        testResultsFile:
          quality.tests.file
            ? relative(
                process.cwd(),
                quality.tests.file,
              )
            : null,
      }),
    );
    console.log('');
    console.log(
      `CI dashboard JSON: ${relative(
        process.cwd(),
        ciJson,
      )}`,
    );

    const ciPassed =
      quality.releaseConfidence !== 'Blocked';

    if (ciPassed) {
      console.log(
        formatCiReadout({
          passed: true,
          releaseConfidence:
            quality.releaseConfidence,
        }),
      );
      return 0;
    }

    console.error(
      formatCiReadout({
        passed: false,
        releaseConfidence:
          quality.releaseConfidence,
        detail:
          'because the release confidence was Blocked.',
      }),
    );

    return 1;
  }

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

  return evaluateQualityGate({
    quality,
    concern,
    thresholds: config.thresholds,
  }).exitCode;
};

if (require.main === module) {
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
}

module.exports = {
  main,
  shouldRunTestCollection,
};
