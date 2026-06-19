'use strict';

/**
 * Domain-level safety patterns and budgeting policies for the AI Chatbot application.
 */
const INJECTION_PATTERNS = [
  /\b(ignore|bypass|override|forget|reset|clear)\b.*\b(rules|instructions|directives|system prompt|guidelines|prompt|constraints)\b/i,
  /\b(leak|reveal|show|print|output|display)\b.*\b(system prompt|hidden instructions|instructions above)\b/i,
  /\b(jailbreak|developer mode|dan mode|do anything now)\b/i,
  /\b(you are now an unrestricted|pretend to be an unrestricted|act as a rogue)\b/i
];

const SECURITY_LIMITS = Object.freeze({
  maxAbsoluteInputTokens: 32768,       // Hard cap to prevent system-wide memory exhaustion / OOM
  budgetSafetyThreshold: 0.95         // Truncate/warn if context exceeds 95% of safe limit
});

module.exports = {
  INJECTION_PATTERNS,
  SECURITY_LIMITS
};
