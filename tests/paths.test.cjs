const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { join } = require('node:path');

const files = require('../lib/files.cjs');
const coverage = require('../lib/coverage.cjs');
const {
  toArtifactSourceKey,
  analyzeCoverageArtifacts,
} = require('../lib/artifacts.cjs');

let paths = null;
try {
  paths = require('../lib/paths.cjs');
} catch {
  paths = null;
}

const toRelativePath = paths?.toRelativePath
  ?? files.toRelativePath;

describe('toRelativePath', () => {
  it('normalizes backslashes', () => {
    const relative = toRelativePath('src\\utils\\helpers.js');
    assert.equal(relative.includes('\\'), false);
    assert.match(relative, /src\/utils\/helpers\.js$/);
  });

  it('turns absolute paths into repo-relative paths', () => {
    const absolute = join(process.cwd(), 'src', 'index.js');
    const relative = toRelativePath(absolute);
    assert.equal(relative.includes('\\'), false);
    assert.equal(relative.startsWith('/') || /^[A-Za-z]:/.test(relative), false);
    assert.match(relative, /src\/index\.js$/);
  });

  it('coverage.toRelativePath also normalizes separators', () => {
    const relative = coverage.toRelativePath('lib\\quality.cjs');
    assert.equal(relative, 'lib/quality.cjs');
  });
});

describe('artifacts path key stripping', () => {
  it('uses toArtifactSourceKey from lib/artifacts.cjs', () => {
    const reportDir = join(process.cwd(), 'coverage', 'lcov-report');
    const htmlFile = join(reportDir, 'src', 'app.js.html');

    assert.equal(
      toArtifactSourceKey(reportDir, htmlFile),
      'src/app.js',
    );

    assert.equal(typeof analyzeCoverageArtifacts, 'function');
  });
});
