const { existsSync, readFileSync, statSync, readdirSync } = require('node:fs');
const { isAbsolute, join, resolve } = require('node:path');
const { startOfToday, toRelativePath } = require('./paths.cjs');

const firstExisting = (paths) =>
  paths
    .map((p) => (isAbsolute(p) ? p : join(process.cwd(), p)))
    .find(existsSync) ?? null;

const isFreshToday = (file, config) => {
  if (!file || !existsSync(file)) return false;
  if (!config?.freshness?.requireToday) return true;
  return statSync(file).mtime >= startOfToday();
};

const assertFresh = (file, label, config) => {
  if (!file) throw new Error(`${label} was not found.`);
  if (!config.freshness.requireToday) return;
  if (!isFreshToday(file, config)) {
    throw new Error(
      `${label} is stale: ${toRelativePath(file)}. Regenerate the quality artifacts first.`,
    );
  }
};

const coverageSummaryCandidates = (target) => {
  const candidates = [];

  if (!target) return candidates;

  const targetPath = isAbsolute(target)
    ? target
    : resolve(process.cwd(), target);

  if (existsSync(targetPath) && statSync(targetPath).isFile()) {
    return [targetPath];
  }

  if (existsSync(targetPath) && statSync(targetPath).isDirectory()) {
    const direct = join(targetPath, 'coverage-summary.json');
    if (existsSync(direct)) candidates.push(direct);

    const nested = walkCoverageSummaryFiles(targetPath);
    return candidates.concat(nested);
  }

  return candidates;
};

const walkCoverageSummaryFiles = (root) => {
  const files = [];
  const visit = (dir) => {
    const entries = readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const child = join(dir, entry.name);
      if (entry.isDirectory()) {
        visit(child);
        continue;
      }
      if (entry.isFile() && entry.name === 'coverage-summary.json') {
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

  const explicit = coverageSummaryCandidates(coverageTarget);
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

const loadCoverage = (config, required = true, coverageTarget = null) => {
  const coveragePaths = normalizeCoveragePaths(config, coverageTarget);
  const file = firstExisting(coveragePaths.map((p) => (isAbsolute(p) ? p : join(process.cwd(), p))));

  if (!file) {
    if (required) throw new Error('No Istanbul coverage-summary.json was found. Run coverage first.');
    return { file: null, summary: null, byFile: new Map() };
  }

  if (required) assertFresh(file, 'Coverage summary', config);
  else if (config.freshness.requireToday && !isFreshToday(file, config)) {
    return { file: null, summary: null, byFile: new Map() };
  }

  const summary = parseJsonFile(file, 'coverage summary');
  const byFile = new Map();
  for (const [name, value] of Object.entries(summary)) {
    if (name === 'total') continue;
    byFile.set(toRelativePath(name), value);
  }

  return { file, summary, byFile };
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
  assertFresh,
  firstExisting,
  getCoverageMetrics,
  isFreshToday,
  isFullyCovered,
  loadCoverage,
  parseJsonFile,
  toRelativePath,
};
