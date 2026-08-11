const NEW_DIRECTIVE =
  /^\s*\/\/\s*quality-scanner-ignore-next-line\s+(.+?)\s+--\s+(.+?)\s*$/;

const LEGACY_DIRECTIVE =
  /^\s*\/\/\s*(behavior|testability|security|quality)\s+ignore\s+next(?:\s+([^\s]+))?\s*$/;

const parseTargets = (value) =>
  String(value ?? '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);

const targetMatchesRule = (target, rule) =>
  target === '*' ||
  target === rule.id ||
  target === rule.category ||
  target === rule.concern;

const getSuppressionForLine = (lines, zeroBasedLineIndex, rule) => {
  const previousLine = lines[zeroBasedLineIndex - 1] ?? '';

  /*
   * Preferred syntax:
   *
   * // quality-scanner-ignore-next-line no-console-log -- Intentional example code.
   *
   * Multiple rules:
   *
   * // quality-scanner-ignore-next-line rule-one,rule-two -- Reviewed exception.
   */
  const modern = previousLine.match(NEW_DIRECTIVE);

  if (modern) {
    const targets = parseTargets(modern[1]);
    const reason = modern[2].trim();

    if (!reason) {
      return null;
    }

    if (!targets.some((target) => targetMatchesRule(target, rule))) {
      return null;
    }

    return {
      directive: 'quality-scanner-ignore-next-line',
      directiveLine: zeroBasedLineIndex,
      directiveSourceLine: zeroBasedLineIndex - 1,
      targets,
      reason,
    };
  }

  /*
   * Backward-compatible scanner syntax:
   *
   * // behavior ignore next
   * // behavior ignore next no-console-log
   * // behavior ignore next debugging
   *
   * // testability ignore next
   * // testability ignore next optional-callback
   *
   * // security ignore next endpoint-missing-authentication
   *
   * // quality ignore next
   */
  const legacy = previousLine.match(LEGACY_DIRECTIVE);

  if (!legacy) {
    return null;
  }

  const concern = legacy[1];
  const target = legacy[2] || '*';

  /*
   * "quality" is generic and can suppress any concern.
   *
   * Otherwise, a concern-specific directive only applies
   * to findings from that concern.
   */
  if (concern !== 'quality' && concern !== rule.concern) {
    return null;
  }

  if (!targetMatchesRule(target, rule)) {
    return null;
  }

  return {
    directive: `${concern} ignore next`,
    directiveLine: zeroBasedLineIndex,
    directiveSourceLine: zeroBasedLineIndex - 1,
    targets: [target],
    reason: 'Legacy scanner ignore comment.',
  };
};

const isScannerDirective = (line) =>
  /^\s*\/\/\s*(?:quality-scanner-ignore-next-line|(?:behavior|testability|security|quality)\s+ignore\s+next\b)/.test(
    line,
  );

module.exports = {
  getSuppressionForLine,
  isScannerDirective,
};
