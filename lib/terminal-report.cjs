const SCORE_CONCERNS = [
  ['behavior', 'B'],
  ['testability', 'T'],
  ['security', 'S'],
];

const GREEN = '\x1b[32m';
const YELLOW = '\x1b[33m';
const RED = '\x1b[31m';
const GRAY = '\x1b[90m';
const RESET = '\x1b[0m';

const round = (value) =>
  Math.round(Number(value) * 100) / 100;

const isScore = (value) =>
  typeof value === 'number' &&
  Number.isFinite(value);

const average = (values) => {
  const scores = values.filter(isScore);

  if (!scores.length) {
    return null;
  }

  return round(
    scores.reduce(
      (sum, value) => sum + value,
      0,
    ) / scores.length,
  );
};

const formatScore = (value) =>
  isScore(value)
    ? `${round(value)}%`
    : 'N/A';

const colorText = (
  value,
  ansiColor,
  color = process.env.NO_COLOR == null,
) => color
  ? `${ansiColor}${value}${RESET}`
  : String(value);

const scoreColor = (value) => {
  if (!isScore(value)) {
    return GRAY;
  }

  if (value >= 80) {
    return GREEN;
  }

  if (value >= 50) {
    return YELLOW;
  }

  return RED;
};

const confidenceColor = (confidence) => {
  if (confidence === 'High') {
    return GREEN;
  }

  if (
    confidence === 'Needs Review' ||
    confidence === 'Moderate'
  ) {
    return YELLOW;
  }

  if (confidence === 'Blocked') {
    return RED;
  }

  return GRAY;
};

const healthColor = (health) => {
  if (
    health === 'Excellent' ||
    health === 'Strong' ||
    health === 'Healthy'
  ) {
    return GREEN;
  }

  if (
    health === 'Needs Review' ||
    health === 'Moderate'
  ) {
    return YELLOW;
  }

  if (health === 'At Risk') {
    return RED;
  }

  return GRAY;
};

const scoreBar = (
  value,
  label,
  {
    width = 24,
    indent = '',
    color = process.env.NO_COLOR == null,
  } = {},
) => {
  const normalized = isScore(value)
    ? Math.max(0, Math.min(100, value))
    : 0;

  const filled = isScore(value)
    ? Math.round((normalized / 100) * width)
    : 0;

  const bar =
    `${'█'.repeat(filled)}` +
    `${'░'.repeat(width - filled)}`;

  const barColor = scoreColor(value);

  const renderedBar = color
    ? `${barColor}${bar}${RESET}`
    : bar;

  return (
    `${indent}${renderedBar}` +
    `  ${formatScore(value).padStart(7, ' ')}  ${label}`
  );
};

const normalizeFile = (file) =>
  String(file ?? '')
    .replaceAll('\\', '/')
    .replace(/^\.\//, '')
    .replace(/^\/+/, '');

const buildFileScores = (scans) => {
  const files = new Map();

  for (const [concern] of SCORE_CONCERNS) {
    for (const result of scans?.[concern] ?? []) {
      const file = normalizeFile(
        result.relativeFile ?? result.file,
      );

      if (!file) {
        continue;
      }

      const entry = files.get(file) ?? {
        file,
        concerns: {},
      };

      if (isScore(result.score)) {
        entry.concerns[concern] = result.score;
      }

      files.set(file, entry);
    }
  }

  return [...files.values()]
    .map((entry) => ({
      ...entry,
      score: average(
        Object.values(entry.concerns),
      ),
    }))
    .sort((left, right) =>
      left.file.localeCompare(right.file),
    );
};

const createTree = (files) => {
  const root = {
    name: '.',
    directories: new Map(),
    files: [],
  };

  for (const file of files) {
    const parts = file.file.split('/').filter(Boolean);
    let directory = root;

    for (const part of parts.slice(0, -1)) {
      if (!directory.directories.has(part)) {
        directory.directories.set(part, {
          name: part,
          directories: new Map(),
          files: [],
        });
      }

      directory = directory.directories.get(part);
    }

    directory.files.push({
      ...file,
      name: parts.at(-1) ?? file.file,
    });
  }

  return root;
};

const populateDirectoryScores = (directory) => {
  const descendants = [...directory.files];

  for (const child of directory.directories.values()) {
    descendants.push(
      ...populateDirectoryScores(child),
    );
  }

  directory.score = average(
    descendants.map((file) => file.score),
  );
  directory.fileCount = descendants.length;

  return descendants;
};

const concernBreakdown = (concerns) => {
  const values = SCORE_CONCERNS
    .filter(([concern]) => isScore(concerns[concern]))
    .map(
      ([concern, abbreviation]) =>
        `${abbreviation} ${formatScore(concerns[concern])}`,
    );

  return values.length
    ? ` (${values.join(' · ')})`
    : '';
};

const renderTree = (root, width, color) => {
  const lines = [];

  const renderDirectory = (directory, depth) => {
    const prefix = '  '.repeat(depth);

    for (const child of [...directory.directories.values()].sort(
      (left, right) => left.name.localeCompare(right.name),
    )) {
      lines.push(
        scoreBar(
          child.score,
          `${prefix}${child.name}/ (${child.fileCount} file${
            child.fileCount === 1 ? '' : 's'
          })`,
          { width, color },
        ),
      );

      renderDirectory(child, depth + 1);
    }

    for (const file of [...directory.files].sort(
      (left, right) => left.name.localeCompare(right.name),
    )) {
      lines.push(
        scoreBar(
          file.score,
          `${prefix}${file.name}${concernBreakdown(file.concerns)}`,
          { width, color },
        ),
      );
    }
  };

  lines.push(
    scoreBar(
      root.score,
      `. (${root.fileCount} file${root.fileCount === 1 ? '' : 's'})`,
      { width, color },
    ),
  );
  renderDirectory(root, 1);

  return lines;
};

const testResultColor = (tests) => {
  if (tests?.total == null) {
    return GRAY;
  }

  if ((tests.failed ?? 0) > 0) {
    return RED;
  }

  if ((tests.skipped ?? 0) > 0) {
    return YELLOW;
  }

  return GREEN;
};

const findingColor = (summary) => {
  if (
    (summary?.fatal ?? 0) > 0 ||
    (summary?.errors ?? 0) > 0
  ) {
    return RED;
  }

  if ((summary?.findings ?? 0) > 0) {
    return YELLOW;
  }

  return GREEN;
};

const checkColor = (level) => {
  if (level === 'blocked') {
    return RED;
  }

  if (
    level === 'review' ||
    level === 'moderate'
  ) {
    return YELLOW;
  }

  return GRAY;
};

const formatCiReadout = ({
  passed,
  releaseConfidence,
  detail = '',
  color = process.env.NO_COLOR == null,
}) => {
  const status = passed ? 'PASS' : 'FAIL';
  const renderedStatus = colorText(
    status,
    passed ? GREEN : RED,
    color,
  );
  const renderedConfidence = colorText(
    releaseConfidence ?? 'Unknown',
    confidenceColor(releaseConfidence),
    color,
  );

  return (
    `GitLab CI readout: ${renderedStatus}` +
    ` releaseConfidence=${renderedConfidence}` +
    (detail ? ` ${detail}` : '')
  );
};

const formatCiSummary = ({
  scans,
  quality,
  artifacts,
  coverageFile = null,
  testResultsFile = null,
  width = 24,
  color = process.env.NO_COLOR == null,
}) => {
  const files = buildFileScores(scans);
  const tree = createTree(files);
  populateDirectoryScores(tree);

  const qualityScores = [
    ['Overall quality', quality.overallScore],
    ['Behavior', quality.behavior?.score],
    ['Testability', quality.testability?.score],
    ['Security', quality.security?.score],
    ['Test pass rate', quality.tests?.passRate],
  ];

  const coverageScores = [
    ['Adjusted average', quality.coverage?.adjustedAverage],
    ['Statements', quality.coverage?.adjusted?.statements],
    ['Branches', quality.coverage?.adjusted?.branches],
    ['Functions', quality.coverage?.adjusted?.functions],
    ['Lines', quality.coverage?.adjusted?.lines],
  ];

  const renderedFinding = (concern) => {
    const summary = quality[concern];
    const count = summary?.findings ?? 0;

    return `${concern} ${colorText(
      count,
      findingColor(summary),
      color,
    )}`;
  };

  const testCounts = quality.tests?.total == null
    ? 'N/A'
    : `${quality.tests.passed ?? 0} passed / ${quality.tests.total} total`;

  const lines = [
    'Quality Scanner CI Results',
    '--------------------------',
    '',
    'Quality scores',
    ...qualityScores.map(([label, score]) =>
      scoreBar(score, label, {
        width,
        indent: '  ',
        color,
      }),
    ),
    '',
    'Coverage (adjusted)',
    ...coverageScores.map(([label, score]) =>
      scoreBar(score, label, {
        width,
        indent: '  ',
        color,
      }),
    ),
    `  Raw average: ${colorText(
      formatScore(quality.coverage?.rawAverage),
      scoreColor(quality.coverage?.rawAverage),
      color,
    )}`,
    `  Artifact:    ${coverageFile ?? 'N/A'}`,
    '',
    `Scanned paths (${files.length} file${files.length === 1 ? '' : 's'})`,
    '  Path scores average the available behavior (B), testability (T), and security (S) file scores.',
    ...renderTree(tree, width, color).map((line) => `  ${line}`),
    '',
    `Release confidence: ${colorText(
      quality.releaseConfidence ?? 'Unknown',
      confidenceColor(quality.releaseConfidence),
      color,
    )}`,
    `Health:             ${colorText(
      quality.healthLabel ?? 'Unknown',
      healthColor(quality.healthLabel),
      color,
    )}`,
    `Test runner:        ${quality.tests?.runner ?? 'N/A'}`,
    `Test artifact:      ${testResultsFile ?? 'N/A'}`,
    `Tests:              ${colorText(
      testCounts,
      testResultColor(quality.tests),
      color,
    )}`,
    `Findings:           ${renderedFinding('behavior')} · ${renderedFinding('testability')} · ${renderedFinding('security')}`,
    `Coverage markers:   ${colorText(
      artifacts?.approvedExcluded ?? 0,
      GREEN,
      color,
    )} approved · ${colorText(
      artifacts?.fixableCandidates ?? 0,
      (artifacts?.fixableCandidates ?? 0) > 0
        ? YELLOW
        : GREEN,
      color,
    )} fixable · ${colorText(
      artifacts?.unclassified ?? 0,
      (artifacts?.unclassified ?? 0) > 0
        ? YELLOW
        : GREEN,
      color,
    )} unclassified`,
  ];

  if (quality.releaseChecks?.length) {
    lines.push('', 'Release checks');

    for (const check of quality.releaseChecks) {
      const text =
        `[${String(check.level ?? 'info').toUpperCase()}] ${check.message}`;

      lines.push(
        `  ${colorText(
          text,
          checkColor(check.level),
          color,
        )}`,
      );
    }
  }

  return lines.join('\n');
};

module.exports = {
  buildFileScores,
  formatCiReadout,
  formatCiSummary,
  scoreBar,
};
