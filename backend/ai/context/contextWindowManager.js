'use strict';

const DEFAULT_CONTEXT_WINDOWS = Object.freeze({
  anthropic: 200000,
  openai: 128000,
  gemini: 1000000,
  groq: 128000,
  nvidia: 128000,
  ollama: 4096,
  hazy: 8192
});

const IMPORTANT_PATTERNS = [
  /\b(always|never|must|do not|don't|important|remember|constraint|requirement)\b/i,
  /\b(i prefer|my preference|my name is|call me|we decided|the decision is)\b/i,
  /\b(api key|credential|production|database|security|deadline)\b/i
];

function contentToText(content) {
  if (typeof content === 'string') return content;
  if (content == null) return '';
  try {
    return JSON.stringify(content);
  } catch {
    return String(content);
  }
}

function estimateTokens(text) {
  const value = contentToText(text);
  if (!value) return 0;

  const asciiChars = (value.match(/[\x00-\x7F]/g) || []).length;
  const nonAsciiChars = value.length - asciiChars;
  const words = (value.match(/\S+/g) || []).length;
  const charEstimate = (asciiChars / 4) + (nonAsciiChars / 2);
  const wordEstimate = words / 0.75;
  return Math.max(1, Math.ceil(Math.max(charEstimate, wordEstimate)));
}

function estimateMessageTokens(message = {}) {
  return estimateTokens(message.content) + 4;
}

function countMessagesTokens(messages = []) {
  return messages.reduce((total, message) => total + estimateMessageTokens(message), 0);
}

function providerFromModel(model) {
  const value = String(model || '');
  return value.includes('/') ? value.split('/')[0].toLowerCase() : 'ollama';
}

function resolveContextWindow(body = {}) {
  const provider = providerFromModel(body.model);
  const explicit = Number(
    body.hazy?.contextWindowLimit
    || body.context_window
  );
  if (Number.isFinite(explicit) && explicit >= 512) return Math.floor(explicit);

  const ollamaWindow = Number(body.options?.num_ctx);
  if (provider === 'ollama' && Number.isFinite(ollamaWindow) && ollamaWindow >= 512) {
    return Math.floor(ollamaWindow);
  }

  return DEFAULT_CONTEXT_WINDOWS[provider] || DEFAULT_CONTEXT_WINDOWS.hazy;
}

function resolveContextBudget(body = {}) {
  const contextWindow = resolveContextWindow(body);
  const requestedOutput = Number(
    body.options?.max_tokens
    || body.options?.num_predict
    || body.max_tokens
    || 2048
  );
  const maximumReservation = Math.max(128, Math.floor(contextWindow * 0.25));
  const reservedOutputTokens = Math.max(
    128,
    Math.min(Number.isFinite(requestedOutput) ? requestedOutput : 2048, maximumReservation)
  );
  const safetyBuffer = Math.max(64, Math.ceil(contextWindow * 0.05));
  const safeInputLimit = Math.max(
    256,
    contextWindow - reservedOutputTokens - safetyBuffer
  );

  return {
    contextWindow,
    reservedOutputTokens,
    safetyBuffer,
    safeInputLimit
  };
}

function isImportantMessage(message = {}, index = -1) {
  if (message.role === 'system' || message.important === true) return true;
  if (index === 0 && message.role === 'user') return true;
  const text = contentToText(message.content);
  return IMPORTANT_PATTERNS.some((pattern) => pattern.test(text));
}

function truncateText(text, maxChars) {
  const value = contentToText(text).replace(/\s+/g, ' ').trim();
  if (value.length <= maxChars) return value;
  const headLength = Math.max(1, Math.floor(maxChars * 0.72));
  const tailLength = Math.max(1, maxChars - headLength - 24);
  return `${value.slice(0, headLength)} ... [trimmed] ... ${value.slice(-tailLength)}`;
}

function summarizeMessages(messages = [], maxTokens = 800) {
  if (!messages.length || maxTokens <= 0) return '';
  const maxChars = maxTokens * 4;
  const lines = ['[Conversation Summary - Earlier Context]'];

  for (const message of messages) {
    const role = message.role === 'assistant' ? 'Hazy' : 'User';
    const important = isImportantMessage(message) ? ' [important]' : '';
    const line = `- ${role}${important}: ${truncateText(message.content, 280)}`;
    if ([...lines, line].join('\n').length > maxChars) break;
    lines.push(line);
  }

  if (lines.length === 1) {
    lines.push(`- Earlier conversation contained ${messages.length} message(s).`);
  } else if (lines.length - 1 < messages.length) {
    lines.push(`- ${messages.length - (lines.length - 1)} additional earlier message(s) were omitted for space.`);
  }
  return lines.join('\n');
}

function compressToolContent(toolName, rawResult, maxTokens = 500) {
  const text = contentToText(rawResult);
  const originalTokens = estimateTokens(text);
  if (originalTokens <= maxTokens) {
    return {
      content: text,
      compressed: false,
      originalTokens,
      tokens: originalTokens
    };
  }

  const maxChars = maxTokens * 4;
  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const priority = [];
  const normal = [];
  for (const line of lines) {
    if (/^(instructions|warnings?|status|title|url|source|label|confidence|risk flags|resolved search query)/i.test(line)
      || /^https?:\/\//i.test(line)) {
      priority.push(line);
    } else {
      normal.push(line);
    }
  }

  const header = `[Tool: ${toolName || 'unknown'} - compressed from ~${originalTokens} tokens]`;
  const selected = [header];
  for (const line of [...priority, ...normal]) {
    const candidate = [...selected, truncateText(line, 500)].join('\n');
    if (candidate.length > maxChars) continue;
    selected.push(truncateText(line, 500));
  }
  if (selected.length === 1) {
    selected.push(truncateText(text, Math.max(80, maxChars - header.length - 1)));
  }

  const content = selected.join('\n');
  return {
    content,
    compressed: true,
    originalTokens,
    tokens: estimateTokens(content)
  };
}

function normalizeMessages(messages = []) {
  return messages
    .filter((message) => message && message.content != null)
    .map((message, index) => ({
      ...message,
      role: message.role || 'user',
      content: contentToText(message.content),
      __index: index
    }));
}

function buildManagedContext(body = {}, options = {}) {
  const budget = resolveContextBudget(body);
  const messages = normalizeMessages(body.messages || []);
  const beforeTokens = countMessagesTokens(messages);
  const recentCount = Math.max(2, Number(options.keepRecentMessages || body.hazy?.keepRecentMessages || 8));
  const summaryBudget = Math.max(100, Number(options.summaryTokens || body.hazy?.summaryTokens || 800));

  if (beforeTokens <= budget.safeInputLimit) {
    return {
      messages: messages.map(({ __index, ...message }) => message),
      stats: {
        ...budget,
        beforeTokens,
        afterTokens: beforeTokens,
        trimmedMessageCount: 0,
        summarizedMessageCount: 0,
        summaryAdded: false,
        overBudget: false,
        utilization: beforeTokens / budget.safeInputLimit
      }
    };
  }

  const systemMessages = messages.filter((message) => message.role === 'system');
  const conversation = messages.filter((message) => message.role !== 'system');
  const latestUserIndex = (() => {
    for (let index = conversation.length - 1; index >= 0; index -= 1) {
      if (conversation[index].role === 'user') return index;
    }
    return conversation.length - 1;
  })();
  const recentStart = Math.max(0, conversation.length - recentCount);
  const selected = [];
  const removed = [];

  conversation.forEach((message, index) => {
    const keep = index >= recentStart
      || index === latestUserIndex
      || isImportantMessage(message, index);
    (keep ? selected : removed).push(message);
  });

  let summaryMessage = null;
  if (removed.length) {
    summaryMessage = {
      role: 'system',
      content: summarizeMessages(removed, summaryBudget),
      important: true,
      __summary: true,
      __index: Number.MAX_SAFE_INTEGER - 1
    };
  }

  let managed = [
    ...systemMessages,
    ...(summaryMessage ? [summaryMessage] : []),
    ...selected
  ].sort((a, b) => {
    if (a.role === 'system' && b.role !== 'system') return -1;
    if (a.role !== 'system' && b.role === 'system') return 1;
    return a.__index - b.__index;
  });

  let afterTokens = countMessagesTokens(managed);
  let trimmedMessageCount = removed.length;

  while (afterTokens > budget.safeInputLimit) {
    const removableIndex = managed.findIndex((message) =>
      message.role !== 'system'
      && message.__index !== conversation[latestUserIndex]?.__index
      && !isImportantMessage(message)
    );
    if (removableIndex === -1) break;
    managed.splice(removableIndex, 1);
    trimmedMessageCount += 1;
    afterTokens = countMessagesTokens(managed);
  }

  if (afterTokens > budget.safeInputLimit && summaryMessage) {
    const summaryIndex = managed.findIndex((message) => message.__summary);
    if (summaryIndex >= 0) {
      const availableSummaryTokens = Math.max(
        80,
        budget.safeInputLimit - countMessagesTokens(managed.filter((_, index) => index !== summaryIndex))
      );
      managed[summaryIndex].content = truncateText(
        managed[summaryIndex].content,
        availableSummaryTokens * 4
      );
      afterTokens = countMessagesTokens(managed);
    }
  }

  if (afterTokens > budget.safeInputLimit) {
    const latestIndex = managed.findIndex((message) =>
      message.__index === conversation[latestUserIndex]?.__index
    );
    if (latestIndex >= 0) {
      const otherTokens = countMessagesTokens(managed.filter((_, index) => index !== latestIndex));
      const availableTokens = Math.max(64, budget.safeInputLimit - otherTokens - 4);
      managed[latestIndex].content = truncateText(
        managed[latestIndex].content,
        availableTokens * 4
      );
      afterTokens = countMessagesTokens(managed);
    }
  }

  if (afterTokens > budget.safeInputLimit) {
    const systemIndexes = managed
      .map((message, index) => ({ message, index }))
      .filter(({ message }) => message.role === 'system' && !message.__summary)
      .map(({ index }) => index);

    for (const systemIndex of systemIndexes) {
      if (afterTokens <= budget.safeInputLimit) break;
      const otherTokens = countMessagesTokens(
        managed.filter((_, index) => index !== systemIndex)
      );
      const availableTokens = Math.max(128, budget.safeInputLimit - otherTokens - 4);
      managed[systemIndex].content = truncateText(
        managed[systemIndex].content,
        availableTokens * 4
      );
      afterTokens = countMessagesTokens(managed);
    }
  }

  if (afterTokens > budget.safeInputLimit && summaryMessage) {
    const summaryIndex = managed.findIndex((message) => message.__summary);
    if (summaryIndex >= 0) {
      managed.splice(summaryIndex, 1);
      afterTokens = countMessagesTokens(managed);
    }
  }

  return {
    messages: managed.map(({ __index, __summary, ...message }) => message),
    stats: {
      ...budget,
      beforeTokens,
      afterTokens,
      trimmedMessageCount,
      summarizedMessageCount: removed.length,
      summaryAdded: managed.some((message) => message.__summary),
      overBudget: afterTokens > budget.safeInputLimit,
      utilization: afterTokens / budget.safeInputLimit
    }
  };
}

function applyContextWindow(body = {}, options = {}) {
  if (body.hazy?.contextPacking) {
    const { buildContextPack } = require('./contextPacker');
    const packed = buildContextPack(body, body.hazy.contextPacking);
    return {
      ...body,
      messages: packed.messages,
      hazyContext: packed.stats
    };
  }
  const managed = buildManagedContext(body, options);
  return {
    ...body,
    messages: managed.messages,
    hazyContext: managed.stats
  };
}

module.exports = {
  DEFAULT_CONTEXT_WINDOWS,
  estimateTokens,
  estimateMessageTokens,
  countMessagesTokens,
  resolveContextWindow,
  resolveContextBudget,
  isImportantMessage,
  summarizeMessages,
  compressToolContent,
  buildManagedContext,
  applyContextWindow
};
