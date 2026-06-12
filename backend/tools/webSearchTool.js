'use strict';

const { WebSearchService } = require('../webSearch/webSearchService');
const { detectSearchDecision } = require('../webSearch/searchRouter');
const { planQueries } = require('../webSearch/queryPlanner');

const defaultWebSearchService = new WebSearchService();

async function webSearch({
  query,
  userMessage,
  messages = [],
  cfg = {},
  userId,
  chatId,
  messageId,
  forceSearch = true,
  provider,
  maxContextTokens,
  decision
} = {}) {
  return defaultWebSearchService.search({
    userMessage: userMessage || query || '',
    messages,
    cfg,
    userId,
    chatId,
    messageId,
    forceSearch,
    provider,
    maxContextTokens,
    decision
  });
}

function register(registry) {
  registry.register({
    name: 'web.search',
    description: 'Search the web for current or externally verifiable information, extract sources, and build citation-ready evidence.',
    risk: 'read',
    toolset: 'web',
    requiresConfirmation: false,
    allowedRoles: ['admin', 'cashier', 'user'],
    schema: {
      type: 'object',
      properties: {
        query: { type: 'string', minLength: 2, maxLength: 300 },
        limit: { type: 'integer', minimum: 1, maximum: 10 },
        mode: { type: 'string', enum: ['quick_web', 'deep_web', 'official_only', 'domain_limited', 'fresh_required', 'research_mode'] }
      },
      required: ['query'],
      additionalProperties: false
    },
    execute: ({ query }, ctx) => (
      ctx.services?.testWebSearchResult
      || webSearch({
        userMessage: query,
        messages: ctx.services?.messages || [],
        cfg: ctx.services?.config || {},
        userId: ctx.userId,
        chatId: ctx.chatId,
        messageId: ctx.requestId,
        forceSearch: true,
        decision: ctx.services?.searchDecision
      })
    )
  });
}

module.exports = {
  webSearch,
  defaultWebSearchService,
  WebSearchService,
  detectSearchDecision,
  planQueries,
  register
};
