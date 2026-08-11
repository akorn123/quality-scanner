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
];
