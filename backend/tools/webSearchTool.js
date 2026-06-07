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

module.exports = {
  webSearch,
  defaultWebSearchService,
  WebSearchService,
  detectSearchDecision,
  planQueries
};
