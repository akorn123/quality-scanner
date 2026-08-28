const assert = require('node:assert/strict');
const { after, describe, it } = require('node:test');
const {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} = require('node:fs');
const { tmpdir } = require('node:os');
const { join, relative } = require('node:path');

const defaults = require('../config.cjs');
const {
  ensureDashboardPreferences,
  getPreferenceFile,
  loadDashboardPreferences,
  saveDashboardPreferences,
} = require('../lib/preferences.cjs');
const { startReportServer } = require('../lib/report-server.cjs');

describe('dashboard theme preferences', () => {
  const tempRoot = mkdtempSync(
    join(tmpdir(), 'quality-scanner-preferences-'),
  );

  after(() => {
    rmSync(tempRoot, { recursive: true, force: true });
  });

  it('creates a dark default in the project .quality-scanner folder', () => {
    const projectRoot = join(tempRoot, 'default-project');
    mkdirSync(projectRoot, { recursive: true });

    const result = ensureDashboardPreferences(
      defaults,
      projectRoot,
    );

    assert.equal(
      result.file,
      join(
        projectRoot,
        '.quality-scanner',
        'quality-scanner-preferences.json',
      ),
    );
    assert.equal(result.preferences.theme, 'dark');
    assert.equal(existsSync(result.file), true);
    assert.deepEqual(
      JSON.parse(readFileSync(result.file, 'utf8')),
      { theme: 'dark' },
    );
  });

  it('retains a saved light preference across later runs', () => {
    const projectRoot = join(tempRoot, 'existing-project');
    mkdirSync(projectRoot, { recursive: true });

    saveDashboardPreferences(
      defaults,
      { theme: 'light' },
      projectRoot,
    );

    assert.deepEqual(
      loadDashboardPreferences(defaults, projectRoot),
      { theme: 'light' },
    );
    assert.deepEqual(
      ensureDashboardPreferences(defaults, projectRoot).preferences,
      { theme: 'light' },
    );
  });

  it('rejects invalid theme values', () => {
    assert.throws(
      () =>
        saveDashboardPreferences(
          defaults,
          { theme: 'system' },
          tempRoot,
        ),
      /dark.*light/i,
    );
  });

  it('loads and saves the preference through the dashboard server', async () => {
    const projectRoot = join(tempRoot, 'server-project');
    const reportDir = join(projectRoot, 'reports', 'quality-scanner');
    const preferenceFile = join(
      projectRoot,
      '.quality-scanner',
      'quality-scanner-preferences.json',
    );

    mkdirSync(reportDir, { recursive: true });
    writeFileSync(join(reportDir, 'index.html'), '<h1>Report</h1>', 'utf8');

    const config = {
      ...defaults,
      reportDir: relative(process.cwd(), reportDir),
      dashboard: {
        defaultTheme: 'dark',
        preferenceFile,
      },
    };

    const running = await startReportServer(config);

    try {
      const initialResponse = await fetch(
        `${running.url}/api/preferences`,
      );
      assert.equal(initialResponse.status, 200);
      assert.deepEqual(await initialResponse.json(), { theme: 'dark' });

      const updateResponse = await fetch(
        `${running.url}/api/preferences`,
        {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ theme: 'light' }),
        },
      );

      assert.equal(updateResponse.status, 200);
      assert.deepEqual(await updateResponse.json(), { theme: 'light' });
      assert.deepEqual(
        JSON.parse(readFileSync(getPreferenceFile(config), 'utf8')),
        { theme: 'light' },
      );
    } finally {
      await new Promise((resolve, reject) => {
        running.server.close((error) => {
          if (error) reject(error);
          else resolve();
        });
      });
    }
  });
});
