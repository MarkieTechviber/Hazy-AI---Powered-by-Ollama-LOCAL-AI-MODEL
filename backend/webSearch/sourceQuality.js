'use strict';

const OFFICIAL_HOSTS = [
  'developer.mozilla.org', 'github.com', 'gitlab.com', 'nodejs.org', 'typescriptlang.org', 'npmjs.com',
  'react.dev', 'nextjs.org', 'vite.dev', 'python.org', 'docs.python.org', 'platform.openai.com',
  'docs.anthropic.com', 'ai.google.dev', 'cloud.google.com', 'learn.microsoft.com', 'developer.apple.com',
  'docs.oracle.com', 'rust-lang.org', 'go.dev', 'kubernetes.io', 'docker.com', 'docs.docker.com'
];
const REPUTABLE_NEWS_HOSTS = [
  'reuters.com', 'apnews.com', 'bbc.com', 'bbc.co.uk', 'npr.org', 'nytimes.com', 'washingtonpost.com',
  'theguardian.com', 'bloomberg.com', 'ft.com', 'nature.com', 'science.org', 'who.int', 'cdc.gov'
];
const LOW_QUALITY_PATTERNS = /\b(content farm|coupon|promo code|apk|crack|warez|scraper|mirror)\b/i;

function getHostname(url) {
  try { return new URL(url).hostname.replace(/^www\./, '').toLowerCase(); } catch { return ''; }
}

function hostMatches(host, domains = []) {
  return domains.some((domain) => host === domain || host.endsWith(`.${domain}`));
}

function isOfficialSource(result = {}, decision = {}) {
  const host = getHostname(result.url);
  return Boolean(
    hostMatches(host, OFFICIAL_HOSTS)
    || host.endsWith('.gov')
    || host.endsWith('.edu')
    || hostMatches(host, decision.allowedDomains || [])
    || /\b(official|documentation|docs|developer|support|help|release notes|changelog)\b/i.test(`${result.title || ''} ${result.snippet || ''}`)
  );
}

function buildQualitySignals(result = {}, decision = {}) {
  const host = getHostname(result.url);
  return {
    domain: host,
    official: isOfficialSource(result, decision),
    government: host.endsWith('.gov'),
    education: host.endsWith('.edu'),
    reputableNews: hostMatches(host, REPUTABLE_NEWS_HOSTS),
    domainAllowed: hostMatches(host, decision.allowedDomains || []),
    hasPublishedDate: Boolean(result.publishedAt),
    hasUsefulSnippet: String(result.snippet || '').length > 80,
    topProviderRank: Number(result.rawRank || result.rank || 99) <= 3,
    seoSpam: LOW_QUALITY_PATTERNS.test(`${result.title || ''} ${result.snippet || ''} ${result.url || ''}`),
    spamPenalty: Number(result.filterSignals?.spamPenalty || 0)
  };
}

function scoreSourceQuality(result = {}, decision = {}) {
  const signals = buildQualitySignals(result, decision);
  let score = 45;
  if (signals.official) score += 30;
  if (signals.government || signals.education) score += 20;
  if (signals.reputableNews) score += 18;
  if (signals.domainAllowed) score += 22;
  if (/\b(docs?|developer|support|help|about|release|changelog)\b/i.test(signals.domain)) score += 10;
  if (signals.hasPublishedDate) score += 6;
  if (signals.hasUsefulSnippet) score += 5;
  if (signals.topProviderRank) score += 9;
  if (Number(result.rawRank || result.rank || 0) > 8) score -= 8;
  if (signals.seoSpam) score -= 25;
  score -= signals.spamPenalty;
  return Math.max(0, Math.min(100, score));
}

function annotateSourceQuality(result = {}, decision = {}) {
  const qualitySignals = {
    ...(result.qualitySignals || {}),
    ...buildQualitySignals(result, decision)
  };
  const sourceQualityScore = scoreSourceQuality({ ...result, qualitySignals }, decision);
  return { ...result, qualitySignals, sourceQualityScore };
}

module.exports = {
  scoreSourceQuality,
  annotateSourceQuality,
  buildQualitySignals,
  isOfficialSource,
  getHostname,
  OFFICIAL_HOSTS,
  REPUTABLE_NEWS_HOSTS
};
