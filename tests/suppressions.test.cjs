const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const {
  getSuppressionForLine,
} = require('../lib/suppressions.cjs');

const behaviorRule = {
  id: 'no-console-log',
  category: 'debugging',
  concern: 'behavior',
};

const securityAuthRule = {
  id: 'endpoint-missing-authentication',
  category: 'access-control',
  concern: 'security',
};

describe('getSuppressionForLine', () => {
  it('matches modern directive with reason to rule id', () => {
    const lines = [
      '// quality-scanner-ignore-next-line no-console-log -- Intentional example code.',
      "console.log('ok');",
    ];

    const suppression = getSuppressionForLine(
      lines,
      1,
      behaviorRule,
    );

    assert.deepEqual(suppression, {
      directive: 'quality-scanner-ignore-next-line',
      directiveLine: 1,
      directiveSourceLine: 0,
      targets: ['no-console-log'],
      reason: 'Intentional example code.',
    });
  });

  it('returns null for modern directive without reason', () => {
    const lines = [
      '// quality-scanner-ignore-next-line no-console-log',
      "console.log('ok');",
    ];

    assert.equal(
      getSuppressionForLine(lines, 1, behaviorRule),
      null,
    );
  });

  it('supports legacy behavior ignore next', () => {
    const lines = [
      '// behavior ignore next',
      "console.log('ok');",
    ];

    const suppression = getSuppressionForLine(
      lines,
      1,
      behaviorRule,
    );

    assert.equal(suppression.directive, 'behavior ignore next');
    assert.deepEqual(suppression.targets, ['*']);
    assert.equal(
      suppression.reason,
      'Legacy scanner ignore comment.',
    );
  });

  it('supports legacy security ignore next with rule id', () => {
    const lines = [
      '// security ignore next endpoint-missing-authentication',
      "app.get('/users', handler);",
    ];

    const suppression = getSuppressionForLine(
      lines,
      1,
      securityAuthRule,
    );

    assert.equal(
      suppression.directive,
      'security ignore next',
    );
    assert.deepEqual(suppression.targets, [
      'endpoint-missing-authentication',
    ]);
  });

  it('applies quality ignore next to any concern', () => {
    const lines = [
      '// quality ignore next',
      "app.post('/login', handler);",
    ];

    const suppression = getSuppressionForLine(
      lines,
      1,
      securityAuthRule,
    );

    assert.equal(suppression.directive, 'quality ignore next');
    assert.deepEqual(suppression.targets, ['*']);
  });
});
