const {
    existsSync,
  } = require('node:fs');
  
  const {
    isAbsolute,
    join,
    resolve,
  } = require('node:path');
  
  const defaults =
    require('../config.cjs');
  
  const merge = (
    base,
    override,
  ) => ({
    ...base,
    ...override,
  
    freshness: {
      ...base.freshness,
      ...(override?.freshness ?? {}),
    },
  
    testRunner: {
      ...base.testRunner,
      ...(override?.testRunner ?? {}),
  
      priority:
        override?.testRunner
          ?.priority ??
        base.testRunner?.priority ??
        [],
  
      adapters: {
        ...(base.testRunner
          ?.adapters ?? {}),
  
        ...(override?.testRunner
          ?.adapters ?? {}),
      },
    },
  
    thresholds: {
      ...base.thresholds,
      ...(override?.thresholds ?? {}),
    },
  
    weights: {
      ...base.weights,
      ...(override?.weights ?? {}),
    },
  
    behaviorRules: [
      ...(base.behaviorRules ?? []),
      ...(override?.behaviorRules ?? []),
    ],
  
    testabilityRules: [
      ...(base.testabilityRules ?? []),
      ...(override?.testabilityRules ?? []),
    ],
  
    security: {
      ...base.security,
      ...(override?.security ?? {}),
  
      authMiddlewarePatterns: [
        ...(base.security
          ?.authMiddlewarePatterns ?? []),
  
        ...(override?.security
          ?.authMiddlewarePatterns ?? []),
      ],
  
      authorizationMiddlewarePatterns: [
        ...(base.security
          ?.authorizationMiddlewarePatterns ??
          []),
  
        ...(override?.security
          ?.authorizationMiddlewarePatterns ??
          []),
      ],
  
      rateLimitMiddlewarePatterns: [
        ...(base.security
          ?.rateLimitMiddlewarePatterns ?? []),
  
        ...(override?.security
          ?.rateLimitMiddlewarePatterns ?? []),
      ],
  
      publicEndpoints: [
        ...(base.security
          ?.publicEndpoints ?? []),
  
        ...(override?.security
          ?.publicEndpoints ?? []),
      ],
  
      sensitivePathPatterns: [
        ...(base.security
          ?.sensitivePathPatterns ?? []),
  
        ...(override?.security
          ?.sensitivePathPatterns ?? []),
      ],
  
      authenticationEndpointPatterns: [
        ...(base.security
          ?.authenticationEndpointPatterns ??
          []),
  
        ...(override?.security
          ?.authenticationEndpointPatterns ??
          []),
      ],
    },
  
    coverageExclusionRules: [
      ...(base.coverageExclusionRules ??
        []),
  
      ...(override
        ?.coverageExclusionRules ??
        []),
    ],
  });
  
  const loadConfig = (
    configArg,
  ) => {
    const root =
      process.cwd();
  
    const candidates =
      configArg
        ? [
            isAbsolute(configArg)
              ? configArg
              : resolve(
                  root,
                  configArg,
                ),
          ]
        : [
            join(
              root,
              'quality-scanner.config.cjs',
            ),
          ];
  
    const configFile =
      candidates.find(
        (file) =>
          existsSync(file),
      );
  
    if (!configFile) {
      return {
        config: defaults,
        configFile: null,
      };
    }
  
    delete require.cache[
      require.resolve(
        configFile,
      )
    ];
  
    const projectConfig =
      require(configFile);
  
    return {
      config: merge(
        defaults,
        projectConfig,
      ),
  
      configFile,
    };
  };
  
  module.exports = {
    loadConfig,
  };
  