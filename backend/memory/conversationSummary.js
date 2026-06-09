'use strict';

const { redactSecrets } = require("./memoryExtractor");

const CLOSED_THINKING_BLOCK_PATTERN = /<\s*thinking\b[^>]*>[\s\S]*?<\s*\/\s*thinking\s*>/gi;
const OPEN_THINKING_BLOCK_PATTERN = /<\s*thinking\b[^>]*>[\s\S]*$/i;
const WHITESPACE_PATTERN = /\s+/g;

function stripThinkingBlocks(value) {
  return String(value || "")
    .replace(CLOSED_THINKING_BLOCK_PATTERN, "")
    // If a model crashes mid-<thinking>, never summarize leaked scratchpad.
    .replace(OPEN_THINKING_BLOCK_PATTERN, "");
}

function clampText(value, limit = 220) {
  const cleaned = redactSecrets(stripThinkingBlocks(value))
    .replace(WHITESPACE_PATTERN, " ")
    .trim();

  if (!cleaned) return "";
  if (cleaned.length <= limit) return cleaned;

  const clipped = cleaned.slice(0, limit);
  const lastBreak = Math.max(
    clipped.lastIndexOf(". "),
    clipped.lastIndexOf("? "),
    clipped.lastIndexOf("! "),
    clipped.lastIndexOf("; ")
  );

  return `${(lastBreak > 80 ? clipped.slice(0, lastBreak + 1) : clipped).trim()}…`;
}

function compactList(items, limit = 3) {
  const seen = new Set();
  const result = [];

  for (const item of items) {
    const text = clampText(item);
    const key = text.toLowerCase();
    if (!text || seen.has(key)) continue;
    seen.add(key);
    result.push(text);
    if (result.length >= limit) break;
  }

  return result;
}

function summarizeConversation(messages = []) {
  const safeMessages = Array.isArray(messages) ? messages : [];
  const recent = safeMessages.slice(-12);
  const older = safeMessages.length > recent.length ? safeMessages.slice(0, -recent.length) : [];

  const recentUserGoals = compactList(
    recent.filter((message) => message.role === "user").slice(-4).map((message) => message.content),
    4
  );
  const recentHazyMoves = compactList(
    recent.filter((message) => message.role === "assistant").slice(-3).map((message) => message.content),
    3
  );
  const olderTopics = compactList(
    older.filter((message) => message.role === "user").slice(-5).map((message) => message.content),
    3
  );

  const lines = [
    olderTopics.length ? `Earlier user topics: ${olderTopics.join(" | ")}` : null,
    recentUserGoals.length ? `Recent user goals: ${recentUserGoals.join(" | ")}` : null,
    recentHazyMoves.length ? `Recent Hazy help: ${recentHazyMoves.join(" | ")}` : null
  ].filter(Boolean);

  return {
    summary: clampText(lines.join("\n"), 1600),
    messageCount: safeMessages.length,
    summarizedAt: new Date().toISOString()
  };
}

module.exports = { summarizeConversation, clampText, stripThinkingBlocks };
