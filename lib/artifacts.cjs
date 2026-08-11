const { existsSync, readFileSync, readdirSync, statSync } = require('node:fs');
const { join, normalize, relative } = require('node:path');

const decode = (value) => String(value)
  .replaceAll('&nbsp;', ' ').replaceAll('&amp;', '&').replaceAll('&lt;', '<')
  .replaceAll('&gt;', '>').replaceAll('&quot;', '"').replaceAll('&#39;', "'");
const strip = (value) => decode(String(value).replace(/<[^>]*>/g, '')).trim();
const rel = (file) => normalize(relative(process.cwd(), file)).replaceAll('\\', '/');

const getHtmlFiles = (dir) => {
  if (!existsSync(dir)) return [];
  const result = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const stats = statSync(full);
    if (stats.isDirectory()) result.push(...getHtmlFiles(full));
    else if (stats.isFile() && entry.endsWith('.html') && entry !== 'index.html') result.push(full);
  }
  return result;
};

const countMarkers = (value) => {
  const cbranch = value.match(/<span[^>]*class=["'][^"']*\bcbranch-no\b[^"']*["'][^>]*>/gi) ?? [];
  if (cbranch.length) return cbranch.length;
  return (value.match(/<span[^>]*class=["'][^"']*\bmissing-if-branch\b[^"']*["'][^>]*>\s*[EI]\s*<\/span>/gi) ?? []).length;
};

const scanCoverageHtml = (file, reportDir) => {
  const html = readFileSync(file, 'utf8');
  const lineCount = html.match(/<td class="line-count[\s\S]*?>([\s\S]*?)<\/td>/i)?.[1];
  const lineCoverage = html.match(/<td class="line-coverage[\s\S]*?>([\s\S]*?)<\/td>/i)?.[1];
  const code = html.match(/<td class="text"><pre[^>]*>([\s\S]*?)<\/pre>/i)?.[1];
  if (!lineCount || !lineCoverage || !code) return null;

  const nums = lineCount.match(/name=['"]L(\d+)['"]/g)?.map((v) => Number(v.match(/\d+/)[0])) ?? [];
  const coverageLines = lineCoverage.split('\n');
  const codeLines = code.split('\n');
  const lines = [];
  for (let i = 0; i < Math.min(nums.length, coverageLines.length, codeLines.length); i += 1) {
    const markers = countMarkers(coverageLines[i] + codeLines[i]);
    if (markers) lines.push({ line: nums[i], markers, code: strip(codeLines[i]) });
  }
  if (!lines.length) return null;
  const sourceFile = normalize(relative(reportDir, file)).replaceAll('\\', '/').replace(/\.html$/, '');
  return { file: sourceFile, htmlFile: rel(file), markers: lines.reduce((s, x) => s + x.markers, 0), lines };
};

const classifyMarkerLine = ({ artifactLine, result, exclusionRules }) => {
  const findings = result?.findings ?? [];
  const candidates = findings.filter((f) => f.line === artifactLine.line && f.coverageCandidate).length;
  const exclusion = exclusionRules.find((rule) => {
    if (rule.filePattern && !rule.filePattern.test(result?.relativeFile ?? '')) return false;
    if (rule.linePattern && !rule.linePattern.test(artifactLine.code)) return false;
    return Boolean(rule.filePattern || rule.linePattern);
  });
  const approvedExcluded = exclusion ? artifactLine.markers : 0;
  const fixableCandidates = Math.min(artifactLine.markers - approvedExcluded, candidates);
  const unclassified = Math.max(0, artifactLine.markers - approvedExcluded - fixableCandidates);
  return { ...artifactLine, approvedExcluded, exclusionReason: exclusion?.reason ?? null, fixableCandidates, unclassified };
};

const analyzeCoverageArtifacts = (testabilityResults, config) => {
  const reportDir = config.lcovReportDirs.map((p) => join(process.cwd(), p)).find(existsSync);
  if (!reportDir) return { source: null, eMarkers: 0, approvedExcluded: 0, fixableCandidates: 0, unclassified: 0, byFile: [] };
  const byResult = new Map(testabilityResults.map((r) => [r.relativeFile, r]));
  const artifacts = getHtmlFiles(reportDir).map((f) => scanCoverageHtml(f, reportDir)).filter(Boolean);
  const byFile = artifacts.map((artifact) => {
    const result = byResult.get(artifact.file);
    const lines = artifact.lines.map((line) => classifyMarkerLine({ artifactLine: line, result, exclusionRules: config.coverageExclusionRules }));
    return {
      ...artifact,
      lines,
      approvedExcluded: lines.reduce((s, x) => s + x.approvedExcluded, 0),
      fixableCandidates: lines.reduce((s, x) => s + x.fixableCandidates, 0),
      unclassified: lines.reduce((s, x) => s + x.unclassified, 0),
    };
  });
  return {
    source: rel(reportDir),
    eMarkers: byFile.reduce((s, x) => s + x.markers, 0),
    approvedExcluded: byFile.reduce((s, x) => s + x.approvedExcluded, 0),
    fixableCandidates: byFile.reduce((s, x) => s + x.fixableCandidates, 0),
    unclassified: byFile.reduce((s, x) => s + x.unclassified, 0),
    byFile,
  };
};

module.exports = { analyzeCoverageArtifacts };
