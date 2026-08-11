const GREEN = '\x1b[32m';
const DIM = '\x1b[90m';
const RESET = '\x1b[0m';

const supportsInteractiveProgress = () =>
  Boolean(process.stdout.isTTY) &&
  process.env.CI !== 'true';

const formatDuration = (milliseconds) => {
  const totalSeconds = Math.floor(milliseconds / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;

  if (minutes > 0) {
    return `${minutes}m ${String(seconds).padStart(2, '0')}s`;
  }

  return `${seconds}s`;
};

const clearLine = () => {
  if (supportsInteractiveProgress()) {
    process.stdout.write('\r\x1b[2K');
  }
};

/**
 * Indeterminate progress.
 *
 * Use this when we know work is happening but do not yet know
 * what constitutes 100%.
 *
 * Example:
 *
 *   ░░▒▓█▓▒░░░  Discovering tests...
 */
const createProgress = ({
  label = 'Working',
  width = 32,
} = {}) => {
  const interactive = supportsInteractiveProgress();
  const startedAt = Date.now();

  let timer = null;
  let frame = 0;
  let stopped = false;
  let currentMessage = label;

  const render = () => {
    if (!interactive || stopped) {
      return;
    }

    const position = frame % width;

    const bar = Array.from(
      { length: width },
      (_, index) => {
        const distance = Math.abs(index - position);

        if (distance === 0) {
          return `${GREEN}█${RESET}`;
        }

        if (distance === 1) {
          return `${GREEN}▓${RESET}`;
        }

        if (distance === 2) {
          return `${GREEN}▒${RESET}`;
        }

        return `${DIM}░${RESET}`;
      },
    ).join('');

    const elapsed = formatDuration(
      Date.now() - startedAt,
    );

    process.stdout.write(
      `\r\x1b[2K  ${bar}  ${currentMessage}  ${elapsed}`,
    );

    frame += 1;
  };

  const stop = () => {
    if (stopped) {
      return;
    }

    stopped = true;

    if (timer) {
      clearInterval(timer);
      timer = null;
    }

    clearLine();
  };

  return {
    start(message = label) {
      currentMessage = message;

      if (!interactive) {
        console.log(`  ${message}`);
        return;
      }

      render();

      timer = setInterval(
        render,
        90,
      );
    },

    update(message) {
      currentMessage = message;
    },

    stop,

    succeed(message = 'Complete') {
      stop();

      const elapsed = formatDuration(
        Date.now() - startedAt,
      );

      console.log(
        `  ${GREEN}✓${RESET} ${message} (${elapsed})`,
      );
    },

    fail(message = 'Failed') {
      stop();

      const elapsed = formatDuration(
        Date.now() - startedAt,
      );

      console.log(
        `  ✗ ${message} (${elapsed})`,
      );
    },
  };
};

/**
 * Determinate progress.
 *
 * Use this after the amount of work is known.
 *
 * Example:
 *
 *   ████████████░░░░░░  63%  157/249  Running tests
 */
const createDeterminateProgress = ({
  label = 'Working',
  total,
  width = 32,
} = {}) => {
  const interactive = supportsInteractiveProgress();
  const startedAt = Date.now();

  let normalizedTotal = Math.max(
    1,
    Number(total) || 1,
  );

  let completed = 0;
  let currentMessage = label;
  let stopped = false;
  let timer = null;
  let forcePercent = null;

  const render = () => {
    if (stopped) {
      return;
    }

    const calculatedPercent = Math.round(
      (completed / normalizedTotal) * 100,
    );

    const percent =
      forcePercent == null
        ? Math.min(100, calculatedPercent)
        : Math.min(100, Math.max(0, forcePercent));

    const filled = Math.min(
      width,
      Math.round((percent / 100) * width),
    );

    const filledBar =
      `${GREEN}${'█'.repeat(filled)}${RESET}`;

    const emptyBar =
      `${DIM}${'░'.repeat(width - filled)}${RESET}`;

    const elapsed = formatDuration(
      Date.now() - startedAt,
    );

    const waiting =
      completed === 0 && forcePercent == null
        ? '  starting…'
        : '';

    const output =
      `  ${filledBar}${emptyBar}` +
      `  ${String(percent).padStart(3, ' ')}%` +
      `  ${completed}/${normalizedTotal}` +
      `  ${currentMessage}` +
      `${waiting}` +
      `  ${elapsed}`;

    if (interactive) {
      process.stdout.write(`\r\x1b[2K${output}`);
    } else {
      console.log(output);
    }
  };

  const stop = () => {
    if (stopped) {
      return;
    }

    stopped = true;

    if (timer) {
      clearInterval(timer);
      timer = null;
    }

    clearLine();
  };

  return {
    start(message = label) {
      currentMessage = message;
      render();

      if (interactive && !timer) {
        timer = setInterval(render, 200);
      }
    },

    setTotal(value) {
      normalizedTotal = Math.max(
        1,
        Number(value) || normalizedTotal,
      );
      completed = Math.min(completed, normalizedTotal);
      render();
    },

    update(
      value,
      message = currentMessage,
    ) {
      forcePercent = null;
      completed = Math.min(
        normalizedTotal,
        Math.max(0, Number(value) || 0),
      );
      currentMessage = message;
      render();
    },

    increment(
      message = currentMessage,
    ) {
      forcePercent = null;
      completed = Math.min(
        normalizedTotal,
        completed + 1,
      );
      currentMessage = message;
      render();
    },

    /**
     * Tests may all be complete while coverage is still being written.
     *
     * This intentionally renders 99% even though completed === total.
     */
    coverage(message = 'Generating coverage') {
      completed = normalizedTotal;
      currentMessage = message;
      forcePercent = 99;
      render();
    },

    succeed(
      message = 'Tests + coverage ready',
    ) {
      completed = normalizedTotal;
      currentMessage = message;
      forcePercent = 100;
      render();
      stop();

      console.log(
        `  ${GREEN}✓${RESET} ${message} (${formatDuration(
          Date.now() - startedAt,
        )})`,
      );
    },

    fail(message = 'Test collection failed') {
      stop();

      console.log(
        `  ✗ ${message} (${formatDuration(
          Date.now() - startedAt,
        )})`,
      );
    },

    stop,
  };
};

module.exports = {
  createProgress,
  createDeterminateProgress,
  formatDuration,
  supportsInteractiveProgress,
};
