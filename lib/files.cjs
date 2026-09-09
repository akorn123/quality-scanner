const { existsSync, readdirSync, statSync } = require('node:fs');
const { join } = require('node:path');
const { toRelativePath } = require('./paths.cjs');

const getAllPaths = (dir, config) => {
  if (!existsSync(dir)) return [];
  const ignoredDirs = new Set(config.ignoredDirs);
  const paths = [];

  for (const entry of readdirSync(dir)) {
    const fullPath = join(dir, entry);
    const stats = statSync(fullPath);
    if (stats.isDirectory()) {
      if (!ignoredDirs.has(entry)) {
        paths.push(fullPath, ...getAllPaths(fullPath, config));
      }
      continue;
    }
    if (config.ignoredFilePatterns.some((pattern) => pattern.test(fullPath))) continue;
    paths.push(fullPath);
  }
  return paths;
};

const getAllFiles = (dir, config) =>
  getAllPaths(dir, config).filter((file) => {
    if (!statSync(file).isFile()) return false;
    return config.sourceFilePattern.test(file);
  });

const resolveFiles = (config) =>
  config.scanRoots.flatMap((scanRoot) => getAllFiles(join(process.cwd(), scanRoot), config));

const resolvePaths = (config) =>
  config.scanRoots.flatMap((scanRoot) => getAllPaths(join(process.cwd(), scanRoot), config));

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

module.exports = {
  isTestFile,
  isTestableTarget,
  resolveFiles,
  resolvePaths,
  toRelativePath,
};
