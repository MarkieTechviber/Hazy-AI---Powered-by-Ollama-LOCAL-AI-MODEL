'use strict';

const { applyContextWindow } = require('./context/contextWindowManager');

// FIX #4 — Original normalizeMessages filtered out any message where
// content is not a string. This silently dropped:
//   - Anthropic-style tool result messages  (content: [{type:'tool_result',...}])
//   - Multimodal messages                   (content: [{type:'image',...}])
//   - Assistant tool_calls turns            (content: array)
//
// Fix: accept array content too, and stringify it only for providers that
// need a plain string. Non-object, non-string content is still dropped.
function normalizeMessages(messages = []) {
  return messages
    .filter((message) => {
      if (!message) return false;
      const c = message.content;
      return typeof c === 'string' || Array.isArray(c);
    })
    .map((message) => ({
      ...message,
      role: message.role || 'user',
      content: message.content
    }));
}

// Helper for providers that only accept string content — converts array
// content to a plain text representation rather than silently dropping it.
function flattenContentToString(content) {
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return '';
  return content
    .map((block) => {
      if (typeof block === 'string') return block;
      if (block?.type === 'text') return block.text || '';
      if (block?.type === 'tool_result') return `[tool result: ${String(block.content || '')}]`;
      if (block?.type === 'tool_use') return `[tool call: ${block.name || ''}]`;
      return '';
    })
    .filter(Boolean)
    .join('\n');
}

function mergeSystemPrompt(messages, supportPrompt) {
  const normalized = normalizeMessages(messages);
  const contextualSystem = normalized.filter((message) =>
    message.role === 'system'
    && (
      message.contextSlot
      || /^TOOL CONTEXT\b/i.test(flattenContentToString(message.content))
      || /^\[(?:Tool:|Retrieved Context|Doc|Conversation Summary)/i.test(flattenContentToString(message.content))
    )
  );
  const systemParts = normalized
    .filter((message) => message.role === 'system' && !contextualSystem.includes(message))
    .map((message) => flattenContentToString(message.content).trim())
    .filter(Boolean);
  const conversation = normalized.filter((message) => message.role !== 'system');
  const support = typeof supportPrompt === 'string' ? supportPrompt.trim() : '';

  if (support) {
    systemParts.push([
      'Additional operational guidance for this reply:',
      support
    ].join('\n'));
  }

  if (!systemParts.length) {
    return conversation;
  }

  return [
    { role: 'system', content: systemParts.join('\n\n') },
    ...contextualSystem,
    ...conversation
  ];
}

function prepareProviderPayload(body, supportPrompt) {
  const payload = {
    ...body,
    messages: mergeSystemPrompt(body.messages || [], supportPrompt)
  };
  return applyContextWindow(payload);
}

module.exports = {
  normalizeMessages,
  flattenContentToString,
  mergeSystemPrompt,
  prepareProviderPayload
};
