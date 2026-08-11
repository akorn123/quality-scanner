# Quality Scanner

`quality-scanner` consolidates behavioral scanning, testability analysis, coverage-accountability analysis, and project quality reporting into one pipeline.

## Why this structure

The scanner has four separate concerns but one engine:

- **behavior**: team engineering practices and project-specific patterns
- **testability**: source patterns that create difficult/noisy coverage branches
- **coverage accountability**: correlates Istanbul uncovered-branch markers with scanner findings and explicit approved exclusions
- **quality**: combines adjusted coverage, test pass rate, testability, and behavior into one project score/report

A concern is not a separate scanner implementation. Rules share the same file discovery, ignore model, scoring, reporting, and CLI.

## Run

```bash
node scripts/quality-scanner/index.cjs
```

Specific gate:

```bash
node scripts/quality-scanner/index.cjs --concern behavior
node scripts/quality-scanner/index.cjs --concern testability
node scripts/quality-scanner/index.cjs --concern coverage
```

List rules:

```bash
node scripts/quality-scanner/index.cjs --list-rules
```

Run without a non-zero quality gate exit code:

```bash
node scripts/quality-scanner/index.cjs --no-fail
```

## Recommended package.json scripts

```json
{
  "scripts": {
    "quality:coverage": "vitest run . --coverage",
    "quality:vitest-json": "vitest run --reporter=json --outputFile=reports/vitest-results.json",
    "quality:scan": "node scripts/quality-scanner/index.cjs",
    "quality:scan:behavior": "node scripts/quality-scanner/index.cjs --concern behavior",
    "quality:scan:testability": "node scripts/quality-scanner/index.cjs --concern testability",
    "quality:scan:security": "node scripts/quality-scanner/index.cjs --concern security"
  }
}
```

Run coverage and the JSON test report before `quality:scan` when using the full quality score.

## Project configuration

Copy `quality-scanner.config.example.cjs` to the repository root as:

```text
quality-scanner.config.cjs
```

The most important extension point is `behaviorRules`:

```js
module.exports = {
  behaviorRules: [
    {
      id: "no-direct-window-location",
      category: "architecture",
      severity: "warning",
      penalty: 8,
      description:
        "Navigation should go through the project navigation boundary.",
      suggestion: "Use the project navigation helper.",
      pattern: /window\.location\s*=/,
    },
  ],
};
```

That gives each adopting team a way to encode local engineering knowledge without modifying the scanner itself.

## Ignore comments

Ignore the next scanner finding:

```ts
// quality ignore next
someCode();
```

Ignore a specific rule/category/concern:

```ts
// quality ignore next no-direct-window-location
window.location = target;
```

Use ignores sparingly. They remain visible in source review instead of silently modifying global coverage settings.

## Coverage model

The scanner deliberately exposes three different uncovered-branch classifications:

1. **Approved exclusions** — actual Istanbul branch markers matching a configured, verified tooling-only exclusion rule. These are removed from adjusted coverage.
2. **Fixable candidates** — actual Istanbul branch markers that line up with testability findings such as optional chaining, optional callbacks, ternaries, fallbacks, and default props. They remain in the denominator.
3. **Unclassified markers** — uncovered branch markers that are neither approved exclusions nor known fixable candidates. They remain in the denominator and require review.

This prevents the quality score from improving merely because the scanner failed to recognize the cause of an uncovered branch.

## Reports

Generated under:

```text
reports/quality-scanner/
  behavior.json
  testability.json
  security.json
  quality.json
  index.html
```

The HTML dashboard uses the same visual language as the prior quality dashboard and embeds source context for every finding. Clicking a file/line link jumps to the scanned source excerpt with the finding line highlighted. This does not depend on Vitest or coverage HTML artifacts; the scanner captures the source context directly when the report is generated.

The scanner intentionally writes only the current scan. Historical/trend storage is outside the scope of this tool and can be layered on later.

## Future language support

The public rule/report model already separates a rule's **concern** from its detection mechanism. The next architectural step for another language should be a language adapter that supplies:

- file extensions / target discovery
- comment parsing
- line/AST matchers
- coverage artifact mapping

The behavior/testability/quality report schema does not need to change when another language adapter is added.

## Endpoint security scanning

For JavaScript/TypeScript Express backends, the scanner includes a `security` concern that inventories static endpoint declarations and looks for missing or incomplete security boundaries.

Run only endpoint security analysis:

```bash
node scripts/quality-scanner/index.cjs --concern security
```

The scanner recognizes common forms including:

```ts
app.get("/accounts", requireAuth, handler);
router.post("/applications", requireAuth, handler);
router.use(requireAuth);
router.route("/accounts/:id").get(requireAuth, handler);
app.use("/api", requireAuth, importedRouter);
```

It currently reports:

- `endpoint-missing-authentication` — endpoint has no recognized auth boundary and is not explicitly public
- `object-endpoint-authorization-review` — authenticated `:id`-style resource endpoint where object/function authorization could not be proven
- `authentication-endpoint-missing-rate-limit` — login/token/password-style endpoint without a recognized limiter

Security errors are release-blocking independently of the weighted quality score. A high coverage or test score cannot compensate for a detected access-control error.

### Explicit public endpoints

The default public allowlist contains only common health/readiness probes. Other anonymous endpoints should be intentionally declared in project configuration:

```js
module.exports = {
  security: {
    publicEndpoints: [
      {
        method: "POST",
        pathPattern: /^\/login$/,
        reason: "Authentication entry point",
      },
    ],
  },
};
```

Declaring an authentication endpoint public does not disable the rate-limit check.

### Project-specific security middleware

The analyzer cannot infer every project's middleware names. Add project-specific authentication, authorization, and rate-limit patterns:

```js
module.exports = {
  security: {
    authMiddlewarePatterns: [/\bauth\.requireAuth\b/, /\brequireSession\b/],
    authorizationMiddlewarePatterns: [
      /\brequireAccountAccess\b/,
      /\brequireAdmin\b/,
    ],
    rateLimitMiddlewarePatterns: [/\bsignInRateLimiter\b/],
  },
};
```

Patterns are added to the built-in defaults.

### What the scanner can and cannot prove

This is static configuration analysis, not a penetration test. It can prove that a recognizable middleware boundary exists in common Express route arrangements, including imported routers mounted behind middleware. It cannot prove that the middleware itself is correct, that handler-level authorization is correct, or that infrastructure outside the source tree is enforcing access control.

For that reason, object-ID endpoints receive an informational authorization-review finding when authentication is visible but a recognizable authorization boundary is not. This is intended to surface possible BOLA/function-level authorization issues without pretending a regex scanner can prove business authorization correctness.

## Scanner tests

The endpoint analyzer includes built-in Node tests:

```bash
node --test scripts/quality-scanner/tests/security.test.cjs
```

## Automatic artifact refresh

For scans that require test artifacts, the scanner checks the configured coverage summary and Vitest JSON report before scanning.

If a required artifact is missing or stale, the scanner automatically runs:

```bash
npm run test:coverage
```

The scanner waits for that command to finish, verifies the required artifacts again, and then continues the quality scan. The refresh is attempted only once. If the command fails, or if it succeeds without generating fresh required artifacts, the quality scan fails with the specific remaining artifact problem.

The command can be changed or automatic refresh can be disabled in `quality-scanner.config.cjs`:

```js
module.exports = {
  artifactRefresh: {
    enabled: true,
    command: "npm run test:coverage",
  },
};
```

A full scan requires both a fresh coverage summary and fresh Vitest JSON results. Therefore the project's `test:coverage` script should generate both artifacts expected by `coverageSummaryPaths` and `vitestReportPaths`.
