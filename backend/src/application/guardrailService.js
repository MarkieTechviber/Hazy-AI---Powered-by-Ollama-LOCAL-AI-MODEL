'use strict';

const { INJECTION_PATTERNS, SECURITY_LIMITS } = require('../domain/security/guardrailPolicy');
const { countMessagesTokens, resolveContextBudget } = require('../../ai/context/contextWindowManager');

function hasPromptInjection(text) {
  if (!text || typeof text !== 'string') return false;
  return INJECTION_PATTERNS.some((pattern) => pattern.test(text));
}

function validateRequest(body = {}) {
  const messages = body.messages || [];

  // 1. Check for prompt injection in the last user message
  const lastUserMsg = [...messages].reverse().find(m => m && m.role === 'user')?.content || '';
  if (hasPromptInjection(lastUserMsg)) {
    return {
      allowed: false,
      reason: 'Security violation: Prompt injection or system instruction override detected.',
      status: 400
    };
  }

  // 2. Check for token budget limit
  const estimatedInputTokens = countMessagesTokens(messages);
  if (estimatedInputTokens > SECURITY_LIMITS.maxAbsoluteInputTokens) {
    return {
      allowed: false,
      reason: `Resource constraint violated: Input context of ${estimatedInputTokens} tokens exceeds absolute system limit of ${SECURITY_LIMITS.maxAbsoluteInputTokens}.`,
      status: 400
    };
  }

  // 3. Check against model context window limits
  const budget = resolveContextBudget(body);
  if (estimatedInputTokens > budget.contextWindow) {
    return {
      allowed: false,
      reason: `Context window exceeded: Request of ${estimatedInputTokens} tokens exceeds the model's total context limit of ${budget.contextWindow}. Please clear your chat history or use a shorter prompt.`,
      status: 400
    };
  }

  return {
    allowed: true
  };
}

module.exports = {
  hasPromptInjection,
  validateRequest
};
