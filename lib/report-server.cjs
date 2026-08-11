const { existsSync } = require('node:fs');
const { join } = require('node:path');
const { spawn } = require('node:child_process');

const REPORT_PORT = 8080;

const getReportDir = (config) =>
  join(
    process.cwd(),
    config.reportDir,
  );

const startReportServer = (config) => {
  const reportDir = getReportDir(config);

  if (!existsSync(reportDir)) {
    throw new Error(
      `Quality report directory does not exist: ${reportDir}`,
    );
  }

  const pythonCommand =
    process.platform === 'win32'
      ? 'python'
      : 'python3';

  const pythonScript = `
import os
import http.server
import socketserver

os.chdir(${JSON.stringify(reportDir)})

socketserver.TCPServer.allow_reuse_address = True

server = socketserver.TCPServer(
    ("", ${REPORT_PORT}),
    http.server.SimpleHTTPRequestHandler
)

server.serve_forever()
`;

  const child = spawn(
    pythonCommand,
    [
      '-c',
      pythonScript,
    ],
    {
      cwd: process.cwd(),
      env: process.env,

      detached: true,
      stdio: 'ignore',
    },
  );

  /*
   * Prevent an asynchronous spawn error from crashing
   * the quality scanner after the scan has completed.
   */
  child.on(
    'error',
    (error) => {
      console.warn(
        `Unable to start quality report server: ${error.message}`,
      );
    },
  );

  child.unref();

  return {
    port: REPORT_PORT,

    /*
     * IMPORTANT:
     * This must remain a normal URL.
     * Do not put Markdown link syntax here.
     */
    url: `http://localhost:${REPORT_PORT}`,

    pid: child.pid,
  };
};

const spawnDetached = (
  command,
  args,
) =>
  new Promise((resolve) => {
    let settled = false;

    const child = spawn(
      command,
      args,
      {
        cwd: process.cwd(),
        env: process.env,

        detached: true,
        stdio: 'ignore',
      },
    );

    child.on(
      'error',
      () => {
        if (settled) {
          return;
        }

        settled = true;
        resolve(false);
      },
    );

    child.on(
      'spawn',
      () => {
        if (settled) {
          return;
        }

        settled = true;

        child.unref();

        resolve(true);
      },
    );
  });

const isVsCodeTerminal = () =>
  process.env.TERM_PROGRAM === 'vscode' ||
  Boolean(process.env.VSCODE_IPC_HOOK_CLI);

const openReportUrl = async (url) => {
  /*
   * VS Code Remote SSH:
   *
   * Try the VS Code CLI first. The remote VS Code environment
   * can hand the URL back through the VS Code client rather than
   * attempting to launch a Linux desktop browser on EC2.
   */
  if (isVsCodeTerminal()) {
    const openedWithVsCode =
      await spawnDetached(
        'code',
        [
          '--open-url',
          url,
        ],
      );

    if (openedWithVsCode) {
      return {
        opened: true,
        method: 'vscode',
      };
    }
  }

  /*
   * Native Windows.
   */
  if (process.platform === 'win32') {
    const opened =
      await spawnDetached(
        'cmd',
        [
          '/c',
          'start',
          '',
          url,
        ],
      );

    return {
      opened,
      method:
        opened
          ? 'windows'
          : null,
    };
  }

  /*
   * Native macOS.
   */
  if (process.platform === 'darwin') {
    const opened =
      await spawnDetached(
        'open',
        [url],
      );

    return {
      opened,
      method:
        opened
          ? 'macos'
          : null,
    };
  }

  /*
   * Linux with a desktop environment.
   *
   * EC2 normally will not have xdg-open, so failure here
   * is handled normally rather than becoming an unhandled
   * ChildProcess error.
   */
  const opened =
    await spawnDetached(
      'xdg-open',
      [url],
    );

  return {
    opened,
    method:
      opened
        ? 'linux'
        : null,
  };
};

const launchReport = async (config) => {
  const server =
    startReportServer(config);

  const result =
    await openReportUrl(
      server.url,
    );

  console.log('');
  console.log(
    `Quality dashboard: ${server.url}`,
  );

  if (!result.opened) {
    console.log(
      'Dashboard server started, but the browser could not be opened automatically.',
    );

    if (isVsCodeTerminal()) {
      console.log(
        'Use the forwarded localhost URL above from VS Code.',
      );
    }
  }

  return server;
};

module.exports = {
  launchReport,
  openReportUrl,
  startReportServer,
};
