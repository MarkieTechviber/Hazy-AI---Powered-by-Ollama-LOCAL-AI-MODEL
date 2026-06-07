'use strict';

class InMemoryRateLimiter {
  constructor() {
    this.buckets = new Map();
  }

  consume(key, { limit, windowMs }, now = Date.now()) {
    const bucket = this.buckets.get(key);
    if (!bucket || bucket.resetAt <= now) {
      const next = { count: 1, resetAt: now + windowMs };
      this.buckets.set(key, next);
      return { allowed: true, remaining: Math.max(0, limit - 1), resetAt: next.resetAt };
    }

    bucket.count += 1;
    return {
      allowed: bucket.count <= limit,
      remaining: Math.max(0, limit - bucket.count),
      resetAt: bucket.resetAt
    };
  }

  clear() {
    this.buckets.clear();
  }
}

module.exports = { InMemoryRateLimiter };
