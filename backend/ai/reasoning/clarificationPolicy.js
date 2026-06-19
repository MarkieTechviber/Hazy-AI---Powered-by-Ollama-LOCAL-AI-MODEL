'use strict';

/**
 * Clarification policy — DISABLED.
 * Previously this would flag prompts containing words like "delete", "run",
 * "install", etc. and force a clarifying question before responding.
 * This was too aggressive and blocked normal usage, so it's been turned off.
 */
function shouldAskClarifyingQuestion(/* { mode, codeAnalysis, projectContext, safety, latestMessage } */) {
  return {
    needsQuestion: false,
    question: null
  };
}

module.exports = { shouldAskClarifyingQuestion };
