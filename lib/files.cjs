const { existsSync, readdirSync, statSync } = require('node:fs');
const { join } = require('node:path');
const { toRelativePath } = require('./paths.cjs');

const getAllFiles = (dir, config) => {
  if (!existsSync(dir)) return [];
  const ignoredDirs = new Set(config.ignoredDirs);
  const files = [];

  for (const entry of readdirSync(dir)) {
    const fullPath = join(dir, entry);
    const stats = statSync(fullPath);
    if (stats.isDirectory()) {
      if (!ignoredDirs.has(entry)) files.push(...getAllFiles(fullPath, config));
      continue;
    }
    if (!config.sourceFilePattern.test(entry)) continue;
    if (config.ignoredFilePatterns.some((pattern) => pattern.test(fullPath))) continue;
    files.push(fullPath);
  }
  return files;
};

const resolveFiles = (config) =>
  config.scanRoots.flatMap((scanRoot) => getAllFiles(join(process.cwd(), scanRoot), config));

const isTestFile = (file, config) => config.testFilePattern.test(file);

const isTestableTarget = (file, config) => {
  if (isTestFile(file, config)) return false;
  const relativeFile = toRelativePath(file);
  if (config.testabilityIgnoredPathFragments.some((part) => relativeFile.includes(part))) return false;
  if (relativeFile.endsWith('/types.ts') || relativeFile.endsWith('/types.tsx')) return false;

  const prefixes = config.testablePathPrefixes ?? [];
  if (!prefixes.length) {
    return true;
  }

  return prefixes.some((prefix) => relativeFile.startsWith(prefix));
};

module.exports = { isTestFile, isTestableTarget, resolveFiles, toRelativePath };
