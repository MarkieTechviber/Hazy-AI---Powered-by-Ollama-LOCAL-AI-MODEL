'use strict';

const CURRENT_YEAR = new Date().getFullYear();
const RECENCY_PATTERN = new RegExp(
  `\\b(latest|current|today|yesterday|tomorrow|now|recent|new|news|update|updated|release|released|version|price|pricing|schedule|score|weather|law|regulation|available|availability|deadline|${CURRENT_YEAR})\\b`,
  'i'
);
const SOURCE_PATTERN = /\b(source|sources|citation|citations|cite|reference|references|verify|verification|fact[- ]?check|link|url)\b/i;
const EXPLICIT_WEB_PATTERN = /\b(search|browse|look\s*up|lookup|google|online|internet|web)\b/i;
const TECHNICAL_PATTERN = /\b(api|sdk|docs?|documentation|release notes|changelog|breaking changes|deprecated|migration|npm|package|library|framework|github)\b/i;
const SOFTWARE_VERSION_PATTERN = /\b(?:latest|current|stable|newest)\s+(?:stable\s+)?version\s+of\b/i;
const NEWS_PATTERN = /\b(news|headline|happened today|this week|breaking)\b/i;
const SHOPPING_PATTERN = /\b(buy|shopping|price|pricing|deal|discount|in stock|available near|compare products?)\b/i;
const DEEP_PATTERN = /\b(deep research|research[\s\S]{0,100}thoroughly|comprehensive research|investigate|compare in depth|full report)\b/i;
const LOCAL_SEARCH_PATTERN = /\b(search|find|look through)\b[\s\S]{0,80}\b(my|this|the|these)\s+(uploaded\s+)?(files?|documents?|notes?|project(?:\s+files?)?|codebase|array|list|database|uploads?|attachments?)\b/i;
const STABLE_TASK_PATTERN = /\b(explain|rewrite|translate|brainstorm|write|draft|summarize this|creative|story|poem|algorithm|binary search)\b/i;
const CODE_CREATION_PATTERN = /\b(create|build|write|implement|generate|refactor|fix)\b[\s\S]{0,40}\b(code|function|app|website|script|component|api client|search algorithm)\b/i;
const ALGORITHM_SEARCH_PATTERN = /\b(binary|linear|depth[- ]first|breadth[- ]first|dijkstra'?s?|a\*|sorting|searching)\s+(search|algorithm)\b/i;

function extractDomains(message = '') {
  const text = String(message);
  const domains = [];
  const matches = [
    ...text.matchAll(/\bsite:([a-z0-9-]+(?:\.[a-z0-9-]+)+)\b/gi),
    ...text.matchAll(/\bhttps?:\/\/([a-z0-9.-]+\.[a-z]{2,})(?:[/:?#]|$)/gi),
    ...text.matchAll(/\b(?:on|from|within)\s+([a-z0-9-]+(?:\.[a-z0-9-]+)+)\b/gi)
  ];
  for (const match of matches) {
    try {
      const host = new URL(`https://${match[1]}`).hostname.toLowerCase();
      if (!domains.includes(host)) domains.push(host);
    } catch {}
  }
  return domains.slice(0, 8);
}

function createDecision(mode, reason, overrides = {}) {
  const defaults = {
    none: { maxQueries: 0, maxResults: 0, maxPagesToFetch: 0, needsCitations: false },
    quick_web: { maxQueries: 3, maxResults: 10, maxPagesToFetch: 4, needsCitations: true },
    deep_web: { maxQueries: 5, maxResults: 20, maxPagesToFetch: 8, needsCitations: true },
    domain_limited: { maxQueries: 3, maxResults: 12, maxPagesToFetch: 5, needsCitations: true },
    news: { maxQueries: 4, maxResults: 15, maxPagesToFetch: 6, needsCitations: true },
    shopping: { maxQueries: 4, maxResults: 15, maxPagesToFetch: 6, needsCitations: true },
    technical_docs: { maxQueries: 4, maxResults: 12, maxPagesToFetch: 5, needsCitations: true }
  }[mode];
  return {
    mode,
    reason,
    freshnessRequired: false,
    allowedDomains: [],
    blockedDomains: [],
    ...defaults,
    ...overrides
  };
}

function detectSearchDecision(userMessage = '', options = {}) {
  const text = String(userMessage || '').trim();
  if (!text) return createDecision('none', 'No user message was provided.');
  if (options.forceSearch === false) return createDecision('none', 'Search was explicitly disabled.');

  const domains = extractDomains(text);
  const freshnessRequired = RECENCY_PATTERN.test(text);
  const asksForSources = SOURCE_PATTERN.test(text);
  const explicitWeb = EXPLICIT_WEB_PATTERN.test(text);
  const technical = TECHNICAL_PATTERN.test(text) || SOFTWARE_VERSION_PATTERN.test(text);

  if ((LOCAL_SEARCH_PATTERN.test(text) || ALGORITHM_SEARCH_PATTERN.test(text)) && !freshnessRequired && !asksForSources) {
    return createDecision('none', 'The request refers to local or uploaded data, not the public web.');
  }
  if (CODE_CREATION_PATTERN.test(text) && !freshnessRequired && !asksForSources && !/\b(search online|browse the web|look up)\b/i.test(text)) {
    return createDecision('none', 'The request is to create or edit code, not to retrieve public web evidence.');
  }
  if (options.forceSearch === true) {
    return createDecision('quick_web', 'Search was explicitly requested by the application.', {
      freshnessRequired,
      allowedDomains: domains
    });
  }
  if (domains.length && (explicitWeb || asksForSources || freshnessRequired)) {
    return createDecision('domain_limited', 'The request targets one or more specific public domains.', {
      freshnessRequired,
      allowedDomains: domains
    });
  }
  if (DEEP_PATTERN.test(text)) {
    return createDecision('deep_web', 'The user requested broad or in-depth web research.', {
      freshnessRequired: true
    });
  }
  if (NEWS_PATTERN.test(text) && (freshnessRequired || explicitWeb)) {
    return createDecision('news', 'The request concerns current news or events.', {
      freshnessRequired: true
    });
  }
  if (SHOPPING_PATTERN.test(text) && (freshnessRequired || explicitWeb || asksForSources)) {
    return createDecision('shopping', 'The request requires current product, price, or availability data.', {
      freshnessRequired: true
    });
  }
  if (technical && (freshnessRequired || asksForSources || explicitWeb)) {
    return createDecision('technical_docs', 'The request requires current technical documentation or version information.', {
      freshnessRequired: true
    });
  }
  if (freshnessRequired || asksForSources || explicitWeb) {
    return createDecision('quick_web', 'The request needs fresh or externally verifiable information.', {
      freshnessRequired
    });
  }
  if (STABLE_TASK_PATTERN.test(text)) {
    return createDecision('none', 'The request is a stable knowledge or writing task.');
  }
  return createDecision('none', 'The request can likely be answered without public web evidence.');
}

module.exports = {
  detectSearchDecision,
  extractDomains,
  createDecision,
  RECENCY_PATTERN,
  TECHNICAL_PATTERN
};
