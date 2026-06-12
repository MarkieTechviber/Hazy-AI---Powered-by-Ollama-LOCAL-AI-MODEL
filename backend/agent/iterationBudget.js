'use strict';

// Phase 2: Explicit IterationBudget for the observe-plan-reason-act-verify-reflect loop.
// Consume 1 per model turn (Act). Grace for one final chance after exhaustion.
// Refund for cheap ops (e.g. calculator.evaluate, plan.manage) so they don't burn full budget.
// Node single-threaded; counters are "thread-safe-ish" for sequential async turns in one call.

class IterationBudget {
  constructor(maxSteps = 6) {
    this.max = Math.max(1, Math.min(12, Number(maxSteps) || 6));
    this.used = 0;
    this.grace = 1;
    this.graceUsed = false;
  }

  // consume(cost=1): returns true if step allowed (uses grace if needed)
  consume(cost = 1) {
    const c = Math.max(1, Number(cost) || 1);
    if (this.remaining() >= c) {
      this.used += c;
      return true;
    }
    if (!this.graceUsed) {
      this.graceUsed = true;
      return true;
    }
    return false;
  }

  remaining() {
    return Math.max(0, this.max - this.used);
  }

  // graceRemaining for introspection
  graceRemaining() {
    return this.graceUsed ? 0 : this.grace;
  }

  // refund for cheap operations (calc, plan updates) to allow more complex steps
  // Guard: do not allow refund to revive budget after grace has been used (prevents exceeding max+grace via cheap sequences post-exhaust).
  // Ensures behavior closer to original for-loop bounds while still favoring cheap ops before grace.
  refund(cost = 1) {
    if (this.graceUsed) return;
    const amt = Math.max(0, Number(cost) || 1);
    this.used = Math.max(0, this.used - amt);
  }

  isExhausted() {
    return this.remaining() <= 0 && this.graceUsed;
  }
}

module.exports = { IterationBudget };
