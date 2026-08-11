# quality-scanner package audit

Audit of correctness, cleanness, and separation of concerns for the `quality-scanner` npm package (v0.1.0). Findings only—no code changes in this pass.

**Verdict:** Not ready to publish as a general-purpose npm CLI. The pipeline shape is coherent, but packaging is incomplete, Windows test execution is likely broken, several suppression and coverage-accountability paths are incorrect, docs drift from the tree, and there are no in-package tests.

---

## 1. Summary

| Area | Assessment |
|------|------------|
| Architecture | Clear staged pipeline; modules mostly layered well |
| Correctness | Several high-impact bugs (Windows spawn, suppressions, coverage path/math, CLI `main`) |
| Cleanness | README/config defaults look extracted from a host app; god modules; duplication |
| Separation of concerns | Good infra/analysis/output split; security and reporting leak across layers |
| Publish readiness | Missing `bin`, `exports`, `files`, engines; `main` always runs the CLI |

**Top risks (P0):**

1. Windows: local `.cmd` binaries spawned with `shell: false` in [`lib/test-runner.cjs`](lib/test-runner.cjs).
2. [`index.cjs`](index.cjs) always invokes `main()`; requiring the package runs a full scan.
3. Security and `filePattern` findings can bypass ignore directives.

---

## 2. Architecture snapshot

### Pipeline

```text
index.cjs
  → loadConfig
  → [--list-rules] exit
  → runProjectTests
  → resolveFiles / resolveTargetTests
  → loadCoverage
  → scanProject (behavior + testability + security)
  → analyzeCoverageArtifacts
  → buildQuality
  → writeReports
  → launchReport (unless --no-open)
  → quality-gate exit code
```

### Module map

| Path | Role |
|------|------|
| [`index.cjs`](index.cjs) | CLI orchestration, summary UX, exit gates |
| [`config.cjs`](config.cjs) | Built-in defaults |
| [`lib/config.cjs`](lib/config.cjs) | Load/merge project config |
| [`lib/files.cjs`](lib/files.cjs) | Walk roots, classify source/test/testable |
| [`lib/coverage.cjs`](lib/coverage.cjs) | Istanbul summary load + freshness |
| [`lib/test-resolver.cjs`](lib/test-resolver.cjs) | Test file → imported source targets |
| [`lib/test-runner.cjs`](lib/test-runner.cjs) | Detect/run Vitest/Jest/etc. + normalize artifacts |
| [`lib/progress.cjs`](lib/progress.cjs) | TTY progress for long runs |
| [`lib/suppressions.cjs`](lib/suppressions.cjs) | Ignore-next-line directives |
| [`lib/scanner.cjs`](lib/scanner.cjs) | Rule merge/validate + line/file/analyzer scan |
| [`lib/security.cjs`](lib/security.cjs) | Express route inventory + auth checks |
| [`lib/artifacts.cjs`](lib/artifacts.cjs) | Istanbul HTML branch-marker classification |
| [`lib/quality.cjs`](lib/quality.cjs) | Scores, adjusted coverage, release confidence |
| [`lib/reports.cjs`](lib/reports.cjs) | Concern JSON + embedded HTML dashboard |
| [`lib/report-server.cjs`](lib/report-server.cjs) | Python static server + browser open |
| [`rules/*.cjs`](rules/) | Default behavior/testability rules; security catalog |

### Intended layers

```text
CLI (index)
  → Infra (config, files, coverage, suppressions, progress)
  → Execution (test-runner, test-resolver)
  → Analysis (scanner, rules, security, artifacts)
  → Aggregation / output (quality, reports, report-server)
```

There is no separate programmatic API surface. `package.json` `"main"` points at the CLI entry.

---

## 3. Correctness

Severity tags: **Bug** (high confidence), **Likely bug**, **Design**, **Docs**.

### 3.1 Bugs

#### C1 — Windows: `.cmd` spawn with `shell: false` — **Bug**

**Evidence:** [`lib/test-runner.cjs`](lib/test-runner.cjs) — `getLocalBin` appends `.cmd` on `win32`; `runProcess` uses `spawn(command, args, { shell: false })`.

**Impact:** Built-in Vitest/Jest/Mocha/AVA/nyc runs are likely to fail with `EINVAL` (or equivalent) on Windows. This is a P0 for any Windows adopter.

**Suggestion:** Prefer `node` + resolved package entry (e.g. `require.resolve('vitest/package.json')` then CLI path), or spawn with `shell: true` only for `.cmd`/`.ps1` shims. Avoid passing `.cmd` paths as argv to `nyc`.

---

#### C2 — `main` always executes the CLI — **Bug**

**Evidence:** Bottom of [`index.cjs`](index.cjs) unconditionally calls `main()`. [`package.json`](package.json) sets `"main": "./index.cjs"` with no `bin` and no `exports`.

**Impact:** `require('quality-scanner')` starts a full scan as a side effect. The package is not usable as a library and is easy to misuse after install.

**Suggestion:** Guard with `require.main === module` (or `import.meta` equivalent if ESM later). Add `"bin": { "quality-scanner": "./index.cjs" }`. Expose a thin API entry separately if a library surface is desired.

---

#### C3 — Security suppressions incomplete / discarded — **Bug**

**Evidence:** [`lib/security.cjs`](lib/security.cjs)

- Only `endpoint-missing-authentication` goes through `addSecurityFinding`.
- `object-endpoint-authorization-review` and `authentication-endpoint-missing-rate-limit` use raw `findings.push`.
- `analyzeFile` builds `suppressedFindings` but returns only `{ findings, score, ... }`—suppression accounting never leaves the function.

**Impact:** Documented `security ignore next …` / modern directives cannot suppress two of three check types. Report/suppression stats for security stay empty even when auth findings are suppressed.

**Suggestion:** Route every security finding through `addSecurityFinding`. Return and aggregate `suppressedFindings` like the behavior/testability scanner does.

---

#### C4 — `filePattern` findings skip suppressions — **Bug**

**Evidence:** [`lib/scanner.cjs`](lib/scanner.cjs) `scanWithRules` — when `rule.filePattern` matches, code uses `findings.push(createFinding(...))` instead of `addFinding`.

**Impact:** File-level rules (e.g. mixed if/else + switch) cannot be ignored via next-line directives. Line attribution is forced to line 1, which is also a poor UX for review.

**Suggestion:** Use `addFinding` (or a dedicated file-level suppression API). Prefer reporting the first real match line when possible.

---

#### C5 — Coverage HTML path keys mismatch source relatives — **Bug**

**Evidence:** [`lib/artifacts.cjs`](lib/artifacts.cjs)

- `lcovReportDirs` picks the **first existing** directory (`reports/coverage` before `reports/coverage/lcov-report` in [`config.cjs`](config.cjs)).
- Artifact keys are `relative(reportDir, htmlFile)` with `.html` stripped.
- Classification joins those keys to scan `relativeFile` values like `src/...`.

**Impact:** If HTML lives under `lcov-report/` while `reportDir` is the parent, keys become `lcov-report/src/...` and never match. Approved exclusions and fixable candidates fail open into “unclassified,” and adjusted coverage becomes wrong.

**Suggestion:** Prefer the deepest/canonical `lcov-report` directory when multiple exist; or strip a leading `lcov-report/` prefix; or map HTML paths back through Istanbul summary file keys.

---

#### C6 — Adjusted branch coverage mixes incompatible units — **Bug**

**Evidence:** [`lib/artifacts.cjs`](lib/artifacts.cjs) counts HTML “e-marker” occurrences; [`lib/quality.cjs`](lib/quality.cjs) `getAdjustedMetric(total.branches, artifacts.approvedExcluded)` subtracts that count from Istanbul `branches.total`.

**Impact:** Marker counts are not the same unit as Istanbul branch totals. Adjusted branch % and the `thresholds.adjustedBranches` gate can pass or fail incorrectly.

**Suggestion:** Subtract only when units are aligned (e.g. map markers to distinct Istanbul branch indexes), or adjust using per-file coverage data rather than raw marker counts against global totals. Document the model if it remains approximate.

---

#### C7 — Empty / unscanned project looks perfect — **Bug**

**Evidence:** [`lib/quality.cjs`](lib/quality.cjs) — `averageScore([])` returns `100`. Defaults use `scanRoots: ['src']`; missing roots yield empty file lists via [`lib/files.cjs`](lib/files.cjs).

**Impact:** Running the scanner on an empty or misconfigured package produces high scores and “High” release confidence with little signal.

**Suggestion:** Treat zero scanned files (or zero testable targets when required) as unknown/`null` score and fail the gate, or emit an explicit configuration error.

---

### 3.2 Likely bugs

#### C8 — Pass rate penalizes skips — **Likely bug**

**Evidence:** [`lib/quality.cjs`](lib/quality.cjs) `loadTestResults` — `passRate = passed / total`. Skipped/todo are tracked separately but not removed from the denominator.

**Impact:** Projects with intentional skips look worse on overall quality even with zero failures.

**Suggestion:** Use `passed / (passed + failed)` or `(passed) / (total - skipped - todo)` and document the formula.

---

#### C9 — Multi-mount auth uses OR — **Likely bug**

**Evidence:** [`lib/security.cjs`](lib/security.cjs) — `externallyProtected = externalMounts.some((mount) => mount.protected)`.

**Impact:** One protected mount can mark a route protected for all mounts → false negatives on unprotected aliases.

**Suggestion:** Require protection on every effective external mount path, or evaluate protection per effective path.

---

#### C10 — Inline `require()` mounts invisible — **Likely bug**

**Evidence:** [`lib/security.cjs`](lib/security.cjs) `extractImports` / `buildMountMap` track assigned imports; patterns like `app.use('/api', require('./routes'))` are not modeled.

**Impact:** Parent auth/mount context is lost → false positives for missing authentication.

**Suggestion:** Parse inline `require`/`import()` in `use`/`mount` argument lists, or document this as an unsupported pattern.

---

#### C11 — Relative import regex is POSIX-only — **Likely bug**

**Evidence:** [`lib/test-resolver.cjs`](lib/test-resolver.cjs) `getRelativeImports` only matches `\.{1,2}/`, not `\\`.

**Impact:** Unusual Windows-style relative specifiers won’t resolve → empty `testedBy` / false “untested” targets. (Normal JS imports use `/`, so impact is limited.)

**Suggestion:** Normalize separators before matching, or accept both `/` and `\\` in the regex.

---

#### C12 — `thresholds.overall` never fails the process — **Likely bug**

**Evidence:** [`config.cjs`](config.cjs) defines `thresholds.overall`; [`index.cjs`](index.cjs) exit logic checks behavior, testability, adjusted branches, security, and failed tests—not overall score. Overall mainly feeds release confidence in [`lib/quality.cjs`](lib/quality.cjs).

**Impact:** Configured overall threshold is misleading; CI may stay green while overall is below threshold.

**Suggestion:** Include overall in the exit gate when `concern === 'all'`, or remove/rename the unused threshold and document release-confidence-only use.

---

#### C13 — Asymmetric fail gates per concern — **Likely bug** / **Design**

**Evidence:** [`index.cjs`](index.cjs)

- Behavior: fatal **or** errors **or** score.
- Testability: score only (fatal/errors ignored for exit).
- Security: fatal **or** errors **or** score.
- Tests: only when `concern === 'all'`.

**Impact:** `--concern testability` can pass with high-severity findings if the averaged score stays above threshold.

**Suggestion:** Unify gate policy (same severity dimensions per concern) and document exceptions deliberately.

---

#### C14 — `--concern` does not scope scan work — **Likely bug** / **Design**

**Evidence:** [`index.cjs`](index.cjs) always calls `scanProject` for behavior + testability + security. Concern mainly gates test running, coverage requirement, and exit checks.

**Impact:** `--concern security` still pays full behavior/testability cost; mental model (“run only X”) does not match behavior.

**Suggestion:** Pass a concern filter into `scanProject` / `analyzeSecurity` / artifact analysis, and skip unused stages.

---

#### C15 — Artifact JSON parse failures crash hard — **Likely bug**

**Evidence:** `JSON.parse` in [`lib/coverage.cjs`](lib/coverage.cjs), [`lib/quality.cjs`](lib/quality.cjs), and test-runner normalization without rich try/catch context.

**Impact:** Corrupt coverage/test JSON yields opaque stack traces instead of actionable “regenerate artifacts” errors.

**Suggestion:** Wrap parses with path + hint in the error message (`cause` chaining is already used at the CLI boundary).

---

#### C16 — Report server fixed port / no readiness — **Likely bug**

**Evidence:** [`lib/report-server.cjs`](lib/report-server.cjs) — port `8080`, detached Python process, `openReportUrl` immediately; depends on `python`/`python3` being installed.

**Impact:** Port-in-use or slow bind → broken dashboard; leftover servers; failure on machines without Python.

**Suggestion:** Use Node `http`/`serve-handler` (no Python), pick an ephemeral free port, wait for listen before opening, and shut down cleanly.

---

#### C17 — `--reuse-artifacts` vs freshness — **Likely bug**

**Evidence:** [`lib/test-runner.cjs`](lib/test-runner.cjs) reuse only checks existence of results + coverage summary. [`lib/coverage.cjs`](lib/coverage.cjs) / [`lib/quality.cjs`](lib/quality.cjs) still enforce `freshness.requireToday` when required.

**Impact:** Reuse can skip regeneration then fail later with “stale” errors—confusing UX.

**Suggestion:** Reuse should either bypass freshness, or freshness-check before claiming reuse and regenerate when stale.

---

#### C18 — `directiveLine` metadata points at finding line — **Likely bug**

**Evidence:** [`lib/suppressions.cjs`](lib/suppressions.cjs) sets `directiveLine: zeroBasedLineIndex` (the finding line), not the previous directive line.

**Impact:** Reports/tools that jump to the directive land on the wrong line.

**Suggestion:** Store `directiveLine: zeroBasedLineIndex` (0-based finding) separately from `directiveSourceLine: zeroBasedLineIndex` (previous line, 1-based in reports).

---

#### C19 — No package self-tests — **Bug** (process)

**Evidence:** [`package.json`](package.json) `"test": "node --test"`; zero `*.test.*` / `tests/` files in the tree. README references `scripts/quality-scanner/tests/security.test.cjs`, which is absent. [`lib/security.cjs`](lib/security.cjs) exports helpers that look test-oriented.

**Impact:** Regressions in spawn, suppressions, path math, and scoring go undetected. `npm test` is always green.

**Suggestion:** Add focused `node:test` coverage for suppressions, path normalization, security finding routing, artifacts key mapping, and quality math. Wire `npm test` to those files.

---

### 3.3 Heuristic / model limitations (correctness-adjacent)

These are not necessarily defects if documented, but they affect trust:

- Regex line rules and brace-blind analyzers in [`lib/scanner.cjs`](lib/scanner.cjs) / [`rules/*.cjs`](rules/) will false-positive inside strings, comments, and templates.
- Security parsing is a lightweight Express heuristic, not an AST/control-flow analysis.
- Suppressions only support `//` previous-line directives (no block comments, no JSX `{/* */}`).

**Suggestion:** Document supported languages/patterns and FP expectations; consider AST (e.g. oxc/typescript) for high-value rules later.

---

## 4. Cleanness

### 4.1 Docs and packaging drift — **Docs**

| Claim / expectation | Reality |
|---------------------|---------|
| README paths `node scripts/quality-scanner/index.cjs` | Entry is root [`index.cjs`](index.cjs) |
| `quality-scanner.config.example.cjs` | Missing |
| README ignore examples use legacy `// quality ignore next` | Preferred modern form is `// quality-scanner-ignore-next-line … -- reason` in [`lib/suppressions.cjs`](lib/suppressions.cjs) |
| README security tests path | Not in tree |
| package description: aggregates “multiple analysis tools” | Mostly custom regex/static scan + optional local test-runner orchestration |
| Installable CLI | No `bin` field despite shebang |
| Library entry | `main` side-effects |

**Suggestion:** Rewrite README for the published layout; add an example config; document modern ignore syntax first; align description with actual behavior.

---

### 4.2 Host-app defaults shipped as package defaults — **Design**

**Evidence:** [`config.cjs`](config.cjs) `testablePathPrefixes` includes `src/federation_components/` and other app-specific folders.

**Impact:** Generic adopters get silent “not testable” classifications for common layouts (`src/lib`, `app/`, etc.) unless they reconfigure.

**Suggestion:** Ship neutral defaults (`src/` or empty prefixes meaning “all non-test source”) and move host-specific prefixes to the example config.

---

### 4.3 Incomplete npm package surface — **Design**

[`package.json`](package.json) lacks:

- `bin`
- `exports` / safe `main`
- `files` (publish allowlist)
- `engines`
- `dependencies` / `peerDependencies` (runners resolved from the consumer—fine if documented)

`dev` script runs the scanner against this repo (often no `src`), which is a weak developer entry.

**Suggestion:** Define a minimal publishable surface and a `files` allowlist (`index.cjs`, `config.cjs`, `lib/`, `rules/`, `README.md`, `LICENSE`).

---

### 4.4 God modules and mixed presentation — **Design**

| File | Approx. size | Smell |
|------|--------------|--------|
| [`lib/reports.cjs`](lib/reports.cjs) | ~2.2k lines | JSON shaping + full HTML/CSS/JS dashboard in one module |
| [`lib/test-runner.cjs`](lib/test-runner.cjs) | ~835 lines | Detection, spawn, adapters, validation |
| [`lib/quality.cjs`](lib/quality.cjs) | ~738 lines | Scoring, coverage adjust, test-result load, release confidence |
| [`lib/security.cjs`](lib/security.cjs) | ~561 lines | Parser + policy engine |

**Suggestion:** Split reports into `report-data.cjs` + `report-html.cjs` (or template file). Extract test-runner adapters per runner. Keep `quality` as pure aggregation over already-loaded inputs.

---

### 4.5 Duplication — **Design**

- `toRelativePath` in both [`lib/files.cjs`](lib/files.cjs) and [`lib/coverage.cjs`](lib/coverage.cjs) (absolute vs relative input handling differs).
- `resetAndTest` duplicated in [`lib/scanner.cjs`](lib/scanner.cjs) and [`lib/security.cjs`](lib/security.cjs).
- “Start of today” freshness logic duplicated inside [`lib/coverage.cjs`](lib/coverage.cjs).

**Suggestion:** One shared `paths.cjs` / `regex.cjs` / freshness helper. Divergent path normalization is a correctness risk, not just style.

---

### 4.6 Config merge is append-only for pattern arrays — **Design**

**Evidence:** [`lib/config.cjs`](lib/config.cjs) concatenates `authMiddlewarePatterns`, `authorizationMiddlewarePatterns`, `rateLimitMiddlewarePatterns`, `publicEndpoints`, and rule arrays.

**Impact:** Consumers cannot replace defaults without inheriting host patterns; disabling a default public endpoint requires workarounds.

**Suggestion:** Support explicit replace semantics (e.g. `security.publicEndpoints = [...]` replaces; `security.publicEndpointsExtra` appends), or document append-only clearly with an escape hatch.

---

## 5. Separation of concerns

### 5.1 What works well

- Shared engine for behavior/testability rules (discovery, ignore model, scoring, reporting).
- Suppressions isolated in [`lib/suppressions.cjs`](lib/suppressions.cjs).
- Coverage accountability as a distinct artifacts stage after testability scan.
- Config merge centralized in [`lib/config.cjs`](lib/config.cjs).
- CLI mostly orchestrates rather than implementing scanners inline.

### 5.2 Leaks and inconsistencies

#### S1 — Security dual model — **Design**

[`rules/security.cjs`](rules/security.cjs) is metadata for `--list-rules` only. Detection IDs, severities, and penalties are hardcoded in [`lib/security.cjs`](lib/security.cjs) `createFinding`. Unlike behavior/testability, custom security rules are not merged/validated through `getRules` / `validateRule`.

**Suggestion:** Drive security checks from rule definitions (id/severity/penalty/description) with detector functions registered by id, or generate the catalog from the same source as the detectors.

---

#### S2 — Security omitted from overall weighted score — **Design**

**Evidence:** [`lib/quality.cjs`](lib/quality.cjs) `buildQuality` weights coverage, pass rate, testability, and behavior only. Security affects release confidence and exit gates separately. [`config.cjs`](config.cjs) `weights` has no `security` key.

**Impact:** “Overall quality” can look strong while security is poor (exit may still fail when concern includes security).

**Suggestion:** Either weight security into overall, or rename overall to exclude security and document the split so dashboards don’t imply a single score covers all concerns.

---

#### S3 — Concern flag is an exit/coverage filter, not a scanner filter — **Design**

See C14. The public README language (“run only endpoint security analysis”) oversells isolation.

**Suggestion:** Make concern a first-class pipeline filter end-to-end.

---

#### S4 — Reporting mixes data contracts and presentation — **Design**

[`lib/reports.cjs`](lib/reports.cjs) owns concern JSON schema shaping and a giant embedded dashboard. Changes to visual layout risk breaking serialization helpers and vice versa.

**Suggestion:** Keep `concernReport` / writers in a small module; move HTML to a template or separate file loaded at write time.

---

#### S5 — Gate policy lives in the CLI — **Design**

Exit thresholds and concern asymmetries are embedded in [`index.cjs`](index.cjs), while scoring/release confidence live in [`lib/quality.cjs`](lib/quality.cjs).

**Suggestion:** Move `evaluateQualityGate({ quality, concern, thresholds })` next to scoring so CLI stays I/O-only and gates are unit-testable.

---

#### S6 — Progress / report-server as optional I/O adapters — **Design** (minor)

These are appropriately leaf modules. The Python dependency in report-server is the main concern (see C16).

---

## 6. Prioritized recommendations

### P0 — Fix before any real use / publish

1. Fix Windows test-runner spawning (C1).
2. Guard CLI entry; add `bin` (C2).
3. Route all security findings through suppression helpers; return suppressed stats (C3).
4. Route `filePattern` findings through `addFinding` (C4).

### P1 — Fix before trusting scores / CI gates

5. Fix coverage HTML path resolution (C5).
6. Align adjusted-branch units or stop claiming precise accountability (C6).
7. Fail closed on empty scan / missing roots (C7).
8. Align `--reuse-artifacts` with freshness (C17).
9. Add unit tests for suppressions, path keys, quality math, security routing (C19).
10. Refresh README + example config; neutralize host-specific defaults (4.1, 4.2).

### P2 — Correctness polish

11. Pass-rate formula (C8).
12. Multi-mount protection semantics (C9).
13. Inline require mounts (C10).
14. Overall threshold in exit gate or remove it (C12).
15. Symmetric concern gates + scoped scans (C13, C14, S3).
16. Node-based report server with free port (C16).
17. Richer JSON parse errors (C15).

### P3 — Structure / maintainability

18. Split [`lib/reports.cjs`](lib/reports.cjs); extract runner adapters (4.4).
19. Deduplicate path/regex/freshness helpers (4.5).
20. Unify security rules catalog with detectors (S1).
21. Decide security’s place in overall score (S2).
22. Replace-or-append config semantics for security arrays (4.6).
23. Extract `evaluateQualityGate` from CLI (S5).
24. Complete package metadata (`files`, `engines`, `exports`) (4.3).

---

## 7. Suggested near-term test matrix

Minimum `node:test` cases that would lock the highest-risk behavior:

1. **Suppressions:** modern directive with reason; legacy concern/rule; security all three finding ids; `filePattern` rule respect.
2. **Paths:** `toRelativePath` absolute vs relative; artifacts key when HTML is under `lcov-report/`.
3. **Quality math:** `averageScore([])` policy; adjusted metric with known totals; pass-rate with skips.
4. **Test runner:** win32 bin resolution does not spawn `.cmd` with `shell: false` (mock `spawn`).
5. **CLI entry:** requiring the module does not start `main`.
6. **Config merge:** document/assert append vs replace for `publicEndpoints`.

---

## 8. Closing note

The package has a solid conceptual model (shared rule engine, coverage accountability, multi-concern quality gate). The largest gaps are **publish/CLI packaging**, **Windows execution**, **suppression holes**, and **coverage-adjustment correctness**—plus **docs/defaults** that still reflect a host application rather than a reusable npm tool. Addressing P0/P1 would make the project trustworthy enough for internal CI; P2/P3 would make it maintainable as a public package.
)
