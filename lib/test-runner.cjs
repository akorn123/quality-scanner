const {
    existsSync,
    mkdirSync,
    readFileSync,
    rmSync,
    writeFileSync,
  } = require('node:fs');
  const { join, relative } = require('node:path');
  const { spawn, spawnSync } = require('node:child_process');
  
  const { createProgress } = require('./progress.cjs');
  
  const RUNNER_DEFINITIONS = [
    {
      id: 'vitest',
      packageName: 'vitest',
      coverage: 'native',
    },
    {
      id: 'jest',
      packageName: 'jest',
      coverage: 'native',
    },
    {
      id: 'playwright',
      packageName: '@playwright/test',
      coverage: 'external',
      reason:
        'Playwright has test reporters, but whole-project JavaScript source coverage requires project-specific instrumentation.',
    },
    {
      id: 'mocha',
      packageName: 'mocha',
      coverage: 'nyc',
    },
    {
      id: 'cypress',
      packageName: 'cypress',
      coverage: 'external',
      reason:
        'Cypress source coverage requires project-specific instrumentation such as @cypress/code-coverage.',
    },
    {
      id: 'tape',
      packageName: 'tape',
      coverage: 'external',
      reason:
        'Tape does not define a universal project-wide test discovery command; configure a custom quality test command for this project.',
    },
    {
      id: 'ava',
      packageName: 'ava',
      coverage: 'nyc-tap',
    },
    {
      id: 'tap',
      packageName: 'tap',
      coverage: 'external',
      reason:
        'tap coverage/reporting behavior varies significantly by major version; configure a custom quality test command for this runner.',
    },
  ];
  
  const ensureDir = (dir) => {
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
  };
  
  const readPackageJson = () => {
    const file = join(process.cwd(), 'package.json');
  
    if (!existsSync(file)) {
      throw new Error('package.json was not found in the project root.');
    }
  
    return JSON.parse(readFileSync(file, 'utf8'));
  };
  
  const getDeclaredPackages = (pkg) =>
    new Set([
      ...Object.keys(pkg.dependencies ?? {}),
      ...Object.keys(pkg.devDependencies ?? {}),
      ...Object.keys(pkg.optionalDependencies ?? {}),
      ...Object.keys(pkg.peerDependencies ?? {}),
    ]);
  
  const isResolvable = (packageName) => {
    try {
      require.resolve(packageName, {
        paths: [process.cwd()],
      });
  
      return true;
    } catch {
      return false;
    }
  };
  
  const isInstalled = (packageName, declaredPackages) =>
    declaredPackages.has(packageName) && isResolvable(packageName);
  
  const getLocalBin = (name) =>
    join(
      process.cwd(),
      'node_modules',
      '.bin',
      `${name}${process.platform === 'win32' ? '.cmd' : ''}`,
    );
  
  const getRunnerPriority = (config) => {
    const configured = config.testRunner?.priority ?? [];
  
    if (!configured.length) {
      return RUNNER_DEFINITIONS.map((runner) => runner.id);
    }
  
    const known = new Set(RUNNER_DEFINITIONS.map((runner) => runner.id));
  
    return [
      ...configured.filter((id) => known.has(id)),
      ...RUNNER_DEFINITIONS.map((runner) => runner.id).filter(
        (id) => !configured.includes(id),
      ),
    ];
  };
  
  const detectTestRunners = (config) => {
    const pkg = readPackageJson();
    const declaredPackages = getDeclaredPackages(pkg);
    const priority = getRunnerPriority(config);
  
    const definitions = new Map(
      RUNNER_DEFINITIONS.map((runner) => [runner.id, runner]),
    );
  
    return priority
      .map((id) => definitions.get(id))
      .filter(Boolean)
      .map((runner) => {
        const installed = isInstalled(runner.packageName, declaredPackages);
  
        const needsNyc =
          runner.coverage === 'nyc' || runner.coverage === 'nyc-tap';
  
        const nycInstalled = needsNyc
          ? isInstalled('nyc', declaredPackages)
          : false;
  
        const custom = config.testRunner?.adapters?.[runner.id];
  
        const customCommand =
          typeof custom?.command === 'string' && custom.command.trim()
            ? custom.command.trim()
            : null;
  
        let eligible = installed;
        let reason = null;
  
        if (installed && runner.coverage === 'external' && !customCommand) {
          eligible = false;
          reason = runner.reason;
        }
  
        if (installed && needsNyc && !nycInstalled) {
          eligible = false;
  
          reason =
            `${runner.packageName} is installed, ` +
            'but nyc is required to produce normalized Istanbul coverage artifacts.';
        }
  
        return {
          ...runner,
          installed,
          eligible,
          nycInstalled,
          customCommand,
          custom,
          reason,
        };
      });
  };
  
  const selectTestRunner = (config) => {
    const detected = detectTestRunners(config);
    const selected = detected.find((runner) => runner.eligible);
  
    return {
      selected,
      detected,
    };
  };
  
  const displayDetection = ({ selected, detected }) => {
    console.log('Detecting JavaScript test runner...');
    console.log('');
  
    for (const runner of detected) {
      if (!runner.installed) {
        console.log(`  - ${runner.packageName.padEnd(20)} not installed`);
        continue;
      }
  
      if (!runner.eligible) {
        console.log(
          `  ~ ${runner.packageName.padEnd(20)} installed, not eligible`,
        );
  
        console.log(`    ${runner.reason}`);
        continue;
      }
  
      console.log(
        `  ${
          runner.id === selected?.id ? '✓' : '•'
        } ${runner.packageName.padEnd(20)} installed`,
      );
    }
  
    console.log('');
  };
  
  const getPaths = (config) => ({
    resultsFile: join(process.cwd(), config.testRunner.resultsFile),
  
    rawResultsFile: join(process.cwd(), config.testRunner.rawResultsFile),
  
    tapResultsFile: join(process.cwd(), config.testRunner.tapResultsFile),
  
    coverageDir: join(process.cwd(), config.testRunner.coverageDir),
  
    coverageSummary: join(
      process.cwd(),
      config.testRunner.coverageDir,
      'coverage-summary.json',
    ),
  });
  
  const cleanOutput = (config) => {
    const paths = getPaths(config);
  
    rmSync(paths.coverageDir, {
      recursive: true,
      force: true,
    });
  
    rmSync(paths.resultsFile, {
      force: true,
    });
  
    rmSync(paths.rawResultsFile, {
      force: true,
    });
  
    rmSync(paths.tapResultsFile, {
      force: true,
    });
  
    ensureDir(join(process.cwd(), config.testRunner.outputDir));
    ensureDir(paths.coverageDir);
  };
  
  const runProcess = ({
    command,
    args,
    label = 'Running tests with coverage',
  }) =>
    new Promise((resolve, reject) => {
      const progress = createProgress({
        label,
      });
  
      let stdout = '';
      let stderr = '';
      let settled = false;
  
      const child = spawn(command, args, {
        cwd: process.cwd(),
        env: process.env,
        shell: false,
        stdio: ['inherit', 'pipe', 'pipe'],
      });
  
      progress.start(label);
  
      child.stdout?.on('data', (chunk) => {
        stdout += chunk.toString();
      });
  
      child.stderr?.on('data', (chunk) => {
        stderr += chunk.toString();
      });
  
      child.on('error', (error) => {
        if (settled) {
          return;
        }
  
        settled = true;
  
        progress.fail(`${label} could not start`);
  
        reject(
          new Error(`Unable to start ${command}.`, {
            cause: error,
          }),
        );
      });
  
      child.on('close', (status, signal) => {
        if (settled) {
          return;
        }
  
        settled = true;
  
        if (status === 0) {
          progress.succeed(`${label} complete`);
        } else {
          progress.fail(`${label} completed with test failures`);
        }
  
        resolve({
          status,
          signal,
          stdout,
          stderr,
        });
      });
    });
  
  const runShellCommand = (command) => {
    const result = spawnSync(command, {
      cwd: process.cwd(),
      env: process.env,
      shell: true,
      stdio: 'inherit',
    });
  
    if (result.error) {
      throw new Error(`Unable to run configured test command: ${command}`, {
        cause: result.error,
      });
    }
  
    return result;
  };
  
  const normalizeJestLikeResults = (raw, runner) => {
    const total = raw.numTotalTests ?? null;
    const passed = raw.numPassedTests ?? null;
    const failed = raw.numFailedTests ?? null;
    const skipped = raw.numPendingTests ?? 0;
    const todo = raw.numTodoTests ?? 0;
  
    return {
      schemaVersion: 1,
      runner,
      generatedAt: new Date().toISOString(),
  
      success: raw.success ?? (failed ?? 0) === 0,
  
      total,
      passed,
      failed,
      skipped,
      todo,
    };
  };
  
  const normalizeMochaResults = (raw) => {
    const stats = raw.stats ?? {};
  
    const total = stats.tests ?? null;
    const passed = stats.passes ?? null;
    const failed = stats.failures ?? null;
    const skipped = stats.pending ?? 0;
  
    return {
      schemaVersion: 1,
      runner: 'mocha',
      generatedAt: new Date().toISOString(),
  
      success: (failed ?? 0) === 0,
  
      total,
      passed,
      failed,
      skipped,
      todo: 0,
    };
  };
  
  const stripAnsi = (value) =>
    String(value).replace(/\u001b\[[0-9;]*m/g, '');
  
  const normalizeTapResults = (value, runner) => {
    const lines = stripAnsi(value).split(/\r?\n/);
  
    let passed = 0;
    let failed = 0;
    let skipped = 0;
    let todo = 0;
  
    for (const line of lines) {
      const match = line.match(
        /^\s*(not ok|ok)\b(?:\s+\d+)?(?:\s+-\s+)?(.*)$/i,
      );
  
      if (!match) {
        continue;
      }
  
      const status = match[1].toLowerCase();
      const rest = match[2] ?? '';
  
      if (/\b#\s*skip\b/i.test(rest)) {
        skipped += 1;
        continue;
      }
  
      if (/\b#\s*todo\b/i.test(rest)) {
        todo += 1;
        continue;
      }
  
      if (status === 'ok') {
        passed += 1;
      } else {
        failed += 1;
      }
    }
  
    const total = passed + failed + skipped + todo;
  
    return {
      schemaVersion: 1,
      runner,
      generatedAt: new Date().toISOString(),
  
      success: failed === 0,
  
      total,
      passed,
      failed,
      skipped,
      todo,
    };
  };
  
  const writeNormalizedResults = (config, normalized) => {
    const file = join(process.cwd(), config.testRunner.resultsFile);
  
    writeFileSync(file, `${JSON.stringify(normalized, null, 2)}\n`);
  
    return file;
  };
  
  const normalizeRawFile = (config, runner) => {
    const rawFile = join(process.cwd(), config.testRunner.rawResultsFile);
  
    if (!existsSync(rawFile)) {
      return null;
    }
  
    const raw = JSON.parse(readFileSync(rawFile, 'utf8'));
  
    if (runner === 'vitest' || runner === 'jest') {
      return writeNormalizedResults(
        config,
        normalizeJestLikeResults(raw, runner),
      );
    }
  
    if (runner === 'mocha') {
      return writeNormalizedResults(config, normalizeMochaResults(raw));
    }
  
    return null;
  };
  
  const printCapturedFailureOutput = (result) => {
    if (result.status === 0) {
      return;
    }
  
    const output = [result.stdout, result.stderr]
      .filter(Boolean)
      .join('\n')
      .trim();
  
    if (!output) {
      return;
    }
  
    console.log('');
    console.log('Test runner output');
    console.log('------------------');
    console.log(output);
    console.log('');
  };
  
  const runVitest = async (config) => {
    const paths = getPaths(config);
  
    const args = [
      'run',
  
      '--coverage',
      '--coverage.reportOnFailure',
  
      `--coverage.reportsDirectory=${paths.coverageDir}`,
  
      '--coverage.reporter=json-summary',
      '--coverage.reporter=html',
  
      '--reporter=json',
  
      `--outputFile=${paths.rawResultsFile}`,
    ];
  
    const result = await runProcess({
      command: getLocalBin('vitest'),
      args,
      label: 'Running Vitest with coverage',
    });
  
    normalizeRawFile(config, 'vitest');
  
    printCapturedFailureOutput(result);
  
    return result;
  };
  
  const runJest = async (config) => {
    const paths = getPaths(config);
  
    const args = [
      '--coverage',
  
      `--coverageDirectory=${paths.coverageDir}`,
  
      '--coverageReporters=json-summary',
      '--coverageReporters=html',
  
      '--json',
  
      `--outputFile=${paths.rawResultsFile}`,
    ];
  
    const result = await runProcess({
      command: getLocalBin('jest'),
      args,
      label: 'Running Jest with coverage',
    });
  
    normalizeRawFile(config, 'jest');
  
    printCapturedFailureOutput(result);
  
    return result;
  };
  
  const runMocha = async (config) => {
    const paths = getPaths(config);
  
    const args = [
      `--report-dir=${paths.coverageDir}`,
  
      '--reporter=json-summary',
      '--reporter=html',
  
      getLocalBin('mocha'),
  
      '--reporter=json',
  
      '--reporter-option',
      `output=${paths.rawResultsFile}`,
    ];
  
    const result = await runProcess({
      command: getLocalBin('nyc'),
      args,
      label: 'Running Mocha with coverage',
    });
  
    normalizeRawFile(config, 'mocha');
  
    printCapturedFailureOutput(result);
  
    return result;
  };
  
  const runAva = async (config) => {
    const paths = getPaths(config);
  
    const args = [
      `--report-dir=${paths.coverageDir}`,
  
      '--reporter=json-summary',
      '--reporter=html',
  
      getLocalBin('ava'),
  
      '--tap',
    ];
  
    const result = await runProcess({
      command: getLocalBin('nyc'),
      args,
      label: 'Running AVA with coverage',
    });
  
    writeFileSync(paths.tapResultsFile, result.stdout ?? '');
  
    writeNormalizedResults(
      config,
      normalizeTapResults(result.stdout ?? '', 'ava'),
    );
  
    printCapturedFailureOutput(result);
  
    return result;
  };
  
  const runCustom = async (config, runner) => {
    /*
     * Custom commands remain synchronous for now because they are explicitly
     * supplied by the consuming project and may have their own terminal UI.
     */
    const result = runShellCommand(runner.customCommand);
  
    const format = runner.custom?.resultFormat ?? 'normalized';
  
    if (format === 'jest-json') {
      normalizeRawFile(config, 'jest');
    }
  
    if (format === 'vitest-json') {
      normalizeRawFile(config, 'vitest');
    }
  
    if (format === 'mocha-json') {
      normalizeRawFile(config, 'mocha');
    }
  
    return result;
  };
  
  const runSelectedRunner = async (config, runner) => {
    if (runner.customCommand) {
      return runCustom(config, runner);
    }
  
    switch (runner.id) {
      case 'vitest':
        return runVitest(config);
  
      case 'jest':
        return runJest(config);
  
      case 'mocha':
        return runMocha(config);
  
      case 'ava':
        return runAva(config);
  
      default:
        throw new Error(
          `No built-in quality adapter exists for ${runner.id}.`,
        );
    }
  };
  
  const validateGeneratedArtifacts = (config, runner, processResult) => {
    const paths = getPaths(config);
    const missing = [];
  
    if (!existsSync(paths.resultsFile)) {
      missing.push(relative(process.cwd(), paths.resultsFile));
    }
  
    if (!existsSync(paths.coverageSummary)) {
      missing.push(relative(process.cwd(), paths.coverageSummary));
    }
  
    if (missing.length) {
      const exitText =
        processResult.status == null
          ? ''
          : ` The test process exited with code ${processResult.status}.`;
  
      throw new Error(
        `${runner.packageName} did not produce all required quality artifacts.${exitText}\n` +
          `Missing:\n${missing.map((file) => `  - ${file}`).join('\n')}`,
      );
    }
  
    return paths;
  };
  
  const concernNeedsTestRun = (concern) =>
    concern === 'all' ||
    concern === 'coverage' ||
    concern === 'testability';
  
  const runProjectTests = async ({
    config,
    concern,
    reuseArtifacts = false,
  }) => {
    if (!concernNeedsTestRun(concern)) {
      return {
        ran: false,
        runner: null,
        detected: [],
      };
    }
  
    if (config.testRunner?.enabled === false) {
      return {
        ran: false,
        runner: null,
        detected: [],
      };
    }
  
    const { selected, detected } = selectTestRunner(config);
  
    console.log('');
    console.log('Quality test collection');
    console.log('-----------------------');
  
    displayDetection({
      selected,
      detected,
    });
  
    if (!selected) {
      const installedButUnsupported = detected.filter(
        (runner) => runner.installed && !runner.eligible,
      );
  
      const details = installedButUnsupported.length
        ? `\n\nInstalled runners that need additional configuration:\n${installedButUnsupported
            .map(
              (runner) =>
                `  - ${runner.packageName}: ${runner.reason}`,
            )
            .join('\n')}`
        : '';
  
      throw new Error(
        'No supported installed JavaScript test runner could produce both test results and Istanbul coverage.' +
          details,
      );
    }
  
    if (reuseArtifacts) {
      const paths = getPaths(config);
  
      if (
        existsSync(paths.resultsFile) &&
        existsSync(paths.coverageSummary)
      ) {
        console.log(`Selected: ${selected.packageName}`);
  
        console.log(
          'Reusing existing test and coverage artifacts by request.',
        );
  
        return {
          ran: false,
          runner: selected.id,
          detected,
          paths,
        };
      }
    }
  
    console.log(`Selected: ${selected.packageName}`);
    console.log('');
  
    cleanOutput(config);
  
    const processResult = await runSelectedRunner(config, selected);
  
    const paths = validateGeneratedArtifacts(
      config,
      selected,
      processResult,
    );
  
    console.log('');
  
    console.log(
      `Test results: ${relative(
        process.cwd(),
        paths.resultsFile,
      )}`,
    );
  
    console.log(
      `Coverage:     ${relative(
        process.cwd(),
        paths.coverageSummary,
      )}`,
    );
  
    if (processResult.status !== 0) {
      console.log('');
  
      console.log(
        `${selected.packageName} exited with code ${processResult.status}; ` +
          'quality analysis will continue so the failed tests can be represented in the report.',
      );
    }
  
    return {
      ran: true,
      runner: selected.id,
      detected,
      exitCode: processResult.status,
      paths,
    };
  };
  
  module.exports = {
    RUNNER_DEFINITIONS,
    detectTestRunners,
    runProjectTests,
    selectTestRunner,
  };
  