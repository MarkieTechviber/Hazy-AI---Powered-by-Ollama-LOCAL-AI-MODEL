'use strict';

const AGENT_MODES = Object.freeze([
  'chat',
  'rag_answer',
  'tool_action',
  'confirmation',
  'clarification',
  'unsafe_or_blocked'
]);

function classifyAgentMode({
  message = '',
  hasRetrievedContext = false,
  hasToolResults = false,
  pendingConfirmation = null,
  safety = {}
} = {}) {
  const text = String(message || '').trim();
  if (safety.riskLevel && !['tier_0', 'low'].includes(safety.riskLevel)) return 'unsafe_or_blocked';
  if (pendingConfirmation?.status === 'pending') return 'confirmation';
  if (!text) return 'clarification';
  if (hasToolResults) return 'tool_action';
  if (hasRetrievedContext || /\b(uploaded|attached|document|pdf|file)\b/i.test(text)) return 'rag_answer';
  if (/\b(search|browse|look up|lookup|current|latest|send|delete|create|update|save|inventory|stock)\b/i.test(text)) {
    return 'tool_action';
  }
  return 'chat';
}

module.exports = { AGENT_MODES, classifyAgentMode };
