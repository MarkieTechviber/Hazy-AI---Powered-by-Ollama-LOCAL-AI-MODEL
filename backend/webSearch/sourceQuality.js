'use strict';

const OFFICIAL_HOSTS = [
  'developer.mozilla.org', 'github.com', 'nodejs.org', 'typescriptlang.org',
  'react.dev', 'nextjs.org', 'platform.openai.com', 'docs.anthropic.com'
];

function getHostname(url) {
  try { return new URL(url).hostname.replace(/^www\./, '').toLowerCase(); } catch { return ''; }
}

function scoreSourceQuality(result = {}, decision = {}) {
  const host = getHostname(result.url);
  let score = 45;
  if (OFFICIAL_HOSTS.some((domain) => host === domain || host.endsWith(`.${domain}`))) score += 30;
  if (host.endsWith('.gov') || host.endsWith('.edu')) score += 25;
  if (decision.allowedDomains?.some((domain) => host === domain || host.endsWith(`.${domain}`))) score += 25;
  if (/\b(docs?|developer|support|help|about)\b/.test(host)) score += 12;
  if (result.publishedAt) score += 5;
  if (String(result.snippet || '').length > 80) score += 5;
  if (result.rank <= 3) score += 10;
  if (result.rank > 8) score -= 10;
  return Math.max(0, Math.min(100, score));
}

module.exports = { scoreSourceQuality, getHostname, OFFICIAL_HOSTS };
