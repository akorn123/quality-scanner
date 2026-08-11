module.exports = {
    scanRoots: ['src'],
  
    ignoredDirs: [
      'node_modules',
      'dist',
      'coverage',
      '.git',
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
  
    testablePathPrefixes: [
      'src/components/',
      'src/context/',
      'src/federation_components/',
      'src/hooks/',
      'src/pages/',
      'src/services/',
      'src/utils/',
    ],
  
    testabilityIgnoredPathFragments: [
      '/__tests__/',
      '/_registration/',
    ],
  
    reportDir:
      'reports/quality-scanner',
  
    coverageSummaryPaths: [
      'reports/coverage/coverage-summary.json',
      'coverage/coverage-summary.json',
    ],
  
    lcovReportDirs: [
      'reports/coverage',
      'reports/coverage/lcov-report',
      'coverage',
      'coverage/lcov-report',
    ],
  
    testResultsPaths: [
      'reports/test-results.json',
    ],
  
    freshness: {
      requireToday: true,
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
      coverage: 0.35,
      testPassRate: 0.25,
      testability: 0.20,
      behavior: 0.20,
    },
  
    behaviorRules: [],
    testabilityRules: [],
    coverageExclusionRules: [],
  
    security: {
      enabled: true,
  
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
  