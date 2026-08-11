const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const {
  averageScore,
  getAdjustedMetric,
  computePassRate,
  evaluateQualityGate,
} = require('../lib/quality.cjs');

describe('averageScore', () => {
  it('returns null for an empty list (fail-closed)', () => {
    assert.equal(averageScore([]), null);
  });

  it('averages result scores', () => {
    assert.equal(
      averageScore([{ score: 80 }, { score: 100 }]),
      90,
    );
  });
});

describe('getAdjustedMetric', () => {
  it('caps approvedExcluded so excluded never exceeds total', () => {
    const metric = getAdjustedMetric(
      {
        total: 10,
        covered: 5,
        skipped: 2,
        pct: 50,
      },
      100,
    );

    assert.equal(metric.excluded, 10);
    assert.equal(metric.adjustedTotal, 0);
    assert.equal(metric.adjustedPercent, 100);
    assert.equal(metric.approvedExcluded, 100);
  });

  it('applies a modest approvedExcluded against remaining total', () => {
    const metric = getAdjustedMetric(
      {
        total: 10,
        covered: 8,
        skipped: 0,
        pct: 80,
      },
      2,
    );

    assert.equal(metric.excluded, 2);
    assert.equal(metric.adjustedTotal, 8);
    assert.equal(metric.adjustedPercent, 100);
  });
});

describe('computePassRate', () => {
  it('ignores skips and todos (8/9 ≈ 88.89)', () => {
    const rate = computePassRate({
      passed: 8,
      failed: 1,
      skipped: 1,
      todo: 0,
    });

    assert.equal(rate, 88.89);
  });
});

describe('evaluateQualityGate', () => {
  it('is exported for gate evaluation', () => {
    assert.equal(typeof evaluateQualityGate, 'function');
  });
});
