'use strict';

const { extractDomains } = require('./searchRouter');

const VALID_INTENTS = new Set(['primary', 'official', 'news', 'docs', 'comparison', 'fact_check', 'fresh']);
const QUERY_NOISE = /\b(can|could|would|please|you|search|browse|look\s*up|lookup|google|online|internet|web|tell me|show me|give me)\b/gi;

function cleanQuery(text = '') {
  return String(text)
    .replace(/[\u201c\u201d]/g, '"')
    .replace(/[\u2018\u2019]/g, "'")
    .replace(QUERY_NOISE, ' ')
    .replace(/\s+/g, ' ')
    .replace(/^[,.:;?!\s]+|[,.:;?!\s]+$/g, '')
    .trim()
    .slice(0, 320);
}

function previousUserSubject(messages = []) {
  const users = messages.filter((message) => message?.role === 'user' && typeof message.content === 'string');
  for (let index = users.length - 2; index >= 0; index -= 1) {
    const candidate = cleanQuery(users[index].content);
    if (candidate.length >= 4) return candidate;
  }
  return '';
}

function resolveUserQuestion(userMessage = '', messages = []) {
  let query = cleanQuery(userMessage);
  const vague = /\b(it|that|this|those|them|the source|the link|its|their)\b/i.test(userMessage)
    && query.split(/\s+/).length <= 10;
  if (vague) {
    const previous = previousUserSubject(messages);
    if (previous) query = `${previous} ${query}`;
  }
  return query || String(userMessage || '').trim();
}

function addQuery(queries, query, intent, priority, options = {}) {
  const value = cleanQuery(query);
  if (value.length < 4) return;
  const key = value.toLowerCase();
  if (queries.some((item) => item.query.toLowerCase() === key)) return;
  queries.push({ query: value, intent, priority, ...options });
}

function addDomainQueries(queries, domains, question, intent = 'official') {
  for (const domain of domains || []) {
    addQuery(queries, `site:${domain} ${question}`, intent, 115, { domain });
  }
}

function planQueries(userMessage, decision, options = {}) {
  if (!decision || decision.mode === 'none') return [];
  const question = resolveUserQuestion(userMessage, options.messages || []);
  const domains = decision.allowedDomains?.length
    ? decision.allowedDomains
    : extractDomains(userMessage);
  const year = new Date().getFullYear();
  const queries = [];

  if (decision.mode === 'domain_limited') {
    addDomainQueries(queries, domains, question, decision.category === 'technical' ? 'docs' : 'official');
    addQuery(queries, question, 'primary', 60);
  } else if (decision.mode === 'official_only') {
    addQuery(queries, `${question} official documentation`, 'docs', 105);
    addQuery(queries, `${question} official source`, 'official', 100);
    addQuery(queries, `${question} release notes changelog ${year}`, 'fresh', 90);
    addQuery(queries, `${question} GitHub`, 'fact_check', 70);
  } else if (decision.mode === 'fresh_required') {
    addQuery(queries, `${question} ${year}`, 'fresh', 105);
    addQuery(queries, `${question} latest update`, 'news', 95);
    addQuery(queries, `${question} official source`, 'official', 85);
    addQuery(queries, `${question} price availability schedule`, 'primary', 70);
  } else if (decision.mode === 'research_mode') {
    addQuery(queries, question, 'primary', 100);
    addQuery(queries, `${question} official source`, 'official', 98);
    addQuery(queries, `${question} ${year} latest`, 'fresh', 94);
    addQuery(queries, `${question} analysis`, 'primary', 82);
    addQuery(queries, `${question} criticism limitations`, 'comparison', 76);
    addQuery(queries, `${question} fact check`, 'fact_check', 72);
    addQuery(queries, `${question} primary source`, 'official', 70);
  } else if (decision.mode === 'deep_web') {
    addQuery(queries, question, 'primary', 100);
    addQuery(queries, `${question} official source`, 'official', 95);
    addQuery(queries, `${question} analysis`, 'primary', 85);
    addQuery(queries, `${question} fact check`, 'fact_check', 75);
  } else {
    addQuery(queries, question, 'primary', 100);
    addQuery(queries, `${question} official source`, 'official', 88);
    if (decision.freshnessRequired) addQuery(queries, `${question} ${year}`, 'fresh', 84);
    if (decision.needsCitations) addQuery(queries, `${question} evidence`, 'fact_check', 72);
  }

  if (domains.length && decision.mode !== 'domain_limited') {
    addDomainQueries(queries, domains, question, decision.mode === 'official_only' ? 'docs' : 'official');
  }

  return queries
    .filter((query) => VALID_INTENTS.has(query.intent))
    .sort((a, b) => b.priority - a.priority)
    .slice(0, decision.maxQueries);
}

module.exports = {
  planQueries,
  cleanQuery,
  resolveUserQuestion,
  previousUserSubject,
  VALID_INTENTS
};
