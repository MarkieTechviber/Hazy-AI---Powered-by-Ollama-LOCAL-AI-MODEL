'use strict';

const CURRENT_YEAR = new Date().getFullYear();
const MODE_DEFAULTS = Object.freeze({
  none: { maxQueries: 0, maxResults: 0, maxPagesToFetch: 0, needsCitations: false },
  quick_web: { maxQueries: 3, maxResults: 10, maxPagesToFetch: 4, needsCitations: true },
  deep_web: { maxQueries: 5, maxResults: 20, maxPagesToFetch: 8, needsCitations: true },
  official_only: { maxQueries: 4, maxResults: 12, maxPagesToFetch: 5, needsCitations: true, officialOnly: true },
  domain_limited: { maxQueries: 4, maxResults: 12, maxPagesToFetch: 5, needsCitations: true },
  fresh_required: { maxQueries: 4, maxResults: 16, maxPagesToFetch: 6, needsCitations: true, freshnessRequired: true },
  research_mode: { maxQueries: 7, maxResults: 28, maxPagesToFetch: 10, needsCitations: true, freshnessRequired: true }
});

const RECENCY_PATTERN = new RegExp(
  `\\b(latest|current|today|tonight|yesterday|tomorrow|now|recent|new|news|update|updated|release|released|version|price|pricing|schedule|score|weather|law|regulation|available|availability|deadline|${CURRENT_YEAR})\\b`,
  'i'
);
const SOURCE_PATTERN = /\b(source|sources|citation|citations|cite|reference|references|verify|verification|fact[- ]?check|evidence|prove|link|url)\b/i;
const EXPLICIT_WEB_PATTERN = /\b(search|browse|look\s*up|lookup|google|online|internet|web)\b/i;
const TECHNICAL_PATTERN = /\b(api|sdk|docs?|documentation|release notes|changelog|breaking changes|deprecated|migration|npm|package|library|framework|github|gitlab|openapi|endpoint|version)\b/i;
const OFFICIAL_PATTERN = /\b(official|primary source|government|gov(?:ernment)?|api docs?|documentation|release notes|changelog|legal|law|regulation|medical|health|financial|filing|policy)\b/i;
const NEWS_PATTERN = /\b(news|headline|happened today|this week|breaking|current events?)\b/i;
const SHOPPING_PATTERN = /\b(buy|shopping|price|pricing|deal|discount|in stock|available near|compare products?|recommend(?:ation)?s?|best\s+(?:laptop|phone|camera|tool|product|service))\b/i;
const DEEP_PATTERN = /\b(deep research|research[\s\S]{0,100}thoroughly|comprehensive research|investigate|compare in depth|full report|literature review|market research|cross[- ]check)\b/i;
const NICHE_VERIFY_PATTERN = /\b(niche|obscure|rumou?r|claim|is it true|did .* really|confirm whether|double[- ]check|verify)\b/i;
const LOCAL_SEARCH_PATTERN = /\b(search|find|look through)\b[\s\S]{0,80}\b(my|this|the|these)\s+(uploaded\s+)?(files?|documents?|notes?|project(?:\s+files?)?|codebase|array|list|database|uploads?|attachments?)\b/i;
const STABLE_TASK_PATTERN = /\b(explain|rewrite|translate|brainstorm|write|draft|summarize this|creative|story|poem|algorithm|binary search)\b/i;
const CODE_CREATION_PATTERN = /\b(create|build|write|implement|generate|refactor|fix)\b[\s\S]{0,80}\b(code|function|app|website|script|component|api client|search algorithm)\b/i;
const ALGORITHM_SEARCH_PATTERN = /\b(binary|linear|depth[- ]first|breadth[- ]first|dijkstra'?s?|a\*|sorting|searching)\s+(search|algorithm)\b/i;
const FACTUAL_QUESTION_PATTERN = /^\s*(who|what|when|where|why|how|which|is\s+there|are\s+there|did|does|do|can\s+you\s+(?:find|tell|show)|what(?:'s|\s+is|\s+are)|who(?:'s|\s+is|\s+are)|where(?:'s|\s+is|\s+are)|how\s+(?:much|many|often|long|far|old|do|does|did|to)|list|name|find|tell\s+me\s+about|what\s+happened)\b/i;
const TOPICAL_INTEREST_PATTERN = /\b(top|best|trending|popular|famous|greatest|worst|ranked|ranking|rated|winner|winners|won|champion|award|awards|nominated|released|album|song|songs|movie|movies|film|show|series|actor|actress|singer|artist|band|team|player|game|match|tournament|fight|election|president|minister|ceo|founder|company|brand|product|country|capital|population|born|died|founded|invented|discovered|symptoms|treatment|cause|causes|definition|meaning|salary|worth|net worth|height|age|birthday|married|wife|husband|children)\b/i;

function normalizeDomain(value = '') {
  const domain = String(value || '')
    .trim()
    .replace(/^https?:\/\//i, '')
    .replace(/^www\./i, '')
    .replace(/[/:?#].*$/, '')
    .toLowerCase();
  if (!/^[a-z0-9-]+(?:\.[a-z0-9-]+)+$/.test(domain)) return '';
  return domain;
}

function extractDomains(message = '') {
  const text = String(message);
  const domains = [];
  const matches = [
    ...text.matchAll(/\bsite:([a-z0-9-]+(?:\.[a-z0-9-]+)+)\b/gi),
    ...text.matchAll(/\bhttps?:\/\/([a-z0-9.-]+\.[a-z]{2,})(?:[/:?#]|$)/gi),
    ...text.matchAll(/\b(?:on|from|within|only|site)\s+([a-z0-9-]+(?:\.[a-z0-9-]+)+)\b/gi)
  ];
  for (const match of matches) {
    const host = normalizeDomain(match[1]);
    if (host && !domains.includes(host)) domains.push(host);
  }
  return domains.slice(0, 8);
}

function createDecision(mode, reason, overrides = {}) {
  const normalizedMode = MODE_DEFAULTS[mode] ? mode : 'quick_web';
  const defaults = MODE_DEFAULTS[normalizedMode];
  return {
    mode: normalizedMode,
    reason,
    freshnessRequired: false,
    officialOnly: false,
    allowedDomains: [],
    blockedDomains: [],
    category: 'general',
    ...defaults,
    ...overrides
  };
}

function detectSearchDecision(userMessage = '', options = {}) {
  const text = String(userMessage || '').trim();
  if (!text) return createDecision('none', 'No user message was provided.');
  if (options.forceSearch === false) return createDecision('none', 'Search was explicitly disabled by the application.');

  const domains = extractDomains(text);
  const freshnessRequired = RECENCY_PATTERN.test(text);
  const asksForSources = SOURCE_PATTERN.test(text);
  const explicitWeb = EXPLICIT_WEB_PATTERN.test(text);
  const technical = TECHNICAL_PATTERN.test(text);
  const official = OFFICIAL_PATTERN.test(text) || technical;
  const needsVerification = asksForSources || NICHE_VERIFY_PATTERN.test(text);

  if (LOCAL_SEARCH_PATTERN.test(text) && !/\b(public web|online|internet|website|site:)\b/i.test(text)) {
    return createDecision('none', 'The request points to local/uploaded data, not public web evidence.');
  }
  if (ALGORITHM_SEARCH_PATTERN.test(text) && !freshnessRequired && !asksForSources && !/\b(public web|online|internet|latest|current|cite|source)\b/i.test(text)) {
    return createDecision('none', 'The request points to stable algorithm knowledge, not public web evidence.');
  }
  if (CODE_CREATION_PATTERN.test(text) && !freshnessRequired && !asksForSources && !/\b(search online|browse the web|look up|latest docs?)\b/i.test(text)) {
    return createDecision('none', 'The request is to create or edit code, not retrieve public web evidence.');
  }
  if (options.forceSearch === true) {
    return createDecision(domains.length ? 'domain_limited' : 'quick_web', 'Search was explicitly requested by the application.', {
      freshnessRequired,
      allowedDomains: domains,
      category: technical ? 'technical' : 'general'
    });
  }
  if (domains.length && (explicitWeb || asksForSources || freshnessRequired || official)) {
    return createDecision('domain_limited', 'The request targets one or more specific public domains.', {
      freshnessRequired,
      officialOnly: official,
      allowedDomains: domains,
      category: technical ? 'technical' : 'domain'
    });
  }
  if (DEEP_PATTERN.test(text)) {
    return createDecision('research_mode', 'The user requested broad, cross-checked research.', {
      freshnessRequired: true,
      category: 'research'
    });
  }
  if (official && (freshnessRequired || asksForSources || explicitWeb || /\b(api|law|regulation|medical|financial|docs?)\b/i.test(text))) {
    return createDecision('official_only', 'The request should prefer official or primary sources.', {
      freshnessRequired: freshnessRequired || technical,
      category: technical ? 'technical' : 'official'
    });
  }
  if ((NEWS_PATTERN.test(text) || SHOPPING_PATTERN.test(text)) && (freshnessRequired || explicitWeb || asksForSources)) {
    return createDecision('fresh_required', 'The request depends on current news, prices, availability, schedules, or recommendations.', {
      freshnessRequired: true,
      category: SHOPPING_PATTERN.test(text) ? 'shopping' : 'news'
    });
  }
  if (freshnessRequired) {
    return createDecision('fresh_required', 'The request needs fresh or recently updated information.', {
      freshnessRequired: true,
      category: technical ? 'technical' : 'fresh'
    });
  }
  if (needsVerification || explicitWeb) {
    return createDecision('quick_web', 'The request asks for public web evidence or verification.', {
      freshnessRequired: false,
      category: needsVerification ? 'verification' : 'general'
    });
  }
  if (STABLE_TASK_PATTERN.test(text)) {
    return createDecision('none', 'The request is a stable knowledge, writing, or creative task.');
  }
  if (FACTUAL_QUESTION_PATTERN.test(text)) {
    return createDecision('quick_web', 'The request is a factual question that benefits from web evidence.', {
      freshnessRequired: false,
      category: 'factual'
    });
  }
  if (TOPICAL_INTEREST_PATTERN.test(text)) {
    return createDecision('quick_web', 'The request is about a specific topic, entity, or trend that benefits from web evidence.', {
      freshnessRequired: false,
      category: 'topical'
    });
  }
  return createDecision('none', 'The request can likely be answered without public web evidence.');
}

module.exports = {
  detectSearchDecision,
  extractDomains,
  normalizeDomain,
  createDecision,
  MODE_DEFAULTS,
  RECENCY_PATTERN,
  TECHNICAL_PATTERN,
  FACTUAL_QUESTION_PATTERN,
  TOPICAL_INTEREST_PATTERN
};
