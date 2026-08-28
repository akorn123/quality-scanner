module.exports = {
  scanRoots: ['src'],

  ignoredDirs: [
    'node_modules',
    'dist',
    'coverage',
    '.git',
    '.quality-scanner',
    '.next',
    'build',
    'reports',
  ],

  ignoredFilePatterns: [
    /\.d\.ts$/,
  ],

  sourceFilePattern:
    /\.[cm]?[jt]sx?$/,

  testFilePattern:
    /\.(test|spec)\.[cm]?[jt]sx?$/,

  /*
   * Empty means every non-test source file under scanRoots is testable.
   * Override in quality-scanner.config.cjs for project-specific layouts.
   */
  testablePathPrefixes: [],

  testabilityIgnoredPathFragments: [
    '/__tests__/',
    '/_registration/',
  ],

  reportDir:
    'reports/quality-scanner',

  dashboard: {
    defaultTheme: 'dark',
    preferenceFile:
      '.quality-scanner/quality-scanner-preferences.json',
  },

  coverageSummaryPaths: [
    'reports/coverage/coverage-summary.json',
    'coverage/coverage-summary.json',
    'reports/coverage/coverage-final.json',
    'coverage/coverage-final.json',
  ],

  lcovReportDirs: [
    'reports/coverage/lcov-report',
    'reports/coverage',
    'coverage/lcov-report',
    'coverage',
  ],

  testResultsPaths: [
    'reports/test-results.json',
    'reports/vitest-results.json',
  ],

  freshness: {
    maxAgeHours: 24,
  },

  testRunner: {
    enabled: true,

    priority: [
      'vitest',
      'jest',
      'playwright',
      'mocha',
      'cypress',
      'tape',
      'ava',
      'tap',
    ],

    outputDir:
      'reports',

    resultsFile:
      'reports/test-results.json',

    rawResultsFile:
      'reports/test-results.raw.json',

    tapResultsFile:
      'reports/test-results.tap',

    coverageDir:
      'reports/coverage',

    adapters: {},
  },

  thresholds: {
    behavior: 85,
    testability: 85,
    overall: 90,
    adjustedBranches: 90,
    security: 85,
  },

  weights: {
    coverage: 0.30,
    testPassRate: 0.20,
    testability: 0.15,
    behavior: 0.15,
    security: 0.20,
  },

  behaviorRules: [],
  testabilityRules: [],
  coverageExclusionRules: [],

  security: {
    enabled: true,

    frontendEnabled: true,

    trustedHtmlSanitizerPatterns: [
      /\bDOMPurify\.sanitize\s*\(/,
      /\bsanitizeHtml\s*\(/,
    ],

    insecureTransportAllowedPatterns: [
      /\b(?:http|ws):\/\/(?:localhost|127\.0\.0\.1|\[::1\])(?::\d+)?(?:[/'"`]|$)/i,
    ],

    authMiddlewarePatterns: [
      /\brequireAuth\b/,
      /\bensureAuthenticated\b/i,
      /\bisAuthenticated\b/i,
      /\bpassport\.authenticate\s*\(/,
      /\bcheckJwt\b/i,
      /\bverify(?:Jwt|Token|Session)\b/i,
      /\bauthenticate(?:Request|Session)\b/i,
    ],

    authorizationMiddlewarePatterns: [
      /\bauthorize\b/i,
      /\brequireRole\b/i,
      /\brequirePermission\b/i,
      /\bcheckPermission\b/i,
      /\bcanAccess\b/i,
      /\bpolicy\b/i,
    ],

    rateLimitMiddlewarePatterns: [
      /\brateLimit(?:er)?\b/i,
      /\bloginLimiter\b/i,
      /\bauthLimiter\b/i,
    ],

    publicEndpoints: [
      {
        method: 'GET',

        pathPattern:
          /^\/(?:healthcheck|health|ready|readiness|live|liveness)\/?$/i,

        reason:
          'Health/readiness probe',
      },
    ],

    sensitivePathPatterns: [
      /\/(?:admin|accounts?|users?|sessions?|attachments?|applications?|secrets?|keys?|permissions?|roles?)(?:\/|$)/i,

      /\/me(?:\/|$)/i,
    ],

    authenticationEndpointPatterns: [
      /\/(?:login|signin|sign-in|token|password|forgot-password|reset-password|mfa|otp)(?:\/|$)/i,
    ],
  },
};
