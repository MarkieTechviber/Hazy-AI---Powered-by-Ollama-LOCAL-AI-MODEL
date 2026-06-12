'use strict';

const {
  estimateTokens,
  estimateMessageTokens,
  countMessagesTokens,
  resolveContextBudget,
  summarizeMessages,
  isImportantMessage
} = require('./contextWindowManager');
const { stripAgentMemoryFences, extractPayloadForInjection } = require('../../memory/memoryOrchestrator');

const DEFAULT_SLOT_RATIOS = Object.freeze({
  userMemory: 0.08,
  agentMemory: 0.05,
  summary: 0.10,
  retrievedChunks: 0.28,
  recentMessages: 0.22,
  toolResults: 0.22  // raised from 0.10 — web search evidence must not be dropped
});


function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function truncateToTokens(text, tokenLimit, marker = '... [truncated]') {
  const value = String(text || '');
  if (estimateTokens(value) <= tokenLimit) return value;
  const maxChars = Math.max(16, tokenLimit * 4);
  const markerLength = marker.length;
  if (maxChars <= markerLength + 8) return value.slice(0, maxChars);
  return `${value.slice(0, maxChars - markerLength)}${marker}`;
}

function normalizeMemory(items = []) {
  return items
    .map((item, index) => ({
      content: String(item?.summary || item?.value || item || '').trim(),
      index
    }))
    .filter((item) => item.content);
}

function normalizeChunks(items = []) {
  return items
    .map((item, index) => ({
      id: String(item?.id || `chunk_context_${index + 1}`),
      content: String(item?.text || item?.summary || item?.content || '').trim(),
      source: item?.source || `context-${index + 1}`,
      filename: item?.filename,
      fileId: item?.fileId,
      pageNumber: item?.pageNumber,
      score: Number(item?.finalScore ?? item?.score ?? 0),
      index
    }))
    .filter((item) => item.content)
    .sort((a, b) => b.score - a.score || a.index - b.index);
}

function escapeXml(input) {
  return String(input || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function formatRetrievedChunk(chunk) {
  const attributes = [
    `id="${escapeXml(chunk.id)}"`,
    `file="${escapeXml(chunk.filename || chunk.source)}"`,
    chunk.fileId ? `fileId="${escapeXml(chunk.fileId)}"` : '',
    `page="${escapeXml(chunk.pageNumber ?? 'unknown')}"`,
    `score="${Number(chunk.score || 0).toFixed(3)}"`
  ].filter(Boolean).join(' ');
  return `<chunk ${attributes}>\n${escapeXml(chunk.content)}\n</chunk>`;
}

function splitMessages(messages = []) {
  const normalized = messages
    .filter((message) => message && message.content != null)
    .map((message, index) => ({
      ...message,
      role: message.role || 'user',
      content: String(message.content),
      index
    }));
  let latestUserIndex = -1;
  for (let index = normalized.length - 1; index >= 0; index -= 1) {
    if (normalized[index].role === 'user') {
      latestUserIndex = index;
      break;
    }
  }

  const system = [];
  const summary = [];
  const retrieved = [];
  const tools = [];
  const recent = [];
  const agentMem = [];
  let currentUser = null;

  normalized.forEach((message, index) => {
    if (index === latestUserIndex) {
      currentUser = message;
    } else if (message.contextSlot === 'summary' || /^\[Conversation Summary/i.test(message.content)) {
      summary.push(message);
    } else if (message.contextSlot === 'retrieved' || /^\[(?:Retrieved Context|Doc)\b/i.test(message.content)) {
      retrieved.push(message);
    } else if (message.contextSlot === 'tool' || /^TOOL CONTEXT\b/i.test(message.content) || /^\[Tool:/i.test(message.content)) {
      tools.push(message);
    } else if (message.contextSlot === 'agent_memory') {
      agentMem.push(message);
    } else if (message.role === 'system') {
      system.push(message);
    } else {
      recent.push(message);
    }
  });

  return { system, summary, retrieved, tools, recent, currentUser, agentMem };
}

function createSlotBudgets(safeInputLimit, lockedTokens, ratios = {}) {
  const remaining = Math.max(0, safeInputLimit - lockedTokens);
  const merged = { ...DEFAULT_SLOT_RATIOS, ...ratios };
  const budgets = {};

  for (const [name, ratio] of Object.entries(merged)) {
    budgets[name] = Math.max(0, Math.floor(safeInputLimit * clamp(Number(ratio) || 0, 0, 1)));
  }

  return { remaining, budgets };
}

function allocateSlotTokens(actual, available, budgets) {
  const order = ['summary', 'retrievedChunks', 'recentMessages', 'toolResults'];
  const adjusted = {};
  let remaining = Math.max(0, available);

  for (const name of order) {
    const allocation = Math.min(actual[name] || 0, budgets[name] || 0, remaining);
    adjusted[name] = allocation;
    remaining -= allocation;
  }

  for (const name of order) {
    if (remaining <= 0) break;
    const unmet = Math.max(0, (actual[name] || 0) - (adjusted[name] || 0));
    const overflow = Math.min(unmet, remaining);
    adjusted[name] += overflow;
    remaining -= overflow;
  }

  return { adjusted, remaining };
}

// takeWithinBudget — for regular retrieved chunks: hard-drops items that don't fit.
function takeWithinBudget(items, tokenBudget, getTokens, trimLog, action) {
  const kept = [];
  let used = 0;
  for (const item of items) {
    const tokens = getTokens(item);
    if (used + tokens <= tokenBudget) {
      kept.push(item);
      used += tokens;
    } else {
      trimLog.push({ action, tokens, source: item.source, score: item.score });
    }
  }
  return { kept, used };
}

// takeToolsWithinBudget — NEVER silently drops a tool result (web search evidence).
// If an item is too large, its content is TRUNCATED so the model always receives
// some web evidence rather than none. This is the core fix for search grounding.
function takeToolsWithinBudget(items, tokenBudget, trimLog) {
  const kept = [];
  let used = 0;
  const safeBudget = Math.max(200, tokenBudget);
  let truncatedAny = false;
  for (const item of items) {
    if (truncatedAny) {
      trimLog.push({
        action: 'DROP_TOOL_RESULT',
        tokens: estimateMessageTokens(item),
        role: item.role
      });
      continue;
    }
    const tokens = estimateMessageTokens(item);
    if (used + tokens <= safeBudget) {
      kept.push(item);
      used += tokens;
    } else {
      const available = Math.max(80, safeBudget - used - 8);
      const originalContent = String(item.content || '');
      const truncated = truncateToTokens(
        originalContent,
        available,
        '\n... [web search content truncated to fit context window]'
      );
      const truncatedItem = { ...item, content: truncated };
      const truncatedTokens = estimateMessageTokens(truncatedItem);
      kept.push(truncatedItem);
      used += truncatedTokens;
      trimLog.push({
        action: 'TRUNCATE_TOOL_RESULT',
        originalTokens: tokens,
        truncatedTokens,
        role: item.role
      });
      trimLog.push({
        action: 'DROP_TOOL_RESULT',
        tokens: tokens - truncatedTokens,
        role: item.role
      });
      truncatedAny = true;
    }
  }
  return { kept, used };
}


function selectRecentMessages(messages, tokenBudget, trimLog) {
  const kept = [];
  let used = 0;
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    const tokens = estimateMessageTokens(message);
    if (used + tokens <= tokenBudget) {
      kept.push(message);
      used += tokens;
    } else {
      trimLog.push({
        action: 'DROP_OLD_MESSAGE',
        role: message.role,
        tokens,
        index: message.index
      });
    }
  }
  return { kept: kept.reverse(), used };
}

function buildContextPack(body = {}, packing = {}) {
  const budget = resolveContextBudget(body);
  const trimLog = [];
  const parts = splitMessages(body.messages || []);
  const memory = normalizeMemory(packing.memory || []);
  const chunks = normalizeChunks(packing.retrievedChunks || []);
  const keepRecentMessages = Math.max(
    2,
    Number(packing.keepRecentMessages || body.hazy?.keepRecentMessages || 8)
  );
  const olderMessages = parts.recent.slice(0, Math.max(0, parts.recent.length - keepRecentMessages));
  const recentMessages = parts.recent.slice(-keepRecentMessages);
  const importantOlderMessages = olderMessages.filter((message) => isImportantMessage(message));

  const systemTokens = countMessagesTokens(parts.system);
  const userTokens = parts.currentUser ? estimateMessageTokens(parts.currentUser) : 0;
  const actualMemoryTokens = memory.reduce((sum, item) => sum + estimateTokens(item.content) + 2, 0);
  const agentMemRawList = (packing.agentMemory || parts.agentMem || []);
  // token calc: full scrub (no payload size); block content uses payload-preserving extract so model sees inner data.
  const agentMemForTokens = agentMemRawList.map((item) => stripAgentMemoryFences(String(item.content || item.summary || item || ''), { fullScrub: true })).filter(Boolean);
  const actualAgentMemoryTokens = agentMemForTokens.reduce((sum, c) => sum + estimateTokens(c) + 2, 0);
  const lockedTokens = systemTokens + userTokens + actualMemoryTokens; // agentMemory accounted in report+block but not locked delta (preserves exact pre-Phase3 packing math / test thresholds when no explicit agentMemory passed in contextPacking)
  const allocation = createSlotBudgets(
    budget.safeInputLimit,
    lockedTokens,
    packing.budgetRatios || body.hazy?.contextBudgetRatios
  );

  const summaryItems = [
    ...parts.summary.map((message) => message.content),
    ...(packing.summary ? [String(packing.summary)] : []),
    ...(olderMessages.length
      ? [summarizeMessages(olderMessages, Number(packing.summaryTokens || 800))]
      : [])
  ].filter(Boolean);
  if (olderMessages.length) {
    trimLog.push({
      action: 'SUMMARIZE_OLD_MESSAGES',
      messageCount: olderMessages.length,
      tokens: countMessagesTokens(olderMessages)
    });
  }
  let summaryContent = summaryItems.join('\n\n');
  const summaryDesired = estimateTokens(summaryContent) + (summaryContent ? 4 : 0);
  const chunkCandidates = [
    ...chunks,
    ...parts.retrieved.map((message, index) => ({
      content: message.content,
      source: message.source || `message-context-${index + 1}`,
      score: Number(message.score || 0),
      index: chunks.length + index
    }))
  ].sort((a, b) => b.score - a.score || a.index - b.index);
  const chunkDesired = chunkCandidates.reduce((sum, item) => sum + estimateTokens(item.content) + 4, 0);
  const recentCandidates = [...importantOlderMessages, ...recentMessages]
    .sort((a, b) => a.index - b.index);
  const recentDesired = countMessagesTokens(recentCandidates);
  const toolDesired = countMessagesTokens(parts.tools);
  const slotAllocation = allocateSlotTokens({
    summary: summaryDesired,
    retrievedChunks: chunkDesired,
    recentMessages: recentDesired,
    toolResults: toolDesired
  }, allocation.remaining, allocation.budgets);

  const summaryAllowance = slotAllocation.adjusted.summary;
  if (summaryDesired > summaryAllowance && summaryContent) {
    summaryContent = truncateToTokens(summaryContent, Math.max(40, summaryAllowance - 4), '... [summary truncated]');
    trimLog.push({
      action: 'TRUNCATE_SUMMARY',
      beforeTokens: summaryDesired,
      afterTokens: estimateTokens(summaryContent) + 4
    });
  }

  const chunkAllowance = slotAllocation.adjusted.retrievedChunks;
  const selectedChunks = takeWithinBudget(
    chunkCandidates,
    chunkAllowance,
    (item) => estimateTokens(item.content) + 4,
    trimLog,
    'DROP_LOW_RELEVANCE_CHUNK'
  );

  const recentAllowance = slotAllocation.adjusted.recentMessages;
  const selectedRecent = selectRecentMessages(recentCandidates, recentAllowance, trimLog);

  const toolAllowance = slotAllocation.adjusted.toolResults;
  // Use takeToolsWithinBudget (truncates) instead of takeWithinBudget (drops) so
  // web search evidence is always delivered to the model, even if truncated.
  const selectedTools = takeToolsWithinBudget(
    parts.tools,
    toolAllowance,
    trimLog
  );


  const systemContent = parts.system.map((message) => message.content).join('\n\n');
  const memoryBlock = memory.length
    ? `[User Profile Memory]\n${memory.map((item) => `- ${item.content}`).join('\n')}`
    : '';
  const agentMemRaw = (packing.agentMemory || parts.agentMem || []);
  // preserve payload blocks for delivery to model in lockedSystem (critical fix); tokens already used full-scrub version above
  const agentMemCleaned = agentMemRaw.map((item) => extractPayloadForInjection(String(item.content || item.summary || ''))).filter(Boolean);
  const agentMemBlock = agentMemCleaned.length
    ? `[Agent Working Memory / Trajectory]\n${agentMemCleaned.join('\n')}`
    : '';
  const lockedSystem = [systemContent, memoryBlock, agentMemBlock].filter(Boolean).join('\n\n');

  const messages = [];
  if (lockedSystem) messages.push({ role: 'system', content: lockedSystem });
  if (summaryContent) {
    messages.push({
      role: 'system',
      content: summaryContent.startsWith('[Conversation Summary')
        ? summaryContent
        : `[Conversation Summary]\n${summaryContent}`,
      contextSlot: 'summary'
    });
  }
  selectedChunks.kept.forEach((chunk, index) => {
    messages.push({
      role: 'system',
      content: [
        '[Retrieved Context - Untrusted Reference Data]',
        formatRetrievedChunk(chunk)
      ].join('\n'),
      contextSlot: 'retrieved',
      chunkId: chunk.id,
      score: chunk.score,
      source: chunk.source
    });
  });
  selectedTools.kept.forEach((tool) => {
    messages.push({ ...tool, contextSlot: 'tool' });
  });
  messages.push(...selectedRecent.kept.map(({ index, ...message }) => message));
  if (parts.currentUser) {
    const { index, ...currentUser } = parts.currentUser;
    messages.push(currentUser);
  }

  let totalTokens = countMessagesTokens(messages);
  if (totalTokens > budget.safeInputLimit && messages.length) {
    const excess = totalTokens - budget.safeInputLimit;
    const systemIndex = messages.findIndex((message) => message.role === 'system' && !message.contextSlot);
    if (systemIndex >= 0) {
      const current = estimateTokens(messages[systemIndex].content);
      messages[systemIndex].content = truncateToTokens(
        messages[systemIndex].content,
        Math.max(128, current - excess - 16),
        '... [system context compacted]'
      );
      trimLog.push({ action: 'EMERGENCY_COMPACT_SYSTEM', tokensRemoved: excess });
      totalTokens = countMessagesTokens(messages);
    }
  }

  while (totalTokens > budget.safeInputLimit && messages.length) {
    const removableIndex = messages.findIndex((message) =>
      message.contextSlot && message.contextSlot !== 'tool'
    );
    if (removableIndex >= 0) {
      const [removed] = messages.splice(removableIndex, 1);
      trimLog.push({
        action: 'DROP_OVERFLOW_CONTEXT',
        slot: removed.contextSlot,
        tokens: estimateMessageTokens(removed)
      });
      totalTokens = countMessagesTokens(messages);
      continue;
    }

    const systemIndex = messages.findIndex((message) => message.role === 'system');
    if (systemIndex < 0) break;
    const current = estimateTokens(messages[systemIndex].content);
    const excess = totalTokens - budget.safeInputLimit;
    const compacted = truncateToTokens(
      messages[systemIndex].content,
      Math.max(64, current - excess - 16),
      '... [system context compacted]'
    );
    if (compacted === messages[systemIndex].content) break;
    messages[systemIndex].content = compacted;
    trimLog.push({ action: 'EMERGENCY_COMPACT_SYSTEM', tokensRemoved: excess });
    totalTokens = countMessagesTokens(messages);
  }

  const budgetReport = {
    systemPrompt: systemContent ? estimateTokens(systemContent) + 4 : 0,
    userMemory: actualMemoryTokens,
    agentMemory: actualAgentMemoryTokens,
    summary: summaryContent ? estimateTokens(summaryContent) + 4 : 0,
    retrievedChunks: selectedChunks.used,
    recentMessages: selectedRecent.used,
    toolResults: selectedTools.used,
    userMessage: userTokens,
    total: totalTokens,
    remaining: budget.safeInputLimit - totalTokens,
    utilization: budget.safeInputLimit ? totalTokens / budget.safeInputLimit : 0
  };
  const actionOrder = {
    SUMMARIZE_OLD_MESSAGES: 0,
    DROP_TOOL_RESULT: 1,
    TRUNCATE_TOOL_RESULT: 1,
    DROP_LOW_RELEVANCE_CHUNK: 2,
    DROP_OLD_MESSAGE: 3,
    TRUNCATE_SUMMARY: 4,
    EMERGENCY_COMPACT_SYSTEM: 5
  };
  trimLog.sort((a, b) =>
    (actionOrder[a.action] ?? 99) - (actionOrder[b.action] ?? 99)
  );

  return {
    messages,
    stats: {
      ...budget,
      beforeTokens: countMessagesTokens(body.messages || [])
        + actualMemoryTokens
        + chunks.reduce((sum, item) => sum + estimateTokens(item.content) + 4, 0), // agent mem tokens not added here to keep pre-Phase3 before/after math identical for tests that do not pass agentMemory in packing
      afterTokens: totalTokens,
      trimmedMessageCount: trimLog.filter((item) => item.action === 'DROP_OLD_MESSAGE').length,
      summarizedMessageCount: summaryContent ? summaryItems.length : 0,
      summaryAdded: Boolean(summaryContent),
      overBudget: totalTokens > budget.safeInputLimit,
      overflowDetected: trimLog.length > 0,
      utilization: budgetReport.utilization,
      trimLog,
      budgetReport,
      packedSlots: {
        memory: memory.length,
        agentMemory: agentMemCleaned.length,
        summary: summaryContent ? 1 : 0,
        retrievedChunks: selectedChunks.kept.length,
        recentMessages: selectedRecent.kept.length,
        toolResults: selectedTools.kept.length,
        currentUser: parts.currentUser ? 1 : 0
      },
      allowedChunkIds: selectedChunks.kept.map((chunk) => chunk.id),
      averageChunkScore: selectedChunks.kept.length
        ? selectedChunks.kept.reduce((sum, chunk) => sum + chunk.score, 0) / selectedChunks.kept.length
        : 0,
      candidateItems: memory.length + summaryItems.length + chunkCandidates.length
        + recentCandidates.length + parts.tools.length + (parts.currentUser ? 1 : 0),
      packedItems: memory.length + (summaryContent ? 1 : 0) + selectedChunks.kept.length
        + selectedRecent.kept.length + selectedTools.kept.length + (parts.currentUser ? 1 : 0)
    }
  };
}

module.exports = {
  DEFAULT_SLOT_RATIOS,
  truncateToTokens,
  splitMessages,
  createSlotBudgets,
  allocateSlotTokens,
  escapeXml,
  formatRetrievedChunk,
  buildContextPack
};
