const { existsSync, readFileSync, statSync } = require('node:fs');
const { dirname, extname, join, resolve } = require('node:path');
const { isTestFile, isTestableTarget } = require('./files.cjs');

const extensions = ['.tsx', '.ts', '.jsx', '.js', '.mts', '.cts', '.mjs', '.cjs'];

const getRelativeImports = (content) => {
  const imports = new Set();
  const patterns = [
    /import(?:\s+type)?(?:[\s\S]*?)from\s+['"](\.{1,2}[/\\][^'"]+)['"]/g,
    /import\(\s*['"](\.{1,2}[/\\][^'"]+)['"]\s*\)/g,
    /require\(\s*['"](\.{1,2}[/\\][^'"]+)['"]\s*\)/g,
  ];
  for (const pattern of patterns) {
    let match;
    while ((match = pattern.exec(content)) !== null) imports.add(match[1]);
  }
  return [...imports];
};

const resolveImport = (fromFile, importPath, config) => {
  const base = resolve(dirname(fromFile), importPath);
  const candidates = extname(base)
    ? [base]
    : [base, ...extensions.map((ext) => `${base}${ext}`), ...extensions.map((ext) => join(base, `index${ext}`))];
  return candidates.find((candidate) =>
    existsSync(candidate) && statSync(candidate).isFile() && !isTestFile(candidate, config)
  );
};

const resolveTargetTests = (files, config) => {
  const testFiles = files.filter((file) => isTestFile(file, config));
  const targets = files.filter((file) => isTestableTarget(file, config));
  const direct = new Map();

  for (const testFile of testFiles) {
    const content = readFileSync(testFile, 'utf8');
    for (const importPath of getRelativeImports(content)) {
      const target = resolveImport(testFile, importPath, config);
      if (!target) continue;
      direct.set(target, [...(direct.get(target) ?? []), testFile]);
    }
  }

  return {
    testFiles,
    targetToTests: new Map(targets.map((target) => [target, direct.get(target) ?? []])),
  };
};

module.exports = { getRelativeImports, resolveTargetTests };
