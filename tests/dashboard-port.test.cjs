const assert = require('node:assert/strict');
const { it } = require('node:test');
const { mkdtempSync, mkdirSync, writeFileSync, rmSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { join, relative, resolve } = require('node:path');
const { spawnSync } = require('node:child_process');
const { startReportServer } = require('../lib/report-server.cjs');

it('serves the dashboard on the configured port and rejects an occupied port', async (t) => {
  const root = mkdtempSync(join(tmpdir(), 'quality-scanner-port-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  mkdirSync(join(root, 'report'));
  writeFileSync(join(root, 'report', 'index.html'), '<h1>Quality</h1>');
  const config = {
    reportDir: relative(process.cwd(), join(root, 'report')),
    dashboard: { preferenceFile: join(root, 'preferences.json') },
  };
  const close = (running) => new Promise((resolve, reject) => {
    running.server.close((error) => error ? reject(error) : resolve());
  });
  const automatic = await startReportServer(config);
  const port = automatic.port;
  assert.ok(port > 0);
  await close(automatic);

  config.dashboard.port = port;
  const fixed = await startReportServer(config);
  try {
    assert.equal(fixed.port, port);
    assert.equal(fixed.url, `http://127.0.0.1:${port}`);
    assert.equal(await (await fetch(fixed.url)).text(), '<h1>Quality</h1>');
    await assert.rejects(startReportServer(config), { code: 'EADDRINUSE' });
  } finally {
    await close(fixed);
  }
});

it('rejects invalid dashboard config ports', async () => {
  for (const port of [-1, 65536, 1.5, 'abc', '', true]) {
    await assert.rejects(
      startReportServer({ dashboard: { port } }),
      /Dashboard port must be an integer/,
    );
  }
});

it('validates CLI ports before scanning and allows CLI overrides of config', (t) => {
  const root = mkdtempSync(join(tmpdir(), 'quality-scanner-port-cli-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  writeFileSync(join(root, 'quality-scanner.config.cjs'),
    'module.exports = { dashboard: { port: "invalid" } };');
  const run = (args) => spawnSync(process.execPath,
    [resolve(__dirname, '../index.cjs'), '--list-rules', ...args],
    { cwd: root, encoding: 'utf8', timeout: 10000 });

  for (const args of [[], ['--port'], ['--port='], ['--port', '--no-open'], ['--port', '65536']]) {
    const result = run(args);
    assert.equal(result.status, 1, result.stderr);
    assert.match(result.stderr, /Dashboard port must be an integer/);
  }
  for (const args of [['--port', '8080'], ['--port=8080'], ['--port', '0']]) {
    const result = run(args);
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /Behavior rules/);
  }
});
