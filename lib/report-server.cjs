const {
  createReadStream,
  existsSync,
  statSync,
} = require('node:fs');
const { join, extname } = require('node:path');
const http = require('node:http');
const { spawn } = require('node:child_process');

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.htm': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.cjs': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
};

const getReportDir = (config) =>
  join(
    process.cwd(),
    config.reportDir,
  );

const safeJoin = (root, requestPath) => {
  const decoded = decodeURIComponent(
    (requestPath ?? '/').split('?')[0],
  );

  const normalized = decoded.replace(/^\/+/, '');
  const candidate = join(root, normalized || 'index.html');
  const rootResolved = join(root);

  if (
    candidate !== rootResolved &&
    !candidate.startsWith(`${rootResolved}\\`) &&
    !candidate.startsWith(`${rootResolved}/`)
  ) {
    return null;
  }

  return candidate;
};

const startReportServer = (config) =>
  new Promise((resolve, reject) => {
    const reportDir = getReportDir(config);

    if (!existsSync(reportDir)) {
      reject(
        new Error(
          `Quality report directory does not exist: ${reportDir}`,
        ),
      );
      return;
    }

    const server = http.createServer((req, res) => {
      try {
        let filePath = safeJoin(reportDir, req.url ?? '/');
        if (!filePath) {
          res.writeHead(403);
          res.end('Forbidden');
          return;
        }

        if (existsSync(filePath) && statSync(filePath).isDirectory()) {
          filePath = join(filePath, 'index.html');
        }

        if (!existsSync(filePath)) {
          res.writeHead(404);
          res.end('Not found');
          return;
        }

        const type =
          MIME_TYPES[extname(filePath).toLowerCase()] ??
          'application/octet-stream';

        res.writeHead(200, {
          'Content-Type': type,
        });

        createReadStream(filePath).pipe(res);
      } catch (error) {
        res.writeHead(500);
        res.end(error.message ?? 'Server error');
      }
    });

    server.once('error', reject);

    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      const port =
        typeof address === 'object' && address
          ? address.port
          : null;

      if (!port) {
        reject(
          new Error(
            'Quality report server failed to bind an ephemeral port.',
          ),
        );
        return;
      }

      resolve({
        port,
        url: `http://127.0.0.1:${port}`,
        server,
      });
    });
  });

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
    await startReportServer(config);

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
