# Quality Scanner

`quality-scanner` consolidates behavioral scanning, testability analysis, coverage-accountability analysis, security checks, and project quality reporting into one pipeline.

## Why this structure

The scanner has separate concerns but one engine:

- **behavior**: team engineering practices and project-specific patterns
- **testability**: source patterns that create difficult/noisy coverage branches
- **coverage accountability**: correlates Istanbul uncovered-branch markers with scanner findings and explicit approved exclusions
- **security**: Express endpoint inventory and auth/rate-limit boundary checks
- **quality**: combines adjusted coverage, test pass rate, testability, behavior, and security into one project score/report

A concern is not a separate scanner implementation. Rules share the same file discovery, ignore model, scoring, reporting, and CLI.

## Run

From this package (or after install):

```bash
node index.cjs
npx quality-scanner
```

Specific gate:

```bash
node index.cjs --concern behavior
node index.cjs --concern testability
node index.cjs --concern coverage
node index.cjs --concern security
```

List rules:

```bash
node index.cjs --list-rules
```

Run without a non-zero quality gate exit code:

```bash
node index.cjs --no-fail
```

Emit a CI-friendly dashboard payload as JSON into a directory:

```bash
npx quality-scanner -ci ./quality-scanner-report
```

You can also point the scanner at an existing coverage artifact directory or file without rerunning test collection. Both Istanbul `coverage-summary.json` and `coverage-final.json` files are supported:

```bash
npx quality-scanner -ci ./quality-scanner-report -coverage-target="./coverage"
```

When an explicit coverage target is used and `reports/test-results.json` is not available, coverage and static scan scores are still reported while the test pass rate is shown as `N/A`.

Vitest's JSON reporter output at `reports/vitest-results.json` is also discovered automatically. In a split CI pipeline, preserve both `coverage/` and `reports/vitest-results.json` from the test aggregation job so the quality scan can reuse coverage and test pass/fail counts without rerunning tests.

This writes `quality-scanner-report.json` containing the same per-concern dashboard payload the HTML report would expose (`quality`, `behavior`, `testability`, and `security` sections plus their summaries). CI mode suppresses the live test/coverage progress display and emits one final, timestamp-friendly terminal report with quality and coverage bars plus folder/file scan scores. It also emits a GitLab-friendly console pass/fail line and exits with a non-zero code only when the computed `releaseConfidence` is `Blocked`.

Reuse today's fresh test/coverage artifacts:

```bash
node index.cjs --reuse-artifacts
```

## Recommended package.json scripts

```json
{
  "scripts": {
    "quality:scan": "quality-scanner",
    "quality:scan:behavior": "quality-scanner --concern behavior",
    "quality:scan:testability": "quality-scanner --concern testability",
    "quality:scan:security": "quality-scanner --concern security"
  }
}
```

For a full quality score, the scanner can collect tests and Istanbul coverage itself via a detected runner (Vitest, Jest, Mocha+nyc, AVA+nyc, or a custom adapter).

## Project configuration

Copy [`quality-scanner.config.example.cjs`](quality-scanner.config.example.cjs) to the repository root as:

```text
quality-scanner.config.cjs
```

The example file documents:

- `testablePathPrefixes` for narrowing coverage targets
- `behaviorRules` for local engineering conventions
- security `publicEndpoints` **replace** vs `publicEndpointsExtra` **append** (and the same Extra pattern for middleware patterns)

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

Prefer the modern directive form (targets + reason required):

```ts
// quality-scanner-ignore-next-line no-direct-window-location -- intentional for demo
window.location = target;
```

Multiple targets:

```ts
// quality-scanner-ignore-next-line rule-one,rule-two -- Reviewed exception.
```

Legacy forms still work:

```ts
// quality ignore next
someCode();

// behavior ignore next no-direct-window-location
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

The HTML dashboard embeds source context for every finding. Clicking a file/line link jumps to the scanned source excerpt with the finding line highlighted.

Unless `--no-open` is passed, the scanner starts a local Node static server on an ephemeral port and opens the dashboard URL.

The scanner intentionally writes only the current scan. Historical/trend storage is outside the scope of this tool and can be layered on later.

## Endpoint security scanning

For JavaScript/TypeScript Express backends, the scanner includes a `security` concern that inventories static endpoint declarations and looks for missing or incomplete security boundaries.

```bash
node index.cjs --concern security
```

The scanner recognizes common forms including:

```ts
app.get("/accounts", requireAuth, handler);
router.post("/applications", requireAuth, handler);
router.use(requireAuth);
router.route("/accounts/:id").get(requireAuth, handler);
app.use("/api", requireAuth, importedRouter);
app.use("/api", requireAuth, require("./routes"));
```

It currently reports:

- `endpoint-missing-authentication` — endpoint has no recognized auth boundary and is not explicitly public
- `object-endpoint-authorization-review` — authenticated `:id`-style resource endpoint where object/function authorization could not be proven
- `authentication-endpoint-missing-rate-limit` — login/token/password-style endpoint without a recognized limiter

Security errors are release-blocking independently of the weighted quality score.

### Explicit public endpoints

The default public allowlist contains only common health/readiness probes. Other anonymous endpoints should be intentionally declared:

```js
module.exports = {
  security: {
    // Append to defaults:
    publicEndpointsExtra: [
      {
        method: "POST",
        pathPattern: /^\/login$/,
        reason: "Authentication entry point",
      },
    ],
    // Or replace the entire allowlist:
    // publicEndpoints: [ ... ],
  },
};
```

Declaring an authentication endpoint public does not disable the rate-limit check.

### Project-specific security middleware

```js
module.exports = {
  security: {
    authMiddlewarePatternsExtra: [/\brequireSession\b/],
    authorizationMiddlewarePatternsExtra: [/\brequireAccountAccess\b/],
    rateLimitMiddlewarePatternsExtra: [/\bsignInRateLimiter\b/],
  },
};
```

Patterns are added to the built-in defaults unless you set the non-`Extra` key to replace them.

### What the scanner can and cannot prove

This is static configuration analysis, not a penetration test. It can prove that a recognizable middleware boundary exists in common Express route arrangements, including imported routers mounted behind middleware. It cannot prove that the middleware itself is correct, that handler-level authorization is correct, or that infrastructure outside the source tree is enforcing access control.

## Scanner tests

```bash
npm test
```

## Package layout

Published files include `index.cjs`, `config.cjs`, `lib/`, `rules/`, and this README. Requires Node.js 18+.
