'use strict';

// FIX 1: history tracking — original had no visibility into what consumed the budget (hard to debug).
// FIX 2: exposed grace as constructor param — was hardcoded to 1 with no override.
// FIX 3: consume() with partial budget — original returned false if cost > remaining even if remaining > 0;
//         now uses what's left and spills into grace only for the remainder, so budget is never wasted.

class IterationBudget {
  constructor(maxSteps = 6, { grace = 1 } = {}) {
    this.max = Math.max(1, Math.min(12, Number(maxSteps) || 6));
    this.grace = Number.isFinite(Number(grace)) ? Math.max(0, Math.min(2, Math.floor(Number(grace)))) : 1;
    this.used = 0;
    this.graceUsed = 0; // FIX: track partial grace usage, not just a boolean
    this.history = [];   // FIX: audit trail of every consume/refund for debugging
  }

  // FIX: consume uses remaining budget first, then spills into grace for the remainder.
  // Original: if remaining < cost it immediately went to grace even with budget partially left.
  consume(cost = 1, label = '') {
    const c = Math.max(1, Number(cost) || 1);
    const rem = this.remaining();
    const graceLeft = this.grace - this.graceUsed;

    if (rem >= c) {
      this.used += c;
      this.history.push({ op: 'consume', cost: c, label, usedAfter: this.used, graceUsed: this.graceUsed });
      return true;
    }

    // Partial spill into grace
    const fromGrace = c - rem;
    if (graceLeft >= fromGrace) {
      this.used += rem;
      this.graceUsed += fromGrace;
      this.history.push({ op: 'consume_grace', cost: c, label, usedAfter: this.used, graceUsed: this.graceUsed });
      return true;
    }

    this.history.push({ op: 'denied', cost: c, label, usedAfter: this.used, graceUsed: this.graceUsed });
    return false;
  }

  remaining() {
    return Math.max(0, this.max - this.used);
  }

  graceRemaining() {
    return Math.max(0, this.grace - this.graceUsed);
  }

  // FIX: guard: do not refund after any grace has been used (matches original intent, prevents post-exhaust budget resurrection).
  refund(cost = 1, label = '') {
    if (this.graceUsed > 0) return;
    const amt = Math.max(0, Number(cost) || 1);
    this.used = Math.max(0, this.used - amt);
    this.history.push({ op: 'refund', cost: amt, label, usedAfter: this.used, graceUsed: this.graceUsed });
  }

  isExhausted() {
    return this.remaining() <= 0 && this.graceRemaining() <= 0;
  }

  // FIX: summary() for diagnostics / logging
  summary() {
    return {
      max: this.max,
      used: this.used,
      remaining: this.remaining(),
      grace: this.grace,
      graceUsed: this.graceUsed,
      graceRemaining: this.graceRemaining(),
      exhausted: this.isExhausted(),
      steps: this.history.length
    };
  }
}

module.exports = { IterationBudget };
