const { existsSync, readFileSync, statSync, readdirSync } = require('node:fs');
const { isAbsolute, join, resolve } = require('node:path');
const { startOfToday, toRelativePath } = require('./paths.cjs');

const firstExisting = (paths) =>
  paths
    .map((p) => (isAbsolute(p) ? p : join(process.cwd(), p)))
    .find(existsSync) ?? null;

const isFreshArtifact = (
  file,
  config,
  now = Date.now(),
) => {
  if (!file || !existsSync(file)) return false;
  if (config?.freshness?.requireToday === false) return true;

  const maxAgeHours = Number(
    config?.freshness?.maxAgeHours,
  );

  if (
    Number.isFinite(maxAgeHours) &&
    maxAgeHours >= 0
  ) {
    const ageMs = now - statSync(file).mtimeMs;
    return ageMs <= maxAgeHours * 60 * 60 * 1000;
  }

  if (config?.freshness?.requireToday === true) {
    return statSync(file).mtime >= startOfToday();
  }

  return true;
};

/* Backward-compatible export name; freshness may now use a rolling window. */
const isFreshToday = isFreshArtifact;

const assertFresh = (file, label, config) => {
  if (!file) throw new Error(`${label} was not found.`);
  if (!isFreshArtifact(file, config)) {
    throw new Error(
      `${label} is stale: ${toRelativePath(file)}. Regenerate the quality artifacts or increase freshness.maxAgeHours.`,
    );
  }
};

const COVERAGE_FILE_NAMES = [
  'coverage-summary.json',
  'coverage-final.json',
];

const coverageCandidates = (target) => {
  const candidates = [];

  if (!target) return candidates;

  const targetPath = isAbsolute(target)
    ? target
    : resolve(process.cwd(), target);

  if (existsSync(targetPath) && statSync(targetPath).isFile()) {
    return [targetPath];
  }

  if (existsSync(targetPath) && statSync(targetPath).isDirectory()) {
    for (const name of COVERAGE_FILE_NAMES) {
      const direct = join(targetPath, name);
      if (existsSync(direct)) candidates.push(direct);
    }

    const nested = walkCoverageFiles(targetPath);
    return [...new Set(candidates.concat(nested))];
  }

  return candidates;
};

const walkCoverageFiles = (root) => {
  const files = [];
  const visit = (dir) => {
    const entries = readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const child = join(dir, entry.name);
      if (entry.isDirectory()) {
        visit(child);
        continue;
      }
      if (
        entry.isFile() &&
        COVERAGE_FILE_NAMES.includes(entry.name)
      ) {
        files.push(child);
      }
    }
  };

  visit(root);
  return files;
};

const normalizeCoveragePaths = (config, coverageTarget) => {
  if (!coverageTarget) {
    return config.coverageSummaryPaths ?? [];
  }

  const explicit = coverageCandidates(coverageTarget);
  if (explicit.length) {
    return explicit;
  }

  return [coverageTarget];
};

const parseJsonFile = (file, label) => {
  try {
    return JSON.parse(readFileSync(file, 'utf8'));
  } catch (error) {
    throw new Error(
      `Unable to parse ${label} at ${toRelativePath(file)}. Regenerate the quality artifacts.`,
      { cause: error },
    );
  }
};

const findFreshJsonArtifact = (
  paths,
  config,
  now = Date.now(),
) => {
  const candidates = [
    ...new Set(
      (paths ?? [])
        .filter(Boolean)
        .map((file) =>
          isAbsolute(file)
            ? file
            : join(process.cwd(), file),
        ),
    ),
  ];

  for (const file of candidates) {
    if (!isFreshArtifact(file, config, now)) continue;

    try {
      const value = JSON.parse(readFileSync(file, 'utf8'));
      if (value && typeof value === 'object') {
        return { file, value };
      }
    } catch {
      // Try the next configured artifact before treating the set as unusable.
    }
  }

  return null;
};

const coverageMetric = (total, covered) => ({
  total,
  covered,
  skipped: 0,
  pct:
    total === 0
      ? 100
      : Math.round(
          (covered / total) * 10000,
        ) / 100,
});

const countCoverageValues = (values) => {
  const counts = Object.values(values ?? {}).flat();

  return coverageMetric(
    counts.length,
    counts.filter((count) => Number(count) > 0).length,
  );
};

const summarizeFinalFile = (coverage) => {
  const statements = countCoverageValues(coverage?.s);
  const functions = countCoverageValues(coverage?.f);
  const branches = countCoverageValues(coverage?.b);
  const lineHits = new Map();

  for (const [id, count] of Object.entries(coverage?.s ?? {})) {
    const line = coverage?.statementMap?.[id]?.start?.line;

    if (!Number.isInteger(line)) {
      continue;
    }

    lineHits.set(
      line,
      Math.max(
        lineHits.get(line) ?? 0,
        Number(count) || 0,
      ),
    );
  }

  const lines = countCoverageValues(
    Object.fromEntries(lineHits),
  );

  return {
    lines,
    statements,
    functions,
    branches,
  };
};

const sumMetrics = (summaries, metric) => {
  const total = summaries.reduce(
    (sum, summary) => sum + summary[metric].total,
    0,
  );
  const covered = summaries.reduce(
    (sum, summary) => sum + summary[metric].covered,
    0,
  );

  return coverageMetric(total, covered);
};

const normalizeCoverageReport = (report) => {
  if (report?.total) {
    return report;
  }

  const entries = Object.entries(report ?? {}).filter(
    ([, coverage]) =>
      coverage &&
      typeof coverage === 'object' &&
      coverage.statementMap &&
      coverage.s,
  );

  if (!entries.length) {
    return report;
  }

  const summaries = entries.map(([file, coverage]) => [
    file,
    summarizeFinalFile(coverage),
  ]);
  const values = summaries.map(([, summary]) => summary);

  return {
    total: {
      lines: sumMetrics(values, 'lines'),
      statements: sumMetrics(values, 'statements'),
      functions: sumMetrics(values, 'functions'),
      branches: sumMetrics(values, 'branches'),
    },
    ...Object.fromEntries(summaries),
  };
};

const buildCoverageResult = (file, rawValue) => {
  const summary = normalizeCoverageReport(rawValue);
  const byFile = new Map();
  for (const [name, value] of Object.entries(summary)) {
    if (name === 'total') continue;
    byFile.set(toRelativePath(name), value);
  }

  return { file, summary, byFile };
};

/*
 * Compares the set of testable files Istanbul actually reported against the
 * full set of testable files discovered in the project. A coverage report
 * that only knows about a handful of files is a strong signal that coverage
 * was generated from a partial test run (e.g. `vitest run some.test.ts
 * --coverage`), not the full suite - even though the artifact itself may be
 * perfectly "fresh".
 */
const getCoverageCompleteness = (coverage, expectedFiles) => {
  const expected = [
    ...new Set((expectedFiles ?? []).map((file) => toRelativePath(file))),
  ];

  if (!expected.length) {
    return { expected: 0, present: 0, missing: [], ratio: 1 };
  }

  const byFile = coverage?.byFile ?? new Map();
  const missing = expected.filter((file) => !byFile.has(file));
  const present = expected.length - missing.length;

  return {
    expected: expected.length,
    present,
    missing,
    ratio: present / expected.length,
  };
};

const asPercent = (value) => `${Math.round(value * 10000) / 100}%`;

const assertCoverageCompleteness = (coverage, expectedFiles, config) => {
  if (config?.completeness?.enabled === false) return;
  if (!coverage?.file || !expectedFiles?.length) return;

  const minRatio = Number(
    config?.completeness?.minCoverageFileRatio ?? 0.9,
  );
  if (!Number.isFinite(minRatio) || minRatio <= 0) return;

  const completeness = getCoverageCompleteness(coverage, expectedFiles);
  if (completeness.expected === 0) return;
  if (completeness.ratio + 1e-9 >= minRatio) return;

  const examples = completeness.missing.slice(0, 8);

  throw new Error(
    `Coverage summary at ${toRelativePath(coverage.file)} only accounts for ` +
      `${completeness.present}/${completeness.expected} testable file(s) ` +
      `(${asPercent(completeness.ratio)}, needs >= ${asPercent(minRatio)}).\n` +
      'This usually means coverage was generated from a partial test run ' +
      '(e.g. `vitest run some.test.ts --coverage`) rather than the full ' +
      'suite, which would silently understate quality for every file left ' +
      'out of that run.\n' +
      'Re-run the full test suite with coverage, pass --coverage-target to ' +
      'intentionally scope a partial check, or adjust ' +
      'completeness.minCoverageFileRatio / completeness.enabled in the ' +
      'config if this is expected.\n' +
      `Missing example(s): ${examples.join(', ')}` +
      (completeness.missing.length > examples.length ? ', ...' : ''),
  );
};

const loadCoverage = (
  config,
  required = true,
  coverageTarget = null,
  expectedFiles = null,
) => {
  const coveragePaths = normalizeCoveragePaths(config, coverageTarget);
  const selected = findFreshJsonArtifact(
    coveragePaths,
    config,
  );
  const file = selected?.file ?? null;

  if (!file) {
    const existing = firstExisting(coveragePaths);

    if (required) {
      if (existing) {
        assertFresh(existing, 'Coverage summary', config);
        parseJsonFile(existing, 'coverage artifact');
      }

      throw new Error(
        'No Istanbul coverage-summary.json or coverage-final.json was found. Run coverage first.',
      );
    }
    return { file: null, summary: null, byFile: new Map() };
  }

  const result = buildCoverageResult(file, selected.value);

  /*
   * An explicit --coverage-target is an intentional, opt-in narrow scope, so
   * we don't second-guess it here.
   */
  if (!coverageTarget) {
    assertCoverageCompleteness(result, expectedFiles, config);
  }

  return result;
};

const getMetricPct = (coverage, names) => {
  for (const name of names) {
    const value = coverage?.[name]?.pct;
    if (typeof value === 'number') return value;
  }
  return null;
};

const getCoverageMetrics = (coverage) => ({
  statements: getMetricPct(coverage, ['statements', 'stmts']),
  branches: getMetricPct(coverage, ['branches']),
  functions: getMetricPct(coverage, ['functions', 'funcs']),
  lines: getMetricPct(coverage, ['lines']),
});

const isFullyCovered = (coverage) => {
  if (!coverage) return false;
  return Object.values(getCoverageMetrics(coverage)).every((value) => value === 100);
};

module.exports = {
  assertCoverageCompleteness,
  assertFresh,
  buildCoverageResult,
  firstExisting,
  findFreshJsonArtifact,
  getCoverageCompleteness,
  getCoverageMetrics,
  isFreshArtifact,
  isFreshToday,
  isFullyCovered,
  loadCoverage,
  parseJsonFile,
  toRelativePath,
};
