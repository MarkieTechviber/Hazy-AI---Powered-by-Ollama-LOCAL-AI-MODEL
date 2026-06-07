'use strict';

const { compressToolContent } = require('../ai/context/contextWindowManager');
const { detectSearchDecision } = require('../webSearch/searchRouter');
const { resolveUserQuestion } = require('../webSearch/queryPlanner');
const { defaultAgentRuntime, createToolContext } = require('../agent/agentRuntime');

function latestUserMessage(messages = []) {
  return [...messages].reverse()
    .find((message) => message?.role === 'user' && typeof message.content === 'string')
    ?.content || '';
}

function isAgentEnabled(body = {}) {
  return Boolean(
    body.hazy?.agentEnabled
    || body.hazy?.agentMode
    || body.agentEnabled
    || body.agentMode
  );
}

function isBuildOrCodeRequest(body = {}) {
  const mode = String(body.hazy?.mode || '').toLowerCase();
  return mode === 'build'
    || mode === 'code'
    || body.hazy?.isBuild === true
    || body.hazy?.isCode === true;
}

function wantsWebSearch(message = '') {
  return detectSearchDecision(message).mode !== 'none';
}

function extractSearchQuery(message = '') {
  return resolveUserQuestion(message);
}

function formatToolContext(toolResults = [], maxTokens = 12000) {
  const result = toolResults.find((item) => item.tool === 'web_search');
  if (!result) return '';
  const lines = [
    'WEB SEARCH EVIDENCE:',
    'Use this evidence for current or external factual claims.',
    'Cite inline with [SOURCE N]. Do not cite a source that is not listed.',
    'If the evidence is insufficient or conflicting, say so clearly.',
    '',
    `Search mode: ${result.decision?.mode || 'quick_web'}`,
    `Confidence: ${result.confidence || result.metrics?.confidence || 'low'}`,
    `Search queries: ${(result.queries || []).map((query) => query.query).join(' | ') || result.query || 'none'}`,
    `Search run ID: ${result.runId || 'not persisted'}`,
    '',
    result.contextText || ''
  ];
  if (result.warnings?.length) {
    lines.push('', 'Search warnings:', ...result.warnings.map((warning) => `- ${warning}`));
  }
  return compressToolContent('web_search_evidence', lines.join('\n'), maxTokens).content;
}

async function runDeterministicTools({ body = {}, cfg = {} } = {}) {
  const originalMessages = Array.isArray(body.messages) ? body.messages : [];
  const message = latestUserMessage(originalMessages);
  const decision = detectSearchDecision(message, {
    forceSearch: body.hazy?.forceWebSearch
  });
  const decisions = [{
    tool: decision.mode === 'none' ? 'none' : 'web_search',
    reason: decision.reason,
    mode: decision.mode
  }];

  if (decision.mode === 'none') {
    return {
      body,
      toolResults: [],
      decisions,
      agentEnabled: isAgentEnabled(body),
      searchDecision: decision
    };
  }

  const ctx = createToolContext(body, {
    services: {
      config: cfg,
      messages: originalMessages,
      searchDecision: decision,
      testWebSearchResult: cfg.__testWebSearchResult
    }
  });
  const gateResult = await defaultAgentRuntime.gatekeeper.validateAndMaybeRun({
    ctx,
    toolCall: {
      id: `web-search:${ctx.requestId}`,
      name: 'web.search',
      arguments: {
        query: message
      }
    }
  });
  const searchResult = gateResult.status === 'executed'
    ? (gateResult.result.data || {})
    : {
        success: false,
        decision,
        query: resolveUserQuestion(message, originalMessages),
        contextText: '',
        citations: [],
        warnings: [gateResult.error?.message || 'Search was blocked by backend policy.'],
        metrics: { confidence: 'low' }
      };
  const toolResult = {
    tool: 'web_search',
    backendTool: 'web.search',
    originalMessage: message,
    gateStatus: gateResult.status,
    ...searchResult
  };
  const contextMessage = {
    role: 'system',
    contextSlot: 'tool',
    content: formatToolContext(
      [toolResult],
      body.hazy?.toolContextMaxTokens || body.hazy?.webContextMaxTokens || 12000
    )
  };

  return {
    body: {
      ...body,
      hazy: {
        ...(body.hazy || {}),
        agentEnabled: true,
        webSearchRunId: toolResult.runId,
        webCitations: toolResult.citations || [],
        webSearchMetrics: toolResult.metrics || {},
        toolResults: [toolResult],
        toolDecisions: decisions
      },
      messages: [contextMessage, ...originalMessages]
    },
    toolResults: [toolResult],
    decisions,
    agentEnabled: true,
    searchDecision: decision,
    citations: toolResult.citations || []
  };
}

module.exports = {
  runDeterministicTools,
  wantsWebSearch,
  extractSearchQuery,
  isAgentEnabled,
  isBuildOrCodeRequest,
  formatToolContext,
  latestUserMessage
};
