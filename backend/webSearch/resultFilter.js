'use strict';

const BAD_PATH_PATTERNS = [
  '/login', '/signin', '/signup', '/register', '/cart', '/checkout',
  '/privacy', '/terms', '/tag/', '/category/', '/search?'
];
const TRACKING_PARAMS = [
  'utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content',
  'gclid', 'fbclid', 'ref', 'ref_src'
];

function normalizeUrl(rawUrl) {
  const url = new URL(rawUrl);
  url.hash = '';
  for (const param of TRACKING_PARAMS) url.searchParams.delete(param);
  if (url.pathname !== '/') url.pathname = url.pathname.replace(/\/+$/, '');
  return url.toString();
}

function hostnameMatches(host, domains = []) {
  return domains.some((domain) => host === domain || host.endsWith(`.${domain}`));
}

function isLikelyUsefulResult(result, decision = {}) {
  try {
    const url = new URL(result.url);
    if (!['http:', 'https:'].includes(url.protocol)) return false;
    if (!result.title || result.title.trim().length < 4) return false;
    const lower = `${url.pathname}${url.search}`.toLowerCase();
    if (BAD_PATH_PATTERNS.some((pattern) => lower.includes(pattern))) return false;
    if (decision.allowedDomains?.length && !hostnameMatches(url.hostname, decision.allowedDomains)) return false;
    if (decision.blockedDomains?.length && hostnameMatches(url.hostname, decision.blockedDomains)) return false;
    return true;
  } catch {
    return false;
  }
}

function textSimilarity(a = '', b = '') {
  const words = (value) => new Set(String(value).toLowerCase().split(/\W+/).filter((word) => word.length > 3));
  const left = words(a);
  const right = words(b);
  if (!left.size || !right.size) return 0;
  let intersection = 0;
  for (const word of left) if (right.has(word)) intersection += 1;
  return intersection / Math.max(left.size, right.size);
}

function filterSearchResults(results = [], decision = {}) {
  const selected = [];
  const seenUrls = new Set();
  for (const result of results) {
    if (!isLikelyUsefulResult(result, decision)) continue;
    const url = normalizeUrl(result.url);
    if (seenUrls.has(url)) continue;
    const duplicate = selected.some((item) =>
      textSimilarity(`${item.title} ${item.snippet}`, `${result.title} ${result.snippet}`) >= 0.85
    );
    if (duplicate) continue;
    seenUrls.add(url);
    selected.push({ ...result, url });
    if (selected.length >= decision.maxResults) break;
  }
  return selected;
}

module.exports = {
  filterSearchResults,
  normalizeUrl,
  isLikelyUsefulResult,
  textSimilarity,
  hostnameMatches,
  BAD_PATH_PATTERNS
};
