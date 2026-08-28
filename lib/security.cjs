const { existsSync, readFileSync } = require('node:fs');
const { dirname, extname, join, resolve } = require('node:path');
const { toRelativePath } = require('./files.cjs');
const { resetAndTest } = require('./regex.cjs');
const {
  getSuppressionForLine,
} = require('./suppressions.cjs');

const securityCatalog = require('../rules/security.cjs');
const securityCatalogById = new Map(
  securityCatalog.map((rule) => [rule.id, rule]),
);

const HTTP_METHODS = new Set(['get', 'post', 'put', 'patch', 'delete', 'options', 'head', 'all']);
const MUTATING_METHODS = new Set(['post', 'put', 'patch', 'delete']);

const anyPatternMatches = (patterns, value) =>
  (patterns ?? []).some((pattern) => resetAndTest(pattern, value));

const lineNumberAt = (content, index) => content.slice(0, index).split(/\r?\n/).length;

const findClosingParen = (content, openIndex) => {
  let depth = 0;
  let quote = null;
  let escaped = false;
  let lineComment = false;
  let blockComment = false;

  for (let i = openIndex; i < content.length; i += 1) {
    const char = content[i];
    const next = content[i + 1];

    if (lineComment) {
      if (char === '\n') lineComment = false;
      continue;
    }
    if (blockComment) {
      if (char === '*' && next === '/') {
        blockComment = false;
        i += 1;
      }
      continue;
    }
    if (quote) {
      if (escaped) {
        escaped = false;
        continue;
      }
      if (char === '\\') {
        escaped = true;
        continue;
      }
      if (char === quote) quote = null;
      continue;
    }

    if (char === '/' && next === '/') {
      lineComment = true;
      i += 1;
      continue;
    }
    if (char === '/' && next === '*') {
      blockComment = true;
      i += 1;
      continue;
    }
    if (char === '"' || char === "'" || char === '`') {
      quote = char;
      continue;
    }
    if (char === '(') depth += 1;
    if (char === ')') {
      depth -= 1;
      if (depth === 0) return i;
    }
  }

  return -1;
};

const splitTopLevelArgs = (value) => {
  const args = [];
  let start = 0;
  let paren = 0;
  let brace = 0;
  let bracket = 0;
  let quote = null;
  let escaped = false;
  let lineComment = false;
  let blockComment = false;

  for (let i = 0; i < value.length; i += 1) {
    const char = value[i];
    const next = value[i + 1];

    if (lineComment) {
      if (char === '\n') lineComment = false;
      continue;
    }
    if (blockComment) {
      if (char === '*' && next === '/') {
        blockComment = false;
        i += 1;
      }
      continue;
    }
    if (quote) {
      if (escaped) {
        escaped = false;
        continue;
      }
      if (char === '\\') {
        escaped = true;
        continue;
      }
      if (char === quote) quote = null;
      continue;
    }
    if (char === '/' && next === '/') {
      lineComment = true;
      i += 1;
      continue;
    }
    if (char === '/' && next === '*') {
      blockComment = true;
      i += 1;
      continue;
    }
    if (char === '"' || char === "'" || char === '`') {
      quote = char;
      continue;
    }
    if (char === '(') paren += 1;
    if (char === ')') paren -= 1;
    if (char === '{') brace += 1;
    if (char === '}') brace -= 1;
    if (char === '[') bracket += 1;
    if (char === ']') bracket -= 1;

    if (char === ',' && paren === 0 && brace === 0 && bracket === 0) {
      args.push(value.slice(start, i).trim());
      start = i + 1;
    }
  }

  const tail = value.slice(start).trim();
  if (tail) args.push(tail);
  return args;
};

const parseLiteralPath = (arg) => {
  const value = String(arg ?? '').trim();
  const match = value.match(/^(['"`])([^'"`$]*)\1$/);
  return match ? match[2] : null;
};

const normalizePath = (value) => {
  if (!value) return '/';
  const withSlash = value.startsWith('/') ? value : `/${value}`;
  return withSlash.replace(/\/+/g, '/').replace(/\/$/, '') || '/';
};

const joinRoutePath = (mountPath, routePath) => {
  if (!mountPath) return normalizePath(routePath);
  if (!routePath || routePath === '/') return normalizePath(mountPath);
  return normalizePath(`${mountPath}/${String(routePath).replace(/^\/+/, '')}`);
};

const pathPrefixMatches = (prefix, routePath) => {
  if (!prefix || prefix === '/') return true;
  const normalizedPrefix = normalizePath(prefix);
  const normalizedRoute = normalizePath(routePath);
  return normalizedRoute === normalizedPrefix || normalizedRoute.startsWith(`${normalizedPrefix}/`);
};

const getExpressReceivers = (content) => {
  const receivers = new Set(['app', 'router']);
  let match;

  const assignments = /\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:express\s*\(\s*\)|express\.Router\s*\(\s*\)|Router\s*\(\s*\))/g;
  while ((match = assignments.exec(content))) receivers.add(match[1]);

  const typed = /\b([A-Za-z_$][\w$]*)\s*:\s*(?:Express|Router)\b/g;
  while ((match = typed.exec(content))) receivers.add(match[1]);

  return [...receivers];
};

const extractChainedRouteCalls = (content, receivers) => {
  if (!receivers.length) return [];
  const receiverPart = receivers.map((name) => name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|');
  const routePattern = new RegExp(`\\b(${receiverPart})\\.route\\s*\\(`, 'g');
  const calls = [];
  let routeMatch;

  while ((routeMatch = routePattern.exec(content))) {
    const routeOpen = routePattern.lastIndex - 1;
    const routeClose = findClosingParen(content, routeOpen);
    if (routeClose < 0) continue;
    const routeArgs = splitTopLevelArgs(content.slice(routeOpen + 1, routeClose));
    if (routeArgs.length === 0) continue;

    let cursor = routeClose + 1;
    while (cursor < content.length) {
      const tail = content.slice(cursor);
      const methodMatch = tail.match(/^\s*\.\s*(get|post|put|patch|delete|options|head|all)\s*\(/);
      if (!methodMatch) break;
      const method = methodMatch[1];
      const methodStart = cursor + methodMatch.index + methodMatch[0].lastIndexOf('(');
      const methodClose = findClosingParen(content, methodStart);
      if (methodClose < 0) break;
      const methodArgs = splitTopLevelArgs(content.slice(methodStart + 1, methodClose));
      calls.push({
        receiver: routeMatch[1],
        method,
        start: routeMatch.index,
        end: methodClose + 1,
        line: lineNumberAt(content, routeMatch.index),
        args: [routeArgs[0], ...methodArgs],
        raw: content.slice(routeMatch.index, methodClose + 1),
      });
      cursor = methodClose + 1;
    }
    routePattern.lastIndex = Math.max(routeClose + 1, cursor);
  }

  return calls;
};

const extractCalls = (content, receivers) => {
  if (!receivers.length) return [];
  const receiverPart = receivers.map((name) => name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|');
  const pattern = new RegExp(`\\b(${receiverPart})\\.(use|get|post|put|patch|delete|options|head|all)\\s*\\(`, 'g');
  const calls = [];
  let match;

  while ((match = pattern.exec(content))) {
    const openIndex = pattern.lastIndex - 1;
    const closeIndex = findClosingParen(content, openIndex);
    if (closeIndex < 0) continue;
    const rawArgs = content.slice(openIndex + 1, closeIndex);
    const args = splitTopLevelArgs(rawArgs);
    calls.push({
      receiver: match[1],
      method: match[2],
      start: match.index,
      end: closeIndex + 1,
      line: lineNumberAt(content, match.index),
      args,
      raw: content.slice(match.index, closeIndex + 1),
    });
    pattern.lastIndex = closeIndex + 1;
  }

  return calls.concat(extractChainedRouteCalls(content, receivers)).sort((a, b) => a.start - b.start);
};

const getPathAndMiddleware = (call) => {
  const firstPath = parseLiteralPath(call.args[0]);
  if (firstPath != null) {
    return { path: firstPath, middlewareArgs: call.args.slice(1) };
  }
  return { path: null, middlewareArgs: call.args };
};

const hasAuth = (args, config) => anyPatternMatches(config.authMiddlewarePatterns, args.join(', '));
const hasAuthorization = (args, config) =>
  anyPatternMatches(config.authorizationMiddlewarePatterns, args.join(', '));
const hasRateLimit = (args, config) =>
  anyPatternMatches(config.rateLimitMiddlewarePatterns, args.join(', '));

const isPublicEndpoint = (method, path, config) => {
  if (!path) return null;
  for (const item of config.publicEndpoints ?? []) {
    const methodMatches = !item.method || item.method === '*' || item.method.toLowerCase() === method.toLowerCase();
    if (methodMatches && resetAndTest(item.pathPattern, path)) return item;
  }
  return null;
};

const isSensitivePath = (path, config) =>
  Boolean(path && anyPatternMatches(config.sensitivePathPatterns, path));

const hasObjectIdentifier = (path) =>
  Boolean(path && /\/:([A-Za-z_$][\w$]*id|id)(?:\/|$)/i.test(path));

const isAuthenticationFlow = (path, config) =>
  Boolean(path && anyPatternMatches(config.authenticationEndpointPatterns, path));

const createFinding = ({
  id,
  category,
  severity,
  penalty,
  line,
  code,
  description,
  suggestion,
  endpoint,
}) => {
  const catalog = securityCatalogById.get(id) ?? {};

  return {
    id,
    concern: 'security',
    category: category ?? catalog.category,
    severity: severity ?? catalog.severity,
    penalty: penalty ?? catalog.penalty,
    line,
    code,
    description: description ?? catalog.description ?? '',
    suggestion: suggestion ?? catalog.suggestion ?? '',
    endpoint,
  };
};

const addSecurityFinding = ({
  lines,
  call,
  finding,
  findings,
  suppressedFindings,
}) => {
  const rule = {
    id: finding.id,
    concern: 'security',
    category: finding.category,
  };

  const suppression = getSuppressionForLine(
    lines,
    call.line - 1,
    rule,
  );

  if (!suppression) {
    findings.push(finding);
    return;
  }

  suppressedFindings.push({
    ...finding,
    suppressed: true,
    suppression,
  });
};

const getFrontendAllowedPatterns = (rule, config) => {
  if (rule.id === 'unsafe-dom-html-injection') {
    return config.trustedHtmlSanitizerPatterns ?? [];
  }

  if (rule.id === 'insecure-frontend-transport') {
    return config.insecureTransportAllowedPatterns ?? [];
  }

  return [];
};

const analyzeFrontendSecurity = ({
  lines,
  config,
  findings,
  suppressedFindings,
}) => {
  if (config.frontendEnabled === false) return 0;

  const rules = securityCatalog.filter(
    (rule) => rule.scope === 'frontend' && rule.pattern,
  );

  let matches = 0;

  lines.forEach((line, index) => {
    if (/^\s*(?:\/\/|\/\*|\*)/.test(line)) return;

    for (const rule of rules) {
      if (!resetAndTest(rule.pattern, line)) continue;

      const allowedPatterns = [
        ...(rule.allowedPatterns ?? []),
        ...getFrontendAllowedPatterns(rule, config),
      ];

      if (
        allowedPatterns.some((pattern) =>
          resetAndTest(pattern, line),
        )
      ) {
        continue;
      }

      matches += 1;

      addSecurityFinding({
        lines,
        call: { line: index + 1 },
        findings,
        suppressedFindings,
        finding: createFinding({
          id: rule.id,
          line: index + 1,
          code: line.trim(),
        }),
      });
    }
  });

  return matches;
};

const resolveImportFile = (fromFile, specifier, projectFiles) => {
  if (!specifier.startsWith('.')) return null;
  const base = resolve(dirname(fromFile), specifier);
  const candidates = [
    base,
    ...['.ts', '.tsx', '.js', '.jsx', '.mts', '.cts', '.mjs', '.cjs'].map((extension) => `${base}${extension}`),
    ...['index.ts', 'index.tsx', 'index.js', 'index.jsx', 'index.mts', 'index.cts', 'index.mjs', 'index.cjs'].map((name) => join(base, name)),
  ];
  return candidates.find((candidate) => projectFiles.has(resolve(candidate)) && existsSync(candidate)) ?? null;
};

const extractImports = (file, content, projectFiles) => {
  const imports = new Map();
  let match;

  const defaultImport = /\bimport\s+([A-Za-z_$][\w$]*)\s+from\s+['"]([^'"]+)['"]/g;
  while ((match = defaultImport.exec(content))) {
    const target = resolveImportFile(file, match[2], projectFiles);
    if (target) imports.set(match[1], target);
  }

  const namedImport = /\bimport\s*{([^}]+)}\s*from\s*['"]([^'"]+)['"]/g;
  while ((match = namedImport.exec(content))) {
    const target = resolveImportFile(file, match[2], projectFiles);
    if (!target) continue;
    for (const part of match[1].split(',')) {
      const pieces = part.trim().split(/\s+as\s+/i);
      const local = (pieces[1] ?? pieces[0] ?? '').trim();
      if (local) imports.set(local, target);
    }
  }

  const commonJs = /\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*require\s*\(\s*['"]([^'"]+)['"]\s*\)/g;
  while ((match = commonJs.exec(content))) {
    const target = resolveImportFile(file, match[2], projectFiles);
    if (target) imports.set(match[1], target);
  }

  return imports;
};

const buildMountMap = (files, config) => {
  const projectFiles = new Set(files.map((file) => resolve(file)));
  const mountsByFile = new Map();

  for (const file of files) {
    const content = readFileSync(file, 'utf8');
    const receivers = getExpressReceivers(content);
    const calls = extractCalls(content, receivers).filter((call) => call.method === 'use');
    const imports = extractImports(file, content, projectFiles);

    for (const call of calls) {
      const { path, middlewareArgs } = getPathAndMiddleware(call);
      const protectedMount = hasAuth(middlewareArgs, config);
      const authorizedMount = hasAuthorization(middlewareArgs, config);
      const rateLimitedMount = hasRateLimit(middlewareArgs, config);

      for (const arg of middlewareArgs) {
        const trimmed = arg.trim();
        const identifierMatch = trimmed.match(/^([A-Za-z_$][\w$]*)$/);
        const requireMatch = trimmed.match(
          /^require\s*\(\s*['"]([^'"]+)['"]\s*\)$/,
        );

        let targetFile = null;
        if (identifierMatch) {
          targetFile = imports.get(identifierMatch[1]);
        } else if (requireMatch) {
          targetFile = resolveImportFile(
            file,
            requireMatch[1],
            projectFiles,
          );
        }

        if (!targetFile) continue;
        const mounts = mountsByFile.get(targetFile) ?? [];
        mounts.push({
          sourceFile: file,
          sourceLine: call.line,
          path: path ?? '/',
          protected: protectedMount,
          authorized: authorizedMount,
          rateLimited: rateLimitedMount,
        });
        mountsByFile.set(targetFile, mounts);
      }
    }
  }

  return mountsByFile;
};

const findApplicableUse = (uses, routeCall, routePath, config) =>
  uses
    .filter((call) => call.receiver === routeCall.receiver && call.start < routeCall.start)
    .map((call) => {
      const parsed = getPathAndMiddleware(call);
      return {
        ...call,
        ...parsed,
        protected: hasAuth(parsed.middlewareArgs, config),
        authorized: hasAuthorization(parsed.middlewareArgs, config),
        rateLimited: hasRateLimit(parsed.middlewareArgs, config),
      };
    })
    .filter((call) => call.path == null || pathPrefixMatches(call.path, routePath));

const analyzeFile = (file, config, mounts) => {
  const content = readFileSync(file, 'utf8');
  const lines = content.split(/\r?\n/);
  const receivers = getExpressReceivers(content);
  const calls = extractCalls(content, receivers);
  const uses = calls.filter((call) => call.method === 'use');
  const routeCalls = calls.filter((call) => HTTP_METHODS.has(call.method));
  const findings = [];
  const suppressedFindings = [];
  const endpoints = [];

  const frontendMatches = analyzeFrontendSecurity({
    lines,
    config,
    findings,
    suppressedFindings,
  });

  for (const call of routeCalls) {
    const { path, middlewareArgs } = getPathAndMiddleware(call);
    if (path == null) continue; // app.get('setting') and dynamically-computed paths are not treated as endpoints.

    const localUses = findApplicableUse(uses, call, path, config);
    const externalMounts = mounts ?? [];
    const inlineProtected = hasAuth(middlewareArgs, config);
    const inlineAuthorized = hasAuthorization(middlewareArgs, config);
    const inlineRateLimited = hasRateLimit(middlewareArgs, config);
    const locallyProtected = localUses.some((use) => use.protected);
    const locallyAuthorized = localUses.some((use) => use.authorized);
    const locallyRateLimited = localUses.some((use) => use.rateLimited);
    const externallyProtected =
      externalMounts.length > 0
        ? externalMounts.every((mount) => mount.protected)
        : false;
    const externallyAuthorized =
      externalMounts.length > 0
        ? externalMounts.every((mount) => mount.authorized)
        : false;
    const externallyRateLimited =
      externalMounts.length > 0
        ? externalMounts.every((mount) => mount.rateLimited)
        : false;
    const protectedEndpoint = inlineProtected || locallyProtected || externallyProtected;
    const authorizedEndpoint = inlineAuthorized || locallyAuthorized || externallyAuthorized;
    const rateLimitedEndpoint = inlineRateLimited || locallyRateLimited || externallyRateLimited;

    const effectivePaths = externalMounts.length
      ? externalMounts.map((mount) => joinRoutePath(mount.path, path))
      : [normalizePath(path)];
    const publicMatch = effectivePaths.map((effectivePath) => isPublicEndpoint(call.method, effectivePath, config)).find(Boolean);
    const endpoint = {
      method: call.method.toUpperCase(),
      path: effectivePaths[0],
      declaredPath: normalizePath(path),
      protected: protectedEndpoint,
      authorized: authorizedEndpoint,
      rateLimited: rateLimitedEndpoint,
      public: Boolean(publicMatch),
    };
    endpoints.push(endpoint);

    if (!protectedEndpoint && !publicMatch) {
      const sensitive = effectivePaths.some((effectivePath) =>
        isSensitivePath(effectivePath, config),
      );

      const mutating = MUTATING_METHODS.has(call.method);

      addSecurityFinding({
        lines,
        call,
        findings,
        suppressedFindings,

        finding: createFinding({
          id: 'endpoint-missing-authentication',
          category: 'access-control',

          severity: sensitive || mutating ? 'error' : 'warning',
          penalty: sensitive || mutating ? 25 : 15,

          line: call.line,
          code: call.raw.split(/\r?\n/)[0].trim(),

          description:
            `The scanner did not detect a recognized authentication/authorization boundary for ${call.method.toUpperCase()} ${effectivePaths[0]}. This endpoint may be intentionally protected elsewhere.`,

          suggestion:
            'Review whether authentication is enforced by route middleware, a parent router, a gateway/network boundary, or another control.',

          endpoint,
        }),
      });
    }

    if (protectedEndpoint && hasObjectIdentifier(path) && !authorizedEndpoint) {
      addSecurityFinding({
        lines,
        call,
        findings,
        suppressedFindings,

        finding: createFinding({
          id: 'object-endpoint-authorization-review',
          category: 'authorization',
          severity: 'info',
          penalty: 0,
          line: call.line,
          code: call.raw.split(/\r?\n/)[0].trim(),
          description: `The ${call.method.toUpperCase()} ${effectivePaths[0]} endpoint contains an object identifier and authentication was detected, but no recognized object/function authorization middleware was identified.`,
          suggestion: 'Verify that the handler or middleware checks whether the authenticated principal is authorized to access the requested object. Configure authorizationMiddlewarePatterns when the project uses a custom authorization boundary.',
          endpoint,
        }),
      });
    }

    if (isAuthenticationFlow(effectivePaths[0], config) && !rateLimitedEndpoint) {
      addSecurityFinding({
        lines,
        call,
        findings,
        suppressedFindings,

        finding: createFinding({
          id: 'authentication-endpoint-missing-rate-limit',
          category: 'authentication',
          severity: 'warning',
          penalty: 10,
          line: call.line,
          code: call.raw.split(/\r?\n/)[0].trim(),
          description: `The authentication-related endpoint ${call.method.toUpperCase()} ${effectivePaths[0]} does not have a recognized rate-limiting middleware.`,
          suggestion: 'Add an appropriate rate limiter at the endpoint/router/application boundary, or configure rateLimitMiddlewarePatterns if a project-specific limiter is already present.',
          endpoint,
        }),
      });
    }
  }

  const score = Math.max(0, 100 - findings.reduce((sum, finding) => sum + finding.penalty, 0));
  return {
    file,
    relativeFile: toRelativePath(file),
    framework:
      routeCalls.length || uses.length
        ? 'express'
        : frontendMatches
          ? 'browser'
          : null,
    endpoints,
    findings,
    suppressedFindings,
    score,
  };
};

const analyzeSecurity = ({ files, config }) => {
  if (config.security?.enabled === false) return [];
  const securityConfig = config.security;
  const mountMap = buildMountMap(files, securityConfig);
  return files
    .map((file) => analyzeFile(file, securityConfig, mountMap.get(resolve(file)) ?? []))
    .filter((result) => result.framework || result.findings.length || result.endpoints.length);
};

module.exports = {
  analyzeFrontendSecurity,
  analyzeSecurity,
  extractCalls,
  getExpressReceivers,
  splitTopLevelArgs,
};
