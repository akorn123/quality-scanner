/*
 * Example project configuration for quality-scanner.
 *
 * Copy to the repository root as:
 *   quality-scanner.config.cjs
 *
 * Then run:
 *   node index.cjs
 *   npx quality-scanner
 */

module.exports = {
  /*
   * Directories to walk for source and tests.
   * Defaults to ['src'] when omitted.
   */
  scanRoots: ['src'],

  /*
   * Dashboard theme defaults to dark on first run. The preference file is
   * project-owned, so it survives npm package updates.
   */
  dashboard: {
    // Use 0 for an automatically assigned port, or a fixed port such as 8080.
    port: 0,
    defaultTheme: 'dark',
    preferenceFile: '.quality-scanner/quality-scanner-preferences.json',
  },

  /*
   * When empty (default), every non-test source file under scanRoots is
   * treated as a testable coverage target.
   *
   * Set prefixes to narrow targets, for example only application code:
   *   testablePathPrefixes: ['src/app/', 'src/lib/']
   */
  testablePathPrefixes: [],

  /*
   * Normalized scanner results and Vitest's JSON reporter format are
   * supported. These defaults are shown here for clarity.
   */
  testResultsPaths: [
    'reports/test-results.json',
    'reports/vitest-results.json',
  ],

  /*
   * Existing test and coverage JSON is reused automatically when both
   * artifacts are no older than this rolling window.
   */
  freshness: {
    maxAgeHours: 24,
  },

  /*
   * Freshness alone only proves an artifact is recent, not that it came
   * from a full test run. This guards against "fresh but partial" reports
   * (e.g. someone manually ran a single test file with --coverage) by
   * requiring the coverage summary / test results to account for most of
   * the testable files discovered under scanRoots before they're trusted.
   */
  completeness: {
    enabled: true,
    minCoverageFileRatio: 0.9,
    minTestFileRatio: 0.9,
  },

  /*
   * Project-specific behavior rules are appended to the built-in defaults.
   * Encode local engineering conventions here without forking the scanner.
   */
  behaviorRules: [
    // {
    //   id: 'no-direct-window-location',
    //   category: 'architecture',
    //   severity: 'warning',
    //   penalty: 8,
    //   description:
    //     'Navigation should go through the project navigation boundary.',
    //   suggestion: 'Use the project navigation helper.',
    //   pattern: /window\.location\s*=/,
    // },
  ],

  /*
   * Path rules inspect normalized project-relative file and directory paths.
   * Use them for naming conventions, required paths, or forbidden path
   * patterns. Matching paths produce structure findings; they do not inspect
   * file contents.
   *
   * Set mode to 'required' for an exact path or path pattern that must exist.
   * The default mode is 'forbidden'. Exact paths are project-relative.
   */
  pathRules: [
    // {
    //   id: 'no-pascal-case-source-paths',
    //   category: 'naming',
    //   severity: 'error',
    //   penalty: 15,
    //   description: 'Source paths must use lowercase kebab-case.',
    //   suggestion: 'Rename the file or directory using lowercase kebab-case.',
    //   pathPattern: /(?:^|[\\/])[^\\/]*[A-Z][^\\/]*(?:$|\.[cm]?[jt]sx?$)/,
    // },
    // {
    //   id: 'requires-domain-directory',
    //   mode: 'required',
    //   path: 'src/domain',
    //   category: 'structure',
    //   severity: 'error',
    //   penalty: 20,
    //   description: 'The domain directory must exist.',
    //   suggestion: 'Create src/domain and keep domain code there.',
    // },
  ],

  /*
   * Organization rules use static ES module imports/exports only.
   * require(), module.exports, and dynamic import() are not analyzed.
   */
  organizationRules: [
    // {
    //   id: 'component-test-convention',
    //   type: 'test-target',
    //   targetPattern: /^(?<directory>src\/components\/(?<name>[^/]+))\/\k<name>\.(?<ext>tsx?)$/,
    //   testPathTemplate: '$<directory>/__test__/$<name>.test.$<ext>',
    //   requireImport: true,
    //   severity: 'error',
    //   penalty: 20,
    //   description: 'Component tests must be colocated under __test__.',
    //   suggestion: 'Use <name>.test.<ext> under the target __test__ directory.',
    // },
    // {
    //   id: 'shared-constants-location',
    //   type: 'shared-symbol-location',
    //   symbolType: 'constant',
    //   symbolPattern: /^[A-Z][A-Z0-9]*(?:_[A-Z0-9]+)+$/,
    //   allowedFilePattern: /(?:^|[./])[^/]*constants[^/]*\.[cm]?[jt]sx?$/,
    //   severity: 'warning',
    //   penalty: 10,
    //   description: 'Shared constants must be exported from a constants file.',
    //   suggestion: 'Move the shared constant to a constants-named module.',
    // },
  ],

  security: {
    /*
     * publicEndpoints REPLACE vs EXTRA
     * --------------------------------
     * - publicEndpoints: replaces the built-in public allowlist entirely
     *   (health/readiness probes are dropped unless you re-list them).
     * - publicEndpointsExtra: appends to the built-in (or replaced) list.
     *
     * The same replace-vs-Extra pattern applies to:
     *   authMiddlewarePatterns / authMiddlewarePatternsExtra
     *   authorizationMiddlewarePatterns / authorizationMiddlewarePatternsExtra
     *   rateLimitMiddlewarePatterns / rateLimitMiddlewarePatternsExtra
     *   trustedHtmlSanitizerPatterns / trustedHtmlSanitizerPatternsExtra
     *   insecureTransportAllowedPatterns / insecureTransportAllowedPatternsExtra
     *   sensitivePathPatterns / sensitivePathPatternsExtra
     *   authenticationEndpointPatterns / authenticationEndpointPatternsExtra
     */
    publicEndpointsExtra: [
      // {
      //   method: 'POST',
      //   pathPattern: /^\/login$/,
      //   reason: 'Authentication entry point',
      // },
    ],

    // publicEndpoints: [
    //   {
    //     method: 'GET',
    //     pathPattern: /^\/health$/,
    //     reason: 'Only this probe is public',
    //   },
    // ],

    authMiddlewarePatternsExtra: [
      // /\brequireSession\b/,
    ],

    authorizationMiddlewarePatternsExtra: [
      // /\brequireAccountAccess\b/,
    ],

    rateLimitMiddlewarePatternsExtra: [
      // /\bsignInRateLimiter\b/,
    ],

    /*
     * Frontend checks are enabled by default. Set this to false only when
     * browser-focused scanning is intentionally handled elsewhere.
     */
    frontendEnabled: true,

    trustedHtmlSanitizerPatternsExtra: [
      // /\bprojectSanitizeHtml\s*\(/,
    ],

    insecureTransportAllowedPatternsExtra: [
      // /\bhttp:\/\/dev-api\.internal(?::\d+)?\//i,
    ],
  },

  thresholds: {
    // behavior: 85,
    // testability: 85,
    // overall: 90,
    // adjustedBranches: 90,
    // security: 85,
  },
};
