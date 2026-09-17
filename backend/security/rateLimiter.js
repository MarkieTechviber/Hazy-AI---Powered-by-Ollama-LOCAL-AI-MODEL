'use strict';

class InMemoryRateLimiter {
  constructor() {
    this.buckets = new Map();
  }

  consume(key, { limit, windowMs }, now = Date.now()) {
    if (this.buckets.size >= 1000) {
      for (const [id, bucket] of this.buckets) if (bucket.resetAt <= now) this.buckets.delete(id);
      if (this.buckets.size >= 1000 && !this.buckets.has(key)) return { allowed: false, remaining: 0, resetAt: now + windowMs };
    }
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
