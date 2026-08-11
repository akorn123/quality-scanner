const { existsSync, readFileSync, statSync } = require('node:fs');
const { isAbsolute, join, normalize, relative } = require('node:path');

const toRelativePath = (file) => {
  const value = isAbsolute(file) ? relative(process.cwd(), file) : file;
  return normalize(value).replaceAll('\\', '/').replace(/^\.\//, '');
};

const firstExisting = (paths) => paths.map((p) => join(process.cwd(), p)).find(existsSync) ?? null;

const assertFresh = (file, label, config) => {
  if (!file) throw new Error(`${label} was not found.`);
  if (!config.freshness.requireToday) return;
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  if (statSync(file).mtime < start) {
    throw new Error(`${label} is stale: ${toRelativePath(file)}. Regenerate the quality artifacts first.`);
  }
};

const loadCoverage = (config, required = true) => {
  const file = firstExisting(config.coverageSummaryPaths);
  if (!file) {
    if (required) throw new Error('No Istanbul coverage-summary.json was found. Run coverage first.');
    return { file: null, summary: null, byFile: new Map() };
  }
  if (required) assertFresh(file, 'Coverage summary', config);
  else if (config.freshness.requireToday) {
    const start = new Date(); start.setHours(0, 0, 0, 0);
    if (statSync(file).mtime < start) return { file: null, summary: null, byFile: new Map() };
  }
  const summary = JSON.parse(readFileSync(file, 'utf8'));
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

module.exports = { assertFresh, firstExisting, getCoverageMetrics, isFullyCovered, loadCoverage, toRelativePath };
