const { existsSync, mkdirSync, readFileSync, writeFileSync } = require('node:fs');
const { join } = require('node:path');

const { renderHtml } = require('./report-html.cjs');

/* HTML rendering lives in report-html.cjs (renderHtml + helpers). */

const ensure = (dir) => {
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
};

const writeJson = (file, value) =>
  writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);

const getSourceContext = (file, line, radius = 4) => {
  if (!file || !Number.isInteger(line) || line < 1 || !existsSync(file)) {
    return null;
  }

  try {
    const lines = readFileSync(file, 'utf8').split(/\r?\n/);
    const startLine = Math.max(1, line - radius);
    const endLine = Math.min(lines.length, line + radius);

    return {
      startLine,
      endLine,
      lines: lines.slice(startLine - 1, endLine).map((code, index) => ({
        line: startLine + index,
        code,
        finding: startLine + index === line,
      })),
    };
  } catch {
    return null;
  }
};

const concernReport = (kind, results, extra = {}) => ({
  kind,
  generatedAt: new Date().toISOString(),

  summary: {
    scannedFiles: results.length,
    filesWithFindings: results.filter((result) => result.findings.length).length,
    totalFindings: results.reduce(
      (sum, result) => sum + result.findings.length,
      0,
    ),
    averageScore: results.length
      ? results.reduce((sum, result) => sum + result.score, 0) / results.length
      : 100,
    ...extra,
  },

  results: results.map((result) => ({
    file: result.relativeFile,
    score: result.score,
    coverage: result.coverage ?? undefined,

    testedBy: result.testFiles?.map((file) =>
      file
        .replace(process.cwd(), '')
        .replace(/^[/\\]/, '')
        .replaceAll('\\', '/'),
    ),

    endpoints: result.endpoints ?? undefined,

    findings: result.findings.map((finding) => ({
      ...finding,
      source: getSourceContext(result.file, finding.line),
    })),
  })),
});

const writeReports = ({
  scans,
  artifacts,
  quality,
  config,
  testFiles,
}) => {
  const reportDir = join(
    process.cwd(),
    config.reportDir,
  );

  ensure(reportDir);

  const behavior = concernReport(
    'behavior',
    scans.behavior,
  );

  const testability = concernReport(
    'testability',
    scans.testability,
    {
      testFiles: testFiles.length,
      coverageArtifacts: artifacts,

      untestedTargets:
        scans.testability.filter(
          (result) =>
            !result.isFullyCovered &&
            result.testFiles.length === 0,
        ).length,

      indirectlyCoveredTargets:
        scans.testability.filter(
          (result) =>
            result.isFullyCovered &&
            result.testFiles.length === 0,
        ).length,
    },
  );

  const security = concernReport(
    'security',
    scans.security,
    {
      endpoints:
        scans.security.reduce(
          (sum, result) =>
            sum +
            (result.endpoints?.length ?? 0),
          0,
        ),

      protectedEndpoints:
        scans.security.reduce(
          (sum, result) =>
            sum +
            (
              result.endpoints?.filter(
                (endpoint) =>
                  endpoint.protected,
              ).length ?? 0
            ),
          0,
        ),

      publicEndpoints:
        scans.security.reduce(
          (sum, result) =>
            sum +
            (
              result.endpoints?.filter(
                (endpoint) =>
                  endpoint.public,
              ).length ?? 0
            ),
          0,
        ),
    },
  );

  const overall = {
    kind: 'quality',
    generatedAt: new Date().toISOString(),

    summary: quality,

    behavior: behavior.summary,
    testability: testability.summary,
    security: security.summary,

    coverageArtifacts: artifacts,
  };

  const paths = {
    behavior: join(
      reportDir,
      'behavior.json',
    ),

    testability: join(
      reportDir,
      'testability.json',
    ),

    security: join(
      reportDir,
      'security.json',
    ),

    quality: join(
      reportDir,
      'quality.json',
    ),

    html: join(
      reportDir,
      'index.html',
    ),
  };

  writeJson(
    paths.behavior,
    behavior,
  );

  writeJson(
    paths.testability,
    testability,
  );

  writeJson(
    paths.security,
    security,
  );

  writeJson(
    paths.quality,
    overall,
  );

  writeFileSync(
    paths.html,
    renderHtml({
      behavior,
      testability,
      security,
      quality,
      artifacts,
    }),
  );

  return paths;
};

module.exports = {
  concernReport,
  getSourceContext,
  writeReports,
};

