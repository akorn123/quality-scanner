module.exports = [
    {
      id: 'endpoint-missing-authentication',
      concern: 'security',
      category: 'access-control',
      description: 'An API endpoint appears reachable without a recognized authentication boundary and is not explicitly declared public.',
    },
    {
      id: 'object-endpoint-authorization-review',
      concern: 'security',
      category: 'authorization',
      description: 'An authenticated endpoint accepts an object identifier but no recognized authorization boundary was detected.',
    },
    {
      id: 'authentication-endpoint-missing-rate-limit',
      concern: 'security',
      category: 'authentication',
      description: 'An authentication-related endpoint appears to lack rate limiting.',
    },
  ];
  