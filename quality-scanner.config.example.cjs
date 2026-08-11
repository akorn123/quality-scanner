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
   * When empty (default), every non-test source file under scanRoots is
   * treated as a testable coverage target.
   *
   * Set prefixes to narrow targets, for example only application code:
   *   testablePathPrefixes: ['src/app/', 'src/lib/']
   */
  testablePathPrefixes: [],

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
  },

  thresholds: {
    // behavior: 85,
    // testability: 85,
    // overall: 90,
    // adjustedBranches: 90,
    // security: 85,
  },
};
