const { readFileSync } = require('node:fs');

const behaviorDefaults = require('../rules/behavior.cjs');
const testabilityDefaults = require('../rules/testability.cjs');
const securityDefaults = require('../rules/security.cjs');

const { analyzeSecurity } = require('./security.cjs');
const { isFullyCovered } = require('./coverage.cjs');
const { toRelativePath } = require('./files.cjs');

const {
  getSuppressionForLine,
  isScannerDirective,
} = require('./suppressions.cjs');

const resetAndTest = (pattern, value) => {
  pattern.lastIndex = 0;
  return pattern.test(value);
};

const validateRule = (rule, concern) => {
  if (!rule?.id) {
    throw new Error(`A ${concern} rule is missing id.`);
  }

  if (rule.concern && rule.concern !== concern) {
    throw new Error(
      `Rule ${rule.id} has concern ${rule.concern}, expected ${concern}.`,
    );
  }

  if (!rule.pattern && !rule.filePattern && !rule.analyzer) {
    throw new Error(
      `Rule ${rule.id} must define pattern, filePattern, or analyzer.`,
    );
  }

  return {
    severity: 'warning',
    penalty: 5,
    category: 'custom',
    ...rule,
    concern,
  };
};

const getRules = (config) => ({
  behavior: [...behaviorDefaults, ...config.behaviorRules].map((rule) =>
    validateRule(rule, 'behavior'),
  ),

  testability: [...testabilityDefaults, ...config.testabilityRules].map(
    (rule) => validateRule(rule, 'testability'),
  ),

  security: securityDefaults,
});

const createFinding = (
  rule,
  line,
  code,
  extra = {},
) => ({
  id: rule.id,
  concern: rule.concern,
  category: rule.category,
  key: rule.key ?? null,
  severity: rule.severity,
  penalty: rule.penalty,
  line,
  code,
  description: rule.description ?? '',
  suggestion: rule.suggestion ?? '',
  coverageCandidate: Boolean(rule.coverageCandidate),
  ...extra,
});

const addFinding = ({
  lines,
  zeroBasedLineIndex,
  rule,
  finding,
  findings,
  suppressedFindings,
}) => {
  const suppression = getSuppressionForLine(
    lines,
    zeroBasedLineIndex,
    rule,
  );

  if (!suppression) {
    findings.push(finding);
    return;
  }

  suppressedFindings.push({
    ...finding,
    suppressed: true,
    suppression,
  });
};

const countTests = (content) =>
  (content.match(/\b(?:it|test)\s*\(/g) ?? []).length +
  (content.match(/\b(?:it|test)\.skip\s*\(/g) ?? []).length;

const getBlock = (lines, start) => {
  let text = '';
  let depth = 0;
  let started = false;

  for (let i = start; i < lines.length; i += 1) {
    text += `${lines[i]}\n`;

    for (const char of lines[i]) {
      if (char === '{') {
        depth += 1;
        started = true;
      }

      if (char === '}') {
        depth -= 1;
      }
    }

    if (started && depth <= 0) {
      break;
    }
  }

  return text;
};

const runAnalyzer = (
  rule,
  lines,
  findings,
  suppressedFindings,
) => {
  if (rule.analyzer !== 'skipped-tests') {
    return;
  }

  lines.forEach((line, index) => {
    let finding = null;

    if (/\b(?:it|test)\.skip\s*\(/.test(line)) {
      finding = createFinding(
        rule,
        index + 1,
        line.trim(),
        {
          skippedTests: 1,
        },
      );
    } else if (/\bdescribe\.skip\s*\(/.test(line)) {
      finding = createFinding(
        rule,
        index + 1,
        line.trim(),
        {
          skippedTests: countTests(
            getBlock(lines, index),
          ),
        },
      );
    }

    if (!finding) {
      return;
    }

    addFinding({
      lines,
      zeroBasedLineIndex: index,
      rule,
      finding,
      findings,
      suppressedFindings,
    });
  });
};

const scanWithRules = (file, rules) => {
  const content = readFileSync(file, 'utf8');
  const lines = content.split(/\r?\n/);

  const findings = [];
  const suppressedFindings = [];

  for (const rule of rules) {
    if (
      rule.filePattern &&
      resetAndTest(rule.filePattern, content)
    ) {
      findings.push(
        createFinding(
          rule,
          1,
          '[file-level pattern]',
          {
            occurrenceCount: 1,
          },
        ),
      );
    }

    if (rule.analyzer) {
      runAnalyzer(
        rule,
        lines,
        findings,
        suppressedFindings,
      );
    }
  }

  const occurrence = new Map();

  lines.forEach((line, index) => {
    if (isScannerDirective(line)) {
      return;
    }

    for (const rule of rules) {
      if (!rule.pattern || rule.analyzer) {
        continue;
      }

      if (
        rule.allowedPatterns?.some((pattern) =>
          resetAndTest(pattern, line),
        )
      ) {
        continue;
      }

      if (!resetAndTest(rule.pattern, line)) {
        continue;
      }

      const next =
        (occurrence.get(rule.id) ?? 0) + 1;

      occurrence.set(rule.id, next);

      if (
        rule.maxOccurrencesPerFile &&
        next <= rule.maxOccurrencesPerFile
      ) {
        continue;
      }

      addFinding({
        lines,
        zeroBasedLineIndex: index,
        rule,

        finding: createFinding(
          rule,
          index + 1,
          line.trim(),
          {
            occurrenceCount: next,
          },
        ),

        findings,
        suppressedFindings,
      });
    }
  });

  return {
    content,
    findings,
    suppressedFindings,

    score: Math.max(
      0,
      100 -
        findings.reduce(
          (sum, finding) =>
            sum + finding.penalty,
          0,
        ),
    ),
  };
};

const scanProject = ({
  files,
  targetToTests,
  coverageByFile,
  config,
}) => {
  const rules = getRules(config);

  const behavior = files.map((file) => {
    const result = scanWithRules(
      file,
      rules.behavior,
    );

    return {
      file,
      relativeFile: toRelativePath(file),
      ...result,
    };
  });

  const testability = [
    ...targetToTests.entries(),
  ].map(([file, testFiles]) => {
    const coverage =
      coverageByFile.get(
        toRelativePath(file),
      ) ?? null;

    if (isFullyCovered(coverage)) {
      return {
        file,
        relativeFile: toRelativePath(file),
        testFiles,
        coverage,
        isFullyCovered: true,
        findings: [],
        suppressedFindings: [],
        score: 100,
      };
    }

    const result = scanWithRules(
      file,
      rules.testability,
    );

    return {
      file,
      relativeFile: toRelativePath(file),
      testFiles,
      coverage,
      isFullyCovered: false,
      ...result,
    };
  });

  const security = analyzeSecurity({
    files: files.filter(
      (file) =>
        !config.testFilePattern.test(file),
    ),

    config,
  });

  return {
    behavior,
    testability,
    security,
    rules,
  };
};

module.exports = {
  getRules,
  scanProject,
};
