module.exports = [
  {
    id: 'endpoint-missing-authentication',
    concern: 'security',
    category: 'access-control',
    severity: 'warning',
    penalty: 15,
    description:
      'An API endpoint appears reachable without a recognized authentication boundary and is not explicitly declared public.',
  },
  {
    id: 'object-endpoint-authorization-review',
    concern: 'security',
    category: 'authorization',
    severity: 'info',
    penalty: 0,
    description:
      'An authenticated endpoint accepts an object identifier but no recognized authorization boundary was detected.',
  },
  {
    id: 'authentication-endpoint-missing-rate-limit',
    concern: 'security',
    category: 'authentication',
    severity: 'warning',
    penalty: 10,
    description:
      'An authentication-related endpoint appears to lack rate limiting.',
  },
  {
    id: 'unsafe-dom-html-injection',
    concern: 'security',
    scope: 'frontend',
    category: 'cross-site-scripting',
    severity: 'warning',
    penalty: 15,
    pattern:
      /(?:\.(?:innerHTML|outerHTML)\s*=|\.insertAdjacentHTML\s*\(|\bdocument\.write(?:ln)?\s*\(|\bdangerouslySetInnerHTML\s*=)/,
    description:
      'A browser HTML injection sink can execute attacker-controlled markup when its input is not sanitized.',
    suggestion:
      'Prefer textContent or normal framework rendering. When HTML is required, sanitize it with a reviewed sanitizer such as DOMPurify and document the trust boundary.',
  },
  {
    id: 'dynamic-code-execution',
    concern: 'security',
    scope: 'frontend',
    category: 'code-injection',
    severity: 'error',
    penalty: 25,
    pattern:
      /(?:\beval\s*\(|\bnew\s+Function\s*\(|\bset(?:Timeout|Interval)\s*\(\s*['"`])/,
    description:
      'Dynamic JavaScript execution can turn attacker-controlled strings into executable code and weakens Content Security Policy protections.',
    suggestion:
      'Replace string evaluation with explicit functions, structured data parsing, or a constrained dispatcher.',
  },
  {
    id: 'sensitive-browser-storage',
    concern: 'security',
    scope: 'frontend',
    category: 'credential-storage',
    severity: 'warning',
    penalty: 12,
    pattern:
      /\b(?:localStorage|sessionStorage)\s*\.\s*setItem\s*\(\s*(['"`])(?:access[_-]?token|refresh[_-]?token|auth(?:orization)?|jwt|password|secret|api[_-]?key|session|credential)s?\1\s*,/i,
    description:
      'A credential-like value is being written to browser storage, where injected scripts and malicious extensions may be able to read it.',
    suggestion:
      'Avoid persisting secrets in Web Storage. Prefer short-lived in-memory state or a Secure, HttpOnly, SameSite cookie when the architecture supports it.',
  },
  {
    id: 'wildcard-postmessage-origin',
    concern: 'security',
    scope: 'frontend',
    category: 'cross-origin-messaging',
    severity: 'warning',
    penalty: 10,
    pattern:
      /\.postMessage\s*\([^,\n]+,\s*(['"`])\*\1\s*\)/,
    description:
      'postMessage uses a wildcard target origin, so sensitive data may be delivered to an unexpected document after navigation or embedding.',
    suggestion:
      'Pass the exact trusted target origin and validate event.origin and, where appropriate, event.source when receiving messages.',
  },
  {
    id: 'insecure-frontend-transport',
    concern: 'security',
    scope: 'frontend',
    category: 'transport-security',
    severity: 'warning',
    penalty: 12,
    pattern:
      /\b(?:fetch|axios(?:\.(?:get|post|put|patch|delete|request))?|WebSocket)\s*\(\s*(['"`])(?:http|ws):\/\//i,
    description:
      'A browser request uses unencrypted HTTP or WebSocket transport, which can expose or modify data in transit and may be blocked as mixed content.',
    suggestion:
      'Use HTTPS or WSS for non-local endpoints. Configure an allowed pattern only for an intentional local-development target.',
  },
  {
    id: 'javascript-url',
    concern: 'security',
    scope: 'frontend',
    category: 'cross-site-scripting',
    severity: 'error',
    penalty: 25,
    pattern:
      /\b(?:href|src|location(?:\.href)?)\s*=\s*{?\s*(['"`])\s*javascript\s*:/i,
    description:
      'A javascript: URL executes code in the page context and can become a cross-site scripting path.',
    suggestion:
      'Use a button or an event handler for behavior, and allow only expected HTTP(S) or application-relative URLs for navigation.',
  },
];
