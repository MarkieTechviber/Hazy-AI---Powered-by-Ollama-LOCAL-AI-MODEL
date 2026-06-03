'use strict';

const { webSearch } = require('./webSearchTool');

function latestUserMessage(messages = []) {
  return [...(messages || [])]
    .reverse()
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

function wantsWebSearch(message = '') {
  const text = String(message || '').toLowerCase();

  // Avoid confusing programming/math phrases like "binary search" with web search.
  const algorithmSearch = /\b(binary|linear|depth[-\s]?first|breadth[-\s]?first|graph|tree)\s+search\b/i.test(text);
  const explicitWebWord = /\b(online|internet|web|browse|google|look\s*up|lookup|current|latest|recent|news|source|sources|cite|verify|fact\s*check)\b/i.test(text);
  if (algorithmSearch && !explicitWebWord) return false;

  const directSearchIntent = /\b(look\s*up|lookup|browse|google|internet|web\s*search|online)\b/i.test(text)
    || /\bsearch\s+(?:online|on\s+the\s+web|the\s+internet|for|about)\b/i.test(text)
    || /^\s*(?:can|could|would)?\s*(?:you)?\s*search\b/i.test(text);
  const recencyIntent = /\b(current|latest|recent|today|this\s+week|this\s+month|new\s+release|release\s+date|news|price|schedule|score|weather)\b/i.test(text);
  const sourceIntent = /\b(source|sources|cite|citation|link|links|verify|fact\s*check)\b/i.test(text);

  return directSearchIntent || (recencyIntent && sourceIntent);
}

function normalizeSearchText(message = '') {
  return String(message || '')
    .replace(/[\u201c\u201d]/g, '"')
    .replace(/[\u2018\u2019]/g, "'");
}

function polishSearchQuery(query = '') {
  let clean = String(query || '')
    .replace(/[?.!]+/g, ' ')
    .replace(/\b(the|a|an)\b/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  const songLikeToken = clean.match(/\b[A-Za-z0-9][A-Za-z0-9'_-]*-[A-Za-z0-9][A-Za-z0-9'_-]*\b/);
  if (/\bsong\b/i.test(clean) && songLikeToken) {
    clean = `${songLikeToken[0]} song`;
  }

  return clean;
}

function extractSearchQuery(message = '') {
  let query = normalizeSearchText(message).trim();

  const quoted = query.match(/["']([^"']{2,160})["']/);
  if (quoted?.[1]) {
    const context = query
      .replace(quoted[0], '')
      .replace(/\b(can you|could you|please|search|look up|lookup|browse|online|internet|web|about|for|the|a|an)\b/gi, ' ')
      .replace(/[?.!]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    return polishSearchQuery([quoted[1], context].filter(Boolean).join(' '));
  }

  query = query
    .replace(/^\s*(can|could|would)\s+you\s+/i, '')
    .replace(/^\s*please\s+/i, '')
    .replace(/\b(search|look\s*up|lookup|browse|google|find)\b/gi, ' ')
    .replace(/\b(on|from|using)?\s*(the\s+)?(internet|web|online)\b/gi, ' ')
    .replace(/\b(can you|could you|please|about|for)\b/gi, ' ')
    .replace(/\b(the|a|an)\b/gi, ' ')
    .replace(/[?.!]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  return polishSearchQuery(query) || normalizeSearchText(message).trim();
}

function formatToolContext(toolResults = []) {
  const lines = [
    'TOOL CONTEXT GATHERED BY HAZY BEFORE ANSWERING:',
    'Use this context when relevant. If results are weak or empty, say that clearly instead of pretending certainty.',
    'Important: because this tool context was already gathered, do not claim you cannot browse or search the internet for this turn.'
  ];

  for (const item of toolResults) {
    lines.push(`\n[${item.tool}] query: ${item.query || item.parameters?.query || 'n/a'}`);
    if (!item.success) {
      lines.push(`Status: failed or no useful results. ${item.error || item.note || ''}`.trim());
      continue;
    }
    const results = item.results || [];
    if (!results.length) {
      lines.push('Status: no useful results returned.');
      continue;
    }
    results.slice(0, 8).forEach((result, index) => {
      lines.push(`${index + 1}. ${result.title || 'Untitled'}${result.source ? ` - ${result.source}` : ''}`);
      if (result.snippet) lines.push(`   ${result.snippet}`);
      if (result.url) lines.push(`   URL: ${result.url}`);
    });
  }

  return lines.join('\n');
}

async function runDeterministicTools({ body = {}, cfg = {} } = {}) {
  const originalMessages = Array.isArray(body.messages) ? body.messages : [];
  const message = latestUserMessage(originalMessages);
  const agentEnabled = isAgentEnabled(body);
  const decisions = [];
  const toolResults = [];

  if (!agentEnabled) {
    decisions.push({ tool: 'none', reason: 'Agent Mode is off.' });
    return { body, toolResults, decisions, agentEnabled };
  }

  if (wantsWebSearch(message)) {
    const query = extractSearchQuery(message);
    decisions.push({ tool: 'web_search', reason: 'User requested web/current/online information.', query });
    const searchResult = await webSearch({ query, cfg, limit: body.hazy?.searchLimit || 8 });
    toolResults.push({
      tool: 'web_search',
      query,
      parameters: { query },
      ...searchResult
    });
  } else {
    decisions.push({ tool: 'none', reason: 'No deterministic tool need detected.' });
  }

  if (!toolResults.length) {
    return { body, toolResults, decisions, agentEnabled };
  }

  const toolContextMessage = {
    role: 'system',
    content: formatToolContext(toolResults)
  };

  return {
    body: {
      ...body,
      hazy: {
        ...(body.hazy || {}),
        agentEnabled,
        toolResults,
        toolDecisions: decisions
      },
      messages: [toolContextMessage, ...originalMessages]
    },
    toolResults,
    decisions,
    agentEnabled
  };
}

module.exports = {
  runDeterministicTools,
  wantsWebSearch,
  extractSearchQuery,
  isAgentEnabled,
  formatToolContext
};
