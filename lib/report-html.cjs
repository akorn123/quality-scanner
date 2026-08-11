const esc = (value) =>
  String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');

const round = (value) => Math.round(Number(value ?? 0) * 100) / 100;

const severityClass = (severity) => {
  if (severity === 'fatal' || severity === 'error') return 'error';
  if (severity === 'warning') return 'warning';
  return 'info';
};

const confidenceClass = (confidence) => {
  if (confidence === 'Blocked') return 'error';

  if (confidence === 'Needs Review' || confidence === 'Moderate') {
    return 'warning';
  }

  if (confidence === 'High') return 'success';

  return 'neutral';
};

const healthClass = (health) => {
  if (health === 'Excellent' || health === 'Strong') return 'success';
  if (health === 'Healthy') return 'primary';
  if (health === 'Needs Review') return 'warning';
  if (health === 'At Risk') return 'error';

  return 'neutral';
};

const metricCard = ({
  title,
  value,
  subtitle = '',
  chip = null,
  chipClass = 'neutral',
  href = null,
}) => {
  const content = `
    <div class="metric-title">${esc(title)}</div>

    <div class="metric-value-row">
      <span class="metric-value">${esc(value)}</span>

      ${
        chip
          ? `<span class="chip ${esc(chipClass)}">${esc(chip)}</span>`
          : ''
      }
    </div>

    ${
      subtitle
        ? `<div class="metric-subtitle">${esc(subtitle)}</div>`
        : ''
    }
  `;

  if (!href) {
    return `
      <div class="metric-card">
        ${content}
      </div>
    `;
  }

  return `
    <a
      class="metric-card metric-card-link"
      href="${esc(href)}"
      title="View release confidence details"
    >
      ${content}
    </a>
  `;
};

const scoreBar = (label, value) => {
  const numeric =
    typeof value === 'number' && Number.isFinite(value)
      ? Math.max(0, Math.min(100, value))
      : 0;

  const barClass =
    numeric >= 90
      ? 'success'
      : numeric >= 80
        ? 'primary'
        : numeric >= 70
          ? 'warning'
          : 'error';

  return `
    <div class="score-row">
      <div class="score-label">
        <span>${esc(label)}</span>
        <strong>
          ${value == null ? 'N/A' : `${esc(round(value))}%`}
        </strong>
      </div>

      <div class="score-track">
        <div
          class="score-fill ${barClass}"
          style="width:${numeric}%"
        ></div>
      </div>
    </div>
  `;
};

const flattenFindings = (report) =>
  report.results.flatMap((result) =>
    result.findings.map((finding) => ({
      result,
      finding,
    })),
  );

const renderSeverityChips = (report) => {
  const findings = flattenFindings(report).map(({ finding }) => finding);

  const counts = {
    fatal: findings.filter((finding) => finding.severity === 'fatal').length,
    errors: findings.filter((finding) => finding.severity === 'error').length,
    warnings: findings.filter((finding) => finding.severity === 'warning').length,
    info: findings.filter((finding) => finding.severity === 'info').length,
  };

  return `
    <div class="chip-row">
      ${
        counts.fatal
          ? `<span class="chip error">Fatal: ${counts.fatal}</span>`
          : ''
      }

      <span class="chip ${counts.errors ? 'error' : 'success'}">
        Errors: ${counts.errors}
      </span>

      <span class="chip ${counts.warnings ? 'warning' : 'neutral'}">
        Warnings: ${counts.warnings}
      </span>

      <span class="chip neutral">
        Info: ${counts.info}
      </span>
    </div>
  `;
};

const findingId = (concern, index) =>
  `finding-${concern}-${index + 1}`;

const renderFindingRows = (report) => {
  let index = 0;

  return report.results
    .flatMap((result) =>
      result.findings.map((finding) => {
        const id = findingId(report.kind, index);
        index += 1;

        return `
          <tr>
            <td class="file-cell">
              <a
                class="file-link"
                href="#${id}"
                title="View source around line ${finding.line}"
              >
                ${esc(result.file)}
              </a>

              <div class="file-line-number">
                Line ${finding.line}
              </div>
            </td>

            <td>
              <span class="chip ${severityClass(finding.severity)} compact">
                ${esc(finding.severity)}
              </span>
            </td>

            <td>
              <code>${esc(finding.id)}</code>
            </td>

            <td>${esc(finding.category)}</td>

            <td>
              <code>${esc(finding.code)}</code>
            </td>
          </tr>
        `;
      }),
    )
    .join('');
};

const renderSourceLine = (line) => `
  <div class="source-line${line.finding ? ' finding-line' : ''}">
    <span class="line-number">${line.line}</span>
    <code>${esc(line.code || ' ')}</code>
  </div>
`;

const renderSourceFindings = (report) => {
  let index = 0;

  return report.results
    .flatMap((result) =>
      result.findings.map((finding) => {
        const id = findingId(report.kind, index);
        index += 1;

        const source = finding.source;

        return `
          <article class="source-card" id="${id}">
            <div class="source-card-header">
              <div>
                <div class="source-path">
                  ${esc(result.file)}:${finding.line}
                </div>

                <div class="source-rule">
                  ${esc(finding.id)} · ${esc(finding.category)}
                </div>
              </div>

              <span class="chip ${severityClass(finding.severity)}">
                ${esc(finding.severity)}
              </span>
            </div>

            ${
              source
                ? `
                  <div class="source-code">
                    ${source.lines.map(renderSourceLine).join('')}
                  </div>
                `
                : `
                  <div class="empty-note">
                    Source context was unavailable when the report was generated.
                  </div>
                `
            }

            <div class="source-explanation">
              <strong>Why:</strong>
              ${esc(finding.description)}
            </div>

            <div class="source-explanation">
              <strong>Suggested response:</strong>
              ${esc(finding.suggestion)}
            </div>

            <a
              class="back-link"
              href="#${report.kind}-findings"
            >
              Back to ${esc(report.kind)} findings ↑
            </a>
          </article>
        `;
      }),
    )
    .join('');
};

const renderFindingsSection = (
  title,
  report,
  intro = '',
) => {
  const rows = renderFindingRows(report);
  const sourceFindings = renderSourceFindings(report);

  return `
    <section
      id="${esc(report.kind)}-findings"
      class="report-section"
    >
      <div class="section-heading">
        <div>
          <h2>${esc(title)}</h2>

          ${
            intro
              ? `<p class="muted">${esc(intro)}</p>`
              : ''
          }
        </div>

        ${renderSeverityChips(report)}
      </div>

      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>File / line</th>
              <th>Severity</th>
              <th>Rule</th>
              <th>Category</th>
              <th>Code</th>
              <th>Why</th>
              <th>Suggestion</th>
            </tr>
          </thead>

          <tbody>
            ${
              rows ||
              `
                <tr>
                  <td colspan="7" class="empty-note">
                    No findings.
                  </td>
                </tr>
              `
            }
          </tbody>
        </table>
      </div>

      ${
        sourceFindings
          ? `
            <div class="source-results">
              <h3>Finding Source</h3>

              <p class="muted">
                Click any file path above to jump to the exact scanned
                source context.
              </p>

              ${sourceFindings}
            </div>
          `
          : ''
      }
    </section>
  `;
};

const getBlockingFindingRows = (
  report,
  severities,
) => {
  if (!report || !Array.isArray(severities)) {
    return [];
  }

  let index = 0;
  const rows = [];

  for (const result of report.results) {
    for (const finding of result.findings) {
      const id = findingId(report.kind, index);
      index += 1;

      if (!severities.includes(finding.severity)) {
        continue;
      }

      rows.push({
        href: `#${id}`,
        location: `${result.file}:${finding.line}`,
        rule: finding.id,
        severity: finding.severity,
        description: finding.description,
      });
    }
  }

  return rows;
};

const renderBlockingRelease = ({
  quality,
  behavior,
  security,
}) => {
  const blockingChecks = quality.releaseChecks.filter(
    (check) => check.level === 'blocked',
  );

  if (blockingChecks.length === 0) {
    return `
      <div class="empty-note success-note">
        No checks are currently blocking release.
      </div>
    `;
  }

  return blockingChecks
    .map((check) => {
      const report =
        check.concern === 'behavior'
          ? behavior
          : check.concern === 'security'
            ? security
            : null;

      const findings = getBlockingFindingRows(
        report,
        check.severities,
      );

      const findingHtml = findings.length
        ? `
          <div class="blocking-findings">
            ${findings
              .map(
                (finding) => `
                  <a
                    class="blocking-finding"
                    href="${finding.href}"
                  >
                    <span class="blocking-location">
                      ${esc(finding.location)}
                    </span>

                    <span class="blocking-rule">
                      ${esc(finding.rule)}
                    </span>

                    <span class="chip ${severityClass(
                      finding.severity,
                    )} compact">
                      ${esc(finding.severity)}
                    </span>

                    <span class="blocking-description">
                      ${esc(finding.description)}
                    </span>
                  </a>
                `,
              )
              .join('')}
          </div>
        `
        : `
          <div class="blocking-summary-note">
            ${esc(check.message)}
          </div>
        `;

      return `
        <article
          class="blocking-check"
          id="release-check-${esc(check.id ?? 'blocked')}"
        >
          <div class="blocking-check-header">
            <span class="chip error">BLOCKED</span>

            <div>
              <div class="blocking-title">
                ${esc(check.name)}
              </div>

              <div class="muted">
                ${esc(check.message)}
              </div>
            </div>
          </div>

          ${findingHtml}
        </article>
      `;
    })
    .join('');
};

const renderReleaseChecks = (quality) => {
  if (!quality.releaseChecks.length) {
    return `
      <div class="empty-note success-note">
        No significant release-confidence issues detected.
      </div>
    `;
  }

  return quality.releaseChecks
    .map((check) => {
      const cssClass =
        check.level === 'blocked'
          ? 'error'
          : check.level === 'review'
            ? 'warning'
            : check.level === 'pass'
              ? 'success'
              : 'info';

      const label =
        check.level === 'blocked'
          ? 'BLOCKED'
          : check.level === 'review'
            ? 'REVIEW'
            : check.level === 'pass'
              ? 'PASS'
              : 'INFO';

      return `
        <div class="release-check">
          <span class="chip ${cssClass}">
            ${label}
          </span>

          <div>
            <strong>${esc(check.name)}</strong>
            <div class="muted">
              ${esc(check.message)}
            </div>
          </div>
        </div>
      `;
    })
    .join('');
};

const renderHtml = ({
  behavior,
  testability,
  security,
  quality,
  artifacts,
}) => {
  const generatedAt = new Date().toLocaleString();

  const blockingChecks = quality.releaseChecks.filter(
    (check) => check.level === 'blocked',
  );

  const behaviorFindings =
    behavior.summary.totalFindings ??
    behavior.summary.findings ??
    0;

  const testabilityFindings =
    testability.summary.totalFindings ??
    testability.summary.findings ??
    0;

  const securityFindings =
    security.summary.totalFindings ??
    security.summary.findings ??
    0;

  const releaseChecks = renderReleaseChecks(quality);

  return `
<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">

<meta
  name="viewport"
  content="width=device-width, initial-scale=1"
>

<title>Quality Scanner</title>

<style>
:root {
  --primary: #2563eb;
  --primary-dark: #1d4ed8;
  --primary-soft: #eff6ff;

  --success: #16a34a;
  --success-soft: #f0fdf4;

  --warning: #d97706;
  --warning-soft: #fffbeb;

  --error: #dc2626;
  --error-soft: #fef2f2;

  --info: #0284c7;
  --info-soft: #f0f9ff;

  --background: #f6f8fb;
  --surface: #ffffff;

  --text: #111827;
  --muted: #64748b;
  --divider: #e2e8f0;

  --code-bg: #f8fafc;

  --shadow:
    0 1px 2px rgba(15, 23, 42, 0.04),
    0 4px 14px rgba(15, 23, 42, 0.04);
}

* {
  box-sizing: border-box;
}

html {
  scroll-behavior: smooth;
  scroll-padding-top: 24px;
}

body {
  margin: 0;

  color: var(--text);

  background:
    radial-gradient(
      circle at top left,
      rgba(37, 99, 235, 0.10),
      transparent 28rem
    ),
    var(--background);

  font-family:
    Inter,
    ui-sans-serif,
    system-ui,
    -apple-system,
    BlinkMacSystemFont,
    "Segoe UI",
    sans-serif;
}

a {
  color: var(--primary);
}

.report-shell {
  display: grid;
  grid-template-columns: 235px minmax(0, 1fr);
  gap: 28px;

  max-width: 1660px;
  margin: 0 auto;

  padding:
    28px
    28px
    64px;
}

.report-nav {
  position: sticky;
  top: 20px;

  align-self: start;

  padding: 16px;

  background:
    rgba(255, 255, 255, 0.94);

  border:
    1px solid
    rgba(226, 232, 240, 0.95);

  border-radius: 16px;

  box-shadow: var(--shadow);

  backdrop-filter: blur(12px);
}

.report-nav-title {
  padding:
    2px
    10px
    10px;

  color: var(--muted);

  font-size: 0.72rem;
  font-weight: 800;

  text-transform: uppercase;
  letter-spacing: 0.08em;
}

.report-nav-links {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.report-nav a {
  display: flex;
  align-items: center;
  justify-content: space-between;

  gap: 8px;

  padding:
    9px
    10px;

  color: #334155;

  border-radius: 9px;

  font-size: 0.86rem;
  font-weight: 650;

  text-decoration: none;

  transition:
    background 120ms ease,
    color 120ms ease;
}

.report-nav a:hover {
  color: var(--primary);

  background: var(--primary-soft);
}

.nav-count {
  min-width: 22px;

  padding:
    2px
    6px;

  color: #475569;
  background: #f1f5f9;

  border-radius: 999px;

  font-size: 0.72rem;
  font-weight: 800;

  text-align: center;
}

.page {
  min-width: 0;
}

.hero {
  margin-bottom: 24px;
}

.hero h1 {
  margin:
    0
    0
    4px;

  font-size:
    clamp(
      2rem,
      4vw,
      3rem
    );

  letter-spacing: -0.04em;
}

.muted {
  color: var(--muted);
}

.metrics {
  display: grid;

  grid-template-columns:
    repeat(
      4,
      minmax(0, 1fr)
    );

  gap: 16px;

  margin-bottom: 24px;
}

.metric-card {
  display: block;

  min-height: 148px;

  padding: 20px;

  color: inherit;
  background: var(--surface);

  border:
    1px solid
    var(--divider);

  border-radius: 16px;

  box-shadow: var(--shadow);

  text-decoration: none;
}

.metric-card-link {
  cursor: pointer;

  transition:
    transform 120ms ease,
    border-color 120ms ease,
    box-shadow 120ms ease;
}

.metric-card-link:hover {
  transform: translateY(-2px);

  border-color:
    rgba(37, 99, 235, 0.45);

  box-shadow:
    0 8px 24px
    rgba(37, 99, 235, 0.10);
}

.metric-card-link:hover .metric-value {
  color: var(--primary);
}

.metric-title {
  margin-bottom: 12px;

  color: var(--muted);

  font-size: 0.88rem;
  font-weight: 650;
}

.metric-value-row {
  display: flex;
  align-items: center;
  flex-wrap: wrap;

  gap: 10px;
}

.metric-value {
  font-size: 2rem;
  font-weight: 760;

  letter-spacing: -0.035em;
}

.metric-subtitle {
  margin-top: 12px;

  color: var(--muted);

  font-size: 0.82rem;
  line-height: 1.45;
}

.metric-card-link .metric-subtitle {
  color: var(--primary);
  font-weight: 650;
}

.chip {
  display: inline-flex;
  align-items: center;

  width: max-content;

  padding:
    5px
    9px;

  border-radius: 999px;

  font-size: 0.72rem;
  font-weight: 800;

  line-height: 1;

  text-transform: uppercase;
  letter-spacing: 0.025em;
}

.chip.compact {
  padding:
    4px
    7px;

  font-size: 0.67rem;
}

.chip.primary {
  color: #1d4ed8;
  background: #dbeafe;
}

.chip.success {
  color: #15803d;
  background: #dcfce7;
}

.chip.warning {
  color: #b45309;
  background: #fef3c7;
}

.chip.error {
  color: #b91c1c;
  background: #fee2e2;
}

.chip.info {
  color: #0369a1;
  background: #e0f2fe;
}

.chip.neutral {
  color: #475569;
  background: #f1f5f9;
}

.report-section,
section {
  scroll-margin-top: 24px;

  margin-bottom: 24px;

  padding: 22px;

  background: var(--surface);

  border:
    1px solid
    var(--divider);

  border-radius: 16px;

  box-shadow: var(--shadow);
}

section h2 {
  margin:
    0
    0
    8px;

  font-size: 1.25rem;
}

section h3 {
  margin:
    24px
    0
    8px;
}

.two-column {
  display: grid;

  grid-template-columns:
    repeat(
      2,
      minmax(0, 1fr)
    );

  gap: 18px;
}

.score-stack {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.score-row {
  display: flex;
  flex-direction: column;
  gap: 7px;
}

.score-label {
  display: flex;
  justify-content: space-between;

  gap: 16px;

  font-size: 0.86rem;
}

.score-track {
  height: 9px;

  overflow: hidden;

  background: #e2e8f0;

  border-radius: 999px;
}

.score-fill {
  height: 100%;

  border-radius: 999px;
}

.score-fill.primary {
  background: var(--primary);
}

.score-fill.success {
  background: var(--success);
}

.score-fill.warning {
  background: var(--warning);
}

.score-fill.error {
  background: var(--error);
}

.accountability {
  display: grid;

  grid-template-columns:
    repeat(
      4,
      minmax(0, 1fr)
    );

  gap: 14px;

  margin-top: 16px;
}

.small-card {
  padding: 16px;

  background: #f8fafc;

  border:
    1px solid
    var(--divider);

  border-radius: 12px;
}

.small-label {
  color: var(--muted);

  font-size: 0.78rem;
}

.small-value {
  margin-top: 4px;

  font-size: 1.65rem;
  font-weight: 760;
}

.section-heading {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;

  gap: 20px;

  margin-bottom: 16px;
}

.chip-row {
  display: flex;
  flex-wrap: wrap;

  gap: 7px;
}

.release-checks {
  display: flex;
  flex-direction: column;

  gap: 10px;
}

.release-check {
  display: grid;

  grid-template-columns:
    auto
    minmax(0, 1fr);

  gap: 12px;

  align-items: flex-start;

  padding: 12px;

  border:
    1px solid
    var(--divider);

  border-radius: 10px;
}

.blocking-check {
  overflow: hidden;

  margin-top: 14px;

  border:
    1px solid
    #fecaca;

  border-radius: 14px;

  background: #fff;
}

.blocking-check-header {
  display: flex;
  align-items: flex-start;

  gap: 12px;

  padding: 16px;

  background: var(--error-soft);

  border-bottom:
    1px solid
    #fecaca;
}

.blocking-title {
  margin-bottom: 3px;

  font-size: 1rem;
  font-weight: 800;
}

.blocking-summary-note {
  padding: 16px;
}

.blocking-findings {
  display: flex;
  flex-direction: column;
}

.blocking-finding {
  display: grid;

  grid-template-columns:
    minmax(220px, 1.4fr)
    minmax(180px, 1fr)
    auto
    minmax(280px, 2fr);

  gap: 12px;

  align-items: center;

  padding:
    12px
    16px;

  color: inherit;

  border-bottom:
    1px solid
    var(--divider);

  text-decoration: none;
}

.blocking-finding:last-child {
  border-bottom: 0;
}

.blocking-finding:hover {
  background: var(--primary-soft);
}

.blocking-location {
  color: var(--primary);

  font-family:
    ui-monospace,
    SFMono-Regular,
    Menlo,
    Monaco,
    Consolas,
    monospace;

  font-size: 0.8rem;
  font-weight: 750;

  word-break: break-word;
}

.blocking-rule {
  font-family:
    ui-monospace,
    SFMono-Regular,
    Menlo,
    Monaco,
    Consolas,
    monospace;

  font-size: 0.77rem;
}

.blocking-description {
  color: #475569;

  font-size: 0.82rem;
}

.table-wrap {
  overflow: auto;

  border:
    1px solid
    var(--divider);

  border-radius: 12px;
}

table {
  width: 100%;

  border-collapse: collapse;

  font-size: 0.82rem;
}

th {
  padding:
    10px
    12px;

  color: #475569;
  background: #f8fafc;

  border-bottom:
    1px solid
    var(--divider);

  text-align: left;

  font-size: 0.74rem;

  text-transform: uppercase;
  letter-spacing: 0.035em;
}

td {
  padding:
    11px
    12px;

  border-bottom:
    1px solid
    var(--divider);

  vertical-align: top;
}

tbody tr:last-child td {
  border-bottom: 0;
}

tbody tr:hover {
  background: #fafcff;
}

code {
  font-family:
    ui-monospace,
    SFMono-Regular,
    Menlo,
    Monaco,
    Consolas,
    "Liberation Mono",
    monospace;
}

.file-cell {
  min-width: 220px;
  width: 220px;
}

.file-link {
  display: block;

  color: var(--primary);

  font-family:
    ui-monospace,
    SFMono-Regular,
    Menlo,
    Monaco,
    Consolas,
    monospace;

  font-size: 0.8rem;
  font-weight: 700;
  line-height: 1.4;

  text-decoration: none;

  overflow-wrap: normal;
  word-break: normal;
}

.file-link:hover {
  text-decoration: underline;
}

.file-line-number {
  margin-top: 4px;

  color: var(--muted);

  font-size: 0.72rem;
  font-weight: 650;
}

.file-link:hover {
  text-decoration: underline;
}

.source-results {
  margin-top: 26px;
}

.source-card {
  scroll-margin-top: 24px;

  overflow: hidden;

  margin-top: 14px;

  background: #fff;

  border:
    1px solid
    var(--divider);

  border-radius: 14px;
}

.source-card:target {
  border-color: var(--primary);

  box-shadow:
    0
    0
    0
    3px
    rgba(37, 99, 235, 0.12);
}

.source-card-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;

  gap: 20px;

  padding:
    14px
    16px;

  border-bottom:
    1px solid
    var(--divider);
}

.source-path {
  font-weight: 750;

  word-break: break-word;
}

.source-rule {
  margin-top: 2px;

  color: var(--muted);

  font-size: 0.8rem;
}

.source-code {
  overflow: auto;

  padding:
    9px
    0;

  background: var(--code-bg);
}

.source-line {
  display: grid;

  grid-template-columns:
    58px
    minmax(0, 1fr);

  min-width: max-content;

  font-family:
    ui-monospace,
    SFMono-Regular,
    Menlo,
    Monaco,
    Consolas,
    "Liberation Mono",
    monospace;

  font-size: 0.8rem;
}

.source-line code {
  padding:
    1px
    16px
    1px
    10px;

  white-space: pre;
}

.line-number {
  padding:
    1px
    10px;

  color: #94a3b8;

  border-right:
    1px solid
    var(--divider);

  text-align: right;

  user-select: none;
}

.finding-line {
  background: #fff7ed;
}

.finding-line .line-number {
  color: var(--error);

  font-weight: 800;
}

.finding-line code {
  padding-left: 7px;

  border-left:
    3px solid
    var(--error);
}

.source-explanation {
  padding:
    10px
    16px
    0;

  font-size: 0.86rem;
}

.back-link {
  display: inline-block;

  padding:
    12px
    16px
    15px;

  font-size: 0.82rem;
  font-weight: 700;

  text-decoration: none;
}

.empty-note {
  padding: 12px;

  color: var(--muted);
}

.success-note {
  color: #15803d;
  background: var(--success-soft);

  border-radius: 10px;
}

.raw-links {
  display: flex;
  flex-wrap: wrap;

  gap: 16px;
}

.raw-links a {
  font-weight: 700;

  text-decoration: none;
}

.raw-links a:hover {
  text-decoration: underline;
}

@media (max-width: 1100px) {
  .report-shell {
    grid-template-columns: 1fr;

    padding:
      0
      20px
      48px;
  }

  .report-nav {
    top: 0;
    z-index: 20;

    overflow-x: auto;

    margin:
      0
      -20px;

    padding:
      9px
      20px;

    border-radius:
      0
      0
      14px
      14px;
  }

  .report-nav-title {
    display: none;
  }

  .report-nav-links {
    display: flex;
    flex-direction: row;

    gap: 6px;

    min-width: max-content;
  }

  .report-nav a {
    padding:
      8px
      10px;

    background:
      rgba(255, 255, 255, 0.7);

    border:
      1px solid
      transparent;
  }

  .page {
    padding-top: 20px;
  }

  .metrics {
    grid-template-columns:
      repeat(
        2,
        1fr
      );
  }

  .accountability {
    grid-template-columns:
      repeat(
        2,
        1fr
      );
  }

  .two-column {
    grid-template-columns: 1fr;
  }

  .blocking-finding {
    grid-template-columns:
      1fr
      auto;
  }

  .blocking-rule,
  .blocking-description {
    grid-column:
      1
      /
      -1;
  }
}

@media (max-width: 640px) {
  .report-shell {
    padding:
      0
      14px
      40px;
  }

  .report-nav {
    margin:
      0
      -14px;

    padding-left: 14px;
    padding-right: 14px;
  }

  .page {
    padding:
      18px
      0
      0;
  }

  .metrics,
  .accountability {
    grid-template-columns: 1fr;
  }

  .section-heading {
    display: block;
  }

  .chip-row {
    margin-top: 12px;
  }
}
</style>
</head>

<body>

<div class="report-shell">

  <nav
    class="report-nav"
    aria-label="Report sections"
  >
    <div class="report-nav-title">
      Jump To
    </div>

    <div class="report-nav-links">

      <a href="#overview">
        Overview
      </a>

      <a href="#coverage">
        Coverage
      </a>

      <a href="#coverage-accountability">
        Coverage Accountability
      </a>

      <a href="#blocking-release">
        <span>Blocking Release</span>
        <span class="nav-count">
          ${blockingChecks.length}
        </span>
      </a>

      <a href="#release-confidence-checks">
        <span>Release Checks</span>
        <span class="nav-count">
          ${quality.releaseChecks.length}
        </span>
      </a>

      <a href="#behavior-findings">
        <span>Behavior</span>
        <span class="nav-count">
          ${behaviorFindings}
        </span>
      </a>

      <a href="#testability-findings">
        <span>Testability</span>
        <span class="nav-count">
          ${testabilityFindings}
        </span>
      </a>

      <a href="#security-findings">
        <span>Security</span>
        <span class="nav-count">
          ${securityFindings}
        </span>
      </a>

      <a href="#raw-reports">
        Raw Reports
      </a>

    </div>
  </nav>

  <main
    class="page"
    id="overview"
  >

    <header class="hero">
      <h1>Quality Scanner</h1>

      <p class="muted">
        Generated ${esc(generatedAt)} · Current scan only
      </p>
    </header>

    <div class="metrics">

      ${metricCard({
        title: 'Overall Quality',
        value:
          quality.overallScore == null
            ? 'N/A'
            : `${quality.overallScore}%`,
        subtitle: quality.healthLabel,
        chip: quality.healthLabel,
        chipClass: healthClass(
          quality.healthLabel,
        ),
      })}

      ${metricCard({
        title: 'Release Confidence',
        value: quality.releaseConfidence,
        subtitle: quality.releaseChecks.length
          ? `${quality.releaseChecks.length} release check(s) · click for details`
          : 'No significant release risks detected',
        chip: quality.releaseConfidence,
        chipClass: confidenceClass(
          quality.releaseConfidence,
        ),
        href: quality.releaseChecks.length
          ? '#blocking-release'
          : null,
      })}

      ${metricCard({
        title: 'Test Pass Rate',
        value:
          quality.tests.passRate == null
            ? 'N/A'
            : `${quality.tests.passRate}%`,
        subtitle:
          quality.tests.total == null
            ? 'Vitest results unavailable'
            : `${quality.tests.passed ?? 0} passed / ${quality.tests.total} total`,
      })}

      ${metricCard({
        title: 'Coverage Score',
        value:
          quality.coverage.adjustedAverage == null
            ? 'N/A'
            : `${quality.coverage.adjustedAverage}%`,
        subtitle:
          `Raw coverage ${quality.coverage.rawAverage ?? 'N/A'}%`,
      })}

    </div>

    <div class="two-column">

      <section id="coverage">

        <h2>Coverage</h2>

        <p class="muted">
          Adjusted coverage removes only scanner-approved
          tooling exclusions from the denominator.
        </p>

        <div
          class="score-stack"
          style="margin-top:18px"
        >

          ${scoreBar(
            'Statements',
            quality.coverage.adjusted?.statements,
          )}

          ${scoreBar(
            'Branches',
            quality.coverage.adjusted?.branches,
          )}

          ${scoreBar(
            'Functions',
            quality.coverage.adjusted?.functions,
          )}

          ${scoreBar(
            'Lines',
            quality.coverage.adjusted?.lines,
          )}

        </div>

      </section>

      <section>

        <h2>Quality Scores</h2>

        <p class="muted">
          Security is reported as a separate quality signal
          and can block release confidence.
        </p>

        <div
          class="score-stack"
          style="margin-top:18px"
        >

          ${scoreBar(
            'Overall quality',
            quality.overallScore,
          )}

          ${scoreBar(
            'Behavior score',
            quality.behavior.score,
          )}

          ${scoreBar(
            'Testability score',
            quality.testability.score,
          )}

          ${scoreBar(
            'Security score',
            quality.security.score,
          )}

          ${scoreBar(
            'Test pass rate',
            quality.tests.passRate,
          )}

        </div>

      </section>

    </div>

    <section id="coverage-accountability">

      <h2>Coverage Accountability</h2>

      <div class="accountability">

        <div class="small-card">
          <div class="small-label">
            Istanbul E markers
          </div>

          <div class="small-value">
            ${artifacts.eMarkers}
          </div>
        </div>

        <div class="small-card">
          <div class="small-label">
            Approved exclusions
          </div>

          <div class="small-value">
            ${artifacts.approvedExcluded}
          </div>
        </div>

        <div class="small-card">
          <div class="small-label">
            Fixable candidates
          </div>

          <div class="small-value">
            ${artifacts.fixableCandidates}
          </div>
        </div>

        <div class="small-card">
          <div class="small-label">
            Unclassified markers
          </div>

          <div class="small-value">
            ${artifacts.unclassified}
          </div>
        </div>

      </div>

    </section>

    <section id="blocking-release">

      <div class="section-heading">

        <div>
          <h2>Blocking Release</h2>

          <p class="muted">
            These are the checks currently responsible for a
            blocked release. Click a source finding to jump to
            the exact scanned code.
          </p>
        </div>

      </div>

      ${renderBlockingRelease({
        quality,
        behavior,
        security,
      })}

    </section>

    <section id="release-confidence-checks">

      <h2>
        All Release Confidence Checks
      </h2>

      <div class="release-checks">
        ${releaseChecks}
      </div>

    </section>

    ${renderFindingsSection(
      'Behavior Findings',
      behavior,
    )}

    ${renderFindingsSection(
      'Testability Findings',
      testability,
    )}

    ${renderFindingsSection(
      'Endpoint Security Findings',
      security,
      `${security.summary.endpoints ?? 0} Express endpoint(s) detected; ${
        security.summary.publicEndpoints ?? 0
      } explicitly public; ${
        security.summary.protectedEndpoints ?? 0
      } with recognized protection.`,
    )}

    <section id="raw-reports">

      <h2>Raw Reports</h2>

      <div class="raw-links">

        <a
          href="behavior.json"
          target="_blank"
        >
          Behavior JSON
        </a>

        <a
          href="testability.json"
          target="_blank"
        >
          Testability JSON
        </a>

        <a
          href="security.json"
          target="_blank"
        >
          Security JSON
        </a>

        <a
          href="quality.json"
          target="_blank"
        >
          Quality JSON
        </a>

      </div>

    </section>

  </main>

</div>

</body>
</html>
`;
};

module.exports = {
  renderHtml,
};
