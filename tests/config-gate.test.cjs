const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { merge, pickList } = require('../lib/config.cjs');
const defaults = require('../config.cjs');
const { evaluateQualityGate } = require('../lib/quality.cjs');

describe('config merge', () => {
  it('replaces security publicEndpoints when override provides the array', () => {
    const merged = merge(defaults, {
      security: {
        publicEndpoints: [
          {
            method: 'GET',
            pathPattern: /^\/custom$/i,
            reason: 'custom',
          },
        ],
      },
    });

    assert.equal(merged.security.publicEndpoints.length, 1);
    assert.equal(merged.security.publicEndpoints[0].reason, 'custom');
  });

  it('appends via publicEndpointsExtra without replacing defaults', () => {
    const merged = merge(defaults, {
      security: {
        publicEndpointsExtra: [
          {
            method: 'GET',
            pathPattern: /^\/extra$/i,
            reason: 'extra',
          },
        ],
      },
    });

    assert.equal(
      merged.security.publicEndpoints.length,
      defaults.security.publicEndpoints.length + 1,
    );
  });

  it('merges frontend security allow-pattern extensions', () => {
    const merged = merge(defaults, {
      security: {
        trustedHtmlSanitizerPatternsExtra: [/projectSanitizeHtml/],
        insecureTransportAllowedPatternsExtra: [/dev-api\.internal/],
      },
    });

    assert.equal(
      merged.security.trustedHtmlSanitizerPatterns.length,
      defaults.security.trustedHtmlSanitizerPatterns.length + 1,
    );
    assert.equal(
      merged.security.insecureTransportAllowedPatterns.length,
      defaults.security.insecureTransportAllowedPatterns.length + 1,
    );
  });

  it('pickList replaces when override is defined', () => {
    assert.deepEqual(pickList(['a'], ['b'], ['c']), ['b', 'c']);
    assert.deepEqual(pickList(['a'], undefined, ['c']), ['a', 'c']);
  });
});

describe('evaluateQualityGate', () => {
  const baseQuality = {
    behavior: { fatal: 0, errors: 0, score: 90 },
    testability: { fatal: 0, errors: 0, score: 90 },
    security: { fatal: 0, errors: 0, score: 90 },
    coverage: { adjusted: { branches: 95 } },
    overallScore: 92,
    tests: { failed: 0 },
  };

  const thresholds = {
    behavior: 85,
    testability: 85,
    security: 85,
    adjustedBranches: 90,
    overall: 90,
  };

  it('passes a healthy all-concern run', () => {
    const gate = evaluateQualityGate({
      quality: baseQuality,
      concern: 'all',
      thresholds,
    });
    assert.equal(gate.exitCode, 0);
  });

  it('fails overall when below threshold', () => {
    const gate = evaluateQualityGate({
      quality: { ...baseQuality, overallScore: 80 },
      concern: 'all',
      thresholds,
    });
    assert.ok(gate.failures.includes('overall'));
  });

  it('fails testability on errors even when score is high', () => {
    const gate = evaluateQualityGate({
      quality: {
        ...baseQuality,
        testability: { fatal: 0, errors: 2, score: 99 },
      },
      concern: 'testability',
      thresholds,
    });
    assert.ok(gate.failures.includes('testability'));
  });
});
