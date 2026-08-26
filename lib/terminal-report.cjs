const SCORE_CONCERNS = [
  ['behavior', 'B'],
  ['testability', 'T'],
  ['security', 'S'],
];

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

const scoreBar = (
  value,
  label,
  { width = 24, indent = '' } = {},
) => {
  const normalized = isScore(value)
    ? Math.max(0, Math.min(100, value))
    : 0;

  const filled = isScore(value)
    ? Math.round((normalized / 100) * width)
    : 0;

  return (
    `${indent}${'█'.repeat(filled)}${'░'.repeat(width - filled)}` +
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

const renderTree = (root, width) => {
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
          { width },
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
          { width },
        ),
      );
    }
  };

  lines.push(
    scoreBar(
      root.score,
      `. (${root.fileCount} file${root.fileCount === 1 ? '' : 's'})`,
      { width },
    ),
  );
  renderDirectory(root, 1);

  return lines;
};

const formatCiSummary = ({
  scans,
  quality,
  artifacts,
  coverageFile = null,
  testResultsFile = null,
  width = 24,
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

  const findingCount = (concern) =>
    quality[concern]?.findings ?? 0;

  const testCounts = quality.tests?.total == null
    ? 'N/A'
    : `${quality.tests.passed ?? 0} passed / ${quality.tests.total} total`;

  const lines = [
    'Quality Scanner CI Results',
    '--------------------------',
    '',
    'Quality scores',
    ...qualityScores.map(([label, score]) =>
      scoreBar(score, label, { width, indent: '  ' }),
    ),
    '',
    'Coverage (adjusted)',
    ...coverageScores.map(([label, score]) =>
      scoreBar(score, label, { width, indent: '  ' }),
    ),
    `  Raw average: ${formatScore(quality.coverage?.rawAverage)}`,
    `  Artifact:    ${coverageFile ?? 'N/A'}`,
    '',
    `Scanned paths (${files.length} file${files.length === 1 ? '' : 's'})`,
    '  Path scores average the available behavior (B), testability (T), and security (S) file scores.',
    ...renderTree(tree, width).map((line) => `  ${line}`),
    '',
    `Release confidence: ${quality.releaseConfidence ?? 'Unknown'}`,
    `Health:             ${quality.healthLabel ?? 'Unknown'}`,
    `Test runner:        ${quality.tests?.runner ?? 'N/A'}`,
    `Test artifact:      ${testResultsFile ?? 'N/A'}`,
    `Tests:              ${testCounts}`,
    `Findings:           behavior ${findingCount('behavior')} · testability ${findingCount('testability')} · security ${findingCount('security')}`,
    `Coverage markers:   ${artifacts?.approvedExcluded ?? 0} approved · ${artifacts?.fixableCandidates ?? 0} fixable · ${artifacts?.unclassified ?? 0} unclassified`,
  ];

  if (quality.releaseChecks?.length) {
    lines.push('', 'Release checks');

    for (const check of quality.releaseChecks) {
      lines.push(
        `  [${String(check.level ?? 'info').toUpperCase()}] ${check.message}`,
      );
    }
  }

  return lines.join('\n');
};

module.exports = {
  buildFileScores,
  formatCiSummary,
  scoreBar,
};
