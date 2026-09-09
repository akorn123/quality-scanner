const { readFileSync } = require('node:fs');
const { relative } = require('node:path');
const { getRelativeImports, resolveImport } = require('./test-resolver.cjs');
const { resetAndTest } = require('./regex.cjs');

const normalizePath = (value) => value.replaceAll('\\', '/');

const validateOrganizationRule = (rule) => {
  if (!rule?.id) {
    throw new Error('An organization rule is missing id.');
  }

  if (!['test-target', 'shared-symbol-location'].includes(rule.type)) {
    throw new Error(
      `Organization rule ${rule.id} must use type test-target or shared-symbol-location.`,
    );
  }

  if (rule.type === 'test-target') {
    if (!(rule.targetPattern instanceof RegExp) || typeof rule.testPathTemplate !== 'string') {
      throw new Error(
        `Organization rule ${rule.id} must define targetPattern and testPathTemplate.`,
      );
    }
  }

  if (rule.type === 'shared-symbol-location') {
    if (!(rule.symbolPattern instanceof RegExp) || !(rule.allowedFilePattern instanceof RegExp)) {
      throw new Error(
        `Organization rule ${rule.id} must define symbolPattern and allowedFilePattern.`,
      );
    }
  }

  return {
    severity: 'warning',
    penalty: 5,
    category: 'organization',
    minimumConsumers: 2,
    ...rule,
  };
};

const createFinding = (rule, relativeFile, description = rule.description) => ({
  id: rule.id,
  concern: 'structure',
  category: rule.category,
  key: rule.key ?? null,
  severity: rule.severity,
  penalty: rule.penalty,
  line: 1,
  code: relativeFile,
  description: description ?? '',
  suggestion: rule.suggestion ?? '',
  path: relativeFile,
  ruleFamily: 'organization',
});

const getExportedSymbols = (content) => {
  const symbols = [];
  const declarationPattern =
    /\bexport\s+(?:const|let|var|function|async\s+function|class)\s+([A-Za-z_$][\w$]*)/g;
  const defaultFunctionPattern =
    /\bexport\s+default\s+(?:async\s+)?function(?:\s+[A-Za-z_$][\w$]*)?/g;
  const listPattern = /\bexport\s*\{([^}]+)\}/g;

  for (const match of content.matchAll(declarationPattern)) {
    symbols.push({
      name: match[1],
      type: /\b(?:function|async\s+function|class)\b/.test(match[0])
        ? 'function'
        : 'constant',
    });
  }

  for (const match of content.matchAll(defaultFunctionPattern)) {
    symbols.push({ name: 'default', type: 'function' });
  }

  for (const match of content.matchAll(listPattern)) {
    for (const item of match[1].split(',')) {
      const name = item.trim().split(/\s+as\s+/)[0];
      if (/^[A-Za-z_$][\w$]*$/.test(name)) {
        symbols.push({ name, type: 'unknown' });
      }
    }
  }

  return symbols;
};

const getStaticImportedNames = (content) => {
  const imports = [];
  const pattern =
    /\bimport\s+([^'"]+?)\s+from\s+['"](\.{1,2}[/\\][^'"]+)['"]/g;

  for (const match of content.matchAll(pattern)) {
    const clause = match[1].trim();
    const names = [];
    const named = clause.match(/\{([^}]+)\}/)?.[1] ?? '';

    if (clause.split(',')[0] && !clause.startsWith('{')) {
      names.push({
        imported: 'default',
        local: clause.split(',')[0].trim(),
      });
    }

    for (const item of named.split(',')) {
      if (!item.trim()) continue;
      const parts = item.trim().split(/\s+as\s+/);
      names.push({
        imported: parts[0],
        local: parts[1] ?? parts[0],
      });
    }

    imports.push({ path: match[2], names });
  }

  return imports;
};

const analyzeOrganization = ({
  files,
  targetToTests,
  config,
  root = process.cwd(),
}) => {
  const relativePath = (file) => normalizePath(relative(root, file));
  const relativeFiles = new Set(files.map(relativePath));
  const findings = [];
  const rules = (config.organizationRules ?? []).map(validateOrganizationRule);

  for (const rule of rules.filter((item) => item.type === 'test-target')) {
    for (const [target] of targetToTests.entries()) {
      const relativeTarget = relativePath(target);
      const match = rule.targetPattern.exec(relativeTarget);
      rule.targetPattern.lastIndex = 0;
      if (!match) continue;

      const expected = relativeTarget.replace(
        rule.targetPattern,
        rule.testPathTemplate,
      );
      rule.targetPattern.lastIndex = 0;

      if (!relativeFiles.has(normalizePath(expected))) {
        findings.push(createFinding(
          rule,
          relativeTarget,
          `${rule.description ?? 'A test target does not have its required test file.'} Expected ${normalizePath(expected)}.`,
        ));
        continue;
      }

      const expectedFile = files.find((file) =>
        relativePath(file) === normalizePath(expected),
      );
      const staticallyImportsTarget = expectedFile
        ? getStaticImportedNames(readFileSync(expectedFile, 'utf8'))
            .some((item) =>
              item.names.some((name) =>
                resolveImport(expectedFile, item.path, config) === target,
              ),
            )
        : false;

      if (rule.requireImport && !staticallyImportsTarget) {
        findings.push(createFinding(
          rule,
          normalizePath(expected),
          `${rule.description ?? 'The expected test file does not import its target.'} Expected an import of ${relativeTarget}.`,
        ));
      }
    }
  }

  const exportsByFile = new Map();
  const consumersBySymbol = new Map();

  for (const file of files) {
    const content = readFileSync(file, 'utf8');
    const exported = getExportedSymbols(content);
    if (exported.length) exportsByFile.set(file, exported);

    for (const imported of getStaticImportedNames(content)) {
      const source = resolveImport(file, imported.path, config);
      if (!source) continue;
      for (const item of imported.names) {
        const key = `${source}:${item.imported}`;
        const consumers = consumersBySymbol.get(key) ?? new Set();
        consumers.add(file);
        consumersBySymbol.set(key, consumers);
      }
    }
  }

  for (const rule of rules.filter((item) => item.type === 'shared-symbol-location')) {
    for (const [file, symbols] of exportsByFile.entries()) {
      const relativeFile = relativePath(file);
      if (resetAndTest(rule.allowedFilePattern, relativeFile)) continue;

      for (const symbol of symbols) {
        if (rule.symbolType && symbol.type !== rule.symbolType) continue;
        if (!resetAndTest(rule.symbolPattern, symbol.name)) continue;
        const consumers = consumersBySymbol.get(`${file}:${symbol.name}`);
        if ((consumers?.size ?? 0) < rule.minimumConsumers) continue;
        findings.push(createFinding(
          rule,
          relativeFile,
          `${rule.description ?? `Shared symbol ${symbol.name} is in a disallowed file.`} Symbol: ${symbol.name}.`,
        ));
      }
    }
  }

  return [{
    file: null,
    relativeFile: '.',
    findings,
    suppressedFindings: [],
    score: Math.max(
      0,
      100 - findings.reduce((sum, finding) => sum + finding.penalty, 0),
    ),
  }];
};

module.exports = {
  analyzeOrganization,
  getExportedSymbols,
  getStaticImportedNames,
  validateOrganizationRule,
};
