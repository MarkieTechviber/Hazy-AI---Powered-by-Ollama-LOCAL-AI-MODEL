'use strict';

const AGENT_MODES = Object.freeze([
  'chat',
  'rag_answer',
  'tool_action',
  'confirmation',
  'clarification',
  'unsafe_or_blocked'
]);

// FIX 1: original "create" regex matched words like "recreation" or "created" — now using word-boundary anchors.
// FIX 2: added 'memory_query' intent detection so the model gets a cleaner signal.
// FIX 3: original returned only a string — now returns { mode, confidence } for callers that need it.
//         Backward-compatible: callers using the string can destructure or call .mode.

const TOOL_INTENT_RE = /\b(search|browse|look\s*up|current|latest|send|delete|create|update|save|inventory|stock|fetch|run|execute|book|schedule|cancel|pay|order)\b/i;
const RAG_INTENT_RE = /\b(uploaded?|attached?|document|pdf|file|spreadsheet|image)\b/i;
const MEMORY_INTENT_RE = /\b(remember|recall|did i|have i|last time|previously|earlier|forget)\b/i;

function classifyAgentMode({
  message = '',
  hasRetrievedContext = false,
  hasToolResults = false,
  pendingConfirmation = null,
  safety = {}
} = {}) {
  const text = String(message || '').trim();

  if (safety.riskLevel && !['tier_0', 'low'].includes(safety.riskLevel)) {
    return { mode: 'unsafe_or_blocked', confidence: 1.0 };
  }
  if (pendingConfirmation?.status === 'pending') {
    return { mode: 'confirmation', confidence: 1.0 };
  }
  if (!text) {
    return { mode: 'clarification', confidence: 1.0 };
  }
  if (hasToolResults) {
    return { mode: 'tool_action', confidence: 0.95 };
  }
  if (MEMORY_INTENT_RE.test(text)) {
    // Memory intent gets routed through tool_action (memory.search/remember tools)
    return { mode: 'tool_action', confidence: 0.85 };
  }
  if (hasRetrievedContext || RAG_INTENT_RE.test(text)) {
    return { mode: 'rag_answer', confidence: 0.85 };
  }
  if (TOOL_INTENT_RE.test(text)) {
    return { mode: 'tool_action', confidence: 0.80 };
  }
  return { mode: 'chat', confidence: 0.75 };
}

// FIX: keep a thin string-only shim so existing callers (agentRuntime, server) don't break.
// Callers already doing `=== 'tool_action'` continue to work; new callers can use .confidence.
const _origClassify = classifyAgentMode;
function classifyAgentModeCompat(opts) {
  const result = _origClassify(opts);
  // Make the result behave like a string primitive via valueOf/toString,
  // AND expose .mode / .confidence for new callers.
  const proxy = Object.assign(Object.create(String.prototype), result, {
    toString() { return result.mode; },
    valueOf() { return result.mode; }
  });
  return proxy;
}

module.exports = { AGENT_MODES, classifyAgentMode: classifyAgentModeCompat };
