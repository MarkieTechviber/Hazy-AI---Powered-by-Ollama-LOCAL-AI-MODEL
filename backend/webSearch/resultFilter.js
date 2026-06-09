'use strict';

const net = require('net');

const BAD_PATH_PATTERNS = [
  '/login', '/signin', '/signup', '/register', '/cart', '/checkout',
  '/privacy', '/terms', '/tag/', '/category/', '/search?', '/author/'
];
const SEO_SPAM_PATTERNS = /\b(best|top)\s+\d+|coupon|promo code|apk download|cracked|alternatives? to|vs\.?(?:$|\s)/i;
const TRACKING_PARAMS = [
  'utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content',
  'gclid', 'fbclid', 'ref', 'ref_src', 'mc_cid', 'mc_eid'
];

function normalizeUrl(rawUrl) {
  const url = new URL(rawUrl);
  url.hash = '';
  for (const param of TRACKING_PARAMS) url.searchParams.delete(param);
  if (url.pathname !== '/') url.pathname = url.pathname.replace(/\/+$/, '');
  return url.toString();
}

function hostnameMatches(host, domains = []) {
  const normalized = String(host || '').replace(/^www\./, '').toLowerCase();
  return domains.some((domain) => normalized === domain || normalized.endsWith(`.${domain}`));
}

function isPrivateHostname(host = '') {
  const normalized = String(host || '').toLowerCase();
  if (!normalized) return true;
  if (normalized === 'localhost' || normalized.endsWith('.localhost') || normalized.endsWith('.local')) return true;
  if (net.isIP(normalized)) {
    if (normalized === '127.0.0.1' || normalized === '::1' || normalized === '0.0.0.0') return true;
    if (normalized.startsWith('10.') || normalized.startsWith('192.168.') || normalized.startsWith('169.254.')) return true;
    const match = normalized.match(/^172\.(\d+)\./);
    if (match && Number(match[1]) >= 16 && Number(match[1]) <= 31) return true;
    return normalized.startsWith('fc') || normalized.startsWith('fd') || normalized.startsWith('fe80:');
  }
  return false;
}

function getUnsafeUrlReason(rawUrl) {
  try {
    const url = new URL(rawUrl);
    if (!['http:', 'https:'].includes(url.protocol)) return 'Only public HTTP(S) URLs are allowed.';
    if (url.username || url.password) return 'Credential-bearing URLs are blocked.';
    if (isPrivateHostname(url.hostname)) return 'Localhost and private network URLs are blocked.';
    return null;
  } catch {
    return 'Malformed URL.';
  }
}

function isLikelyUsefulResult(result, decision = {}) {
  const reason = getUnsafeUrlReason(result?.url);
  if (reason) return false;
  const url = new URL(result.url);
  if (!result.title || result.title.trim().length < 4) return false;
  const lowerPath = `${url.pathname}${url.search}`.toLowerCase();
  if (BAD_PATH_PATTERNS.some((pattern) => lowerPath.includes(pattern))) return false;
  const host = url.hostname.replace(/^www\./, '').toLowerCase();
  if (decision.allowedDomains?.length && !hostnameMatches(host, decision.allowedDomains)) return false;
  if (decision.blockedDomains?.length && hostnameMatches(host, decision.blockedDomains)) return false;
  if (decision.officialOnly) {
    const officialText = /\b(official|documentation|docs|developer|release notes|changelog|api reference|source)\b/i.test(`${result.title || ''} ${result.snippet || ''}`);
    const officialHost = /(\.gov$|\.edu$|docs?|developer|support|help|github|nodejs|mozilla|openai|anthropic|google|microsoft|apple|react|typescript|python|npmjs)/i.test(host);
    if (!officialText && !officialHost) return false;
  }
  return true;
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

function reject(rejected, result, reason) {
  rejected.push({
    title: result?.title || '',
    url: result?.url || '',
    domain: result?.domain || (() => { try { return new URL(result?.url).hostname; } catch { return ''; } })(),
    providerName: result?.providerName || result?.provider || '',
    reason
  });
}

function filterSearchResultsWithReasons(results = [], decision = {}) {
  const selected = [];
  const rejected = [];
  const seenUrls = new Set();
  for (const result of results) {
    const unsafeReason = getUnsafeUrlReason(result?.url);
    if (unsafeReason) { reject(rejected, result, unsafeReason); continue; }
    let normalizedUrl;
    try { normalizedUrl = normalizeUrl(result.url); } catch { reject(rejected, result, 'Malformed URL.'); continue; }
    const normalizedResult = { ...result, url: normalizedUrl };
    if (!isLikelyUsefulResult(normalizedResult, decision)) { reject(rejected, result, 'Result failed domain, path, official-source, or title quality rules.'); continue; }
    if (seenUrls.has(normalizedUrl)) { reject(rejected, result, 'Duplicate URL.'); continue; }
    const duplicate = selected.some((item) =>
      textSimilarity(`${item.title} ${item.snippet}`, `${normalizedResult.title} ${normalizedResult.snippet}`) >= 0.85
    );
    if (duplicate) { reject(rejected, result, 'Near-duplicate title/snippet.'); continue; }
    seenUrls.add(normalizedUrl);
    const spamPenalty = SEO_SPAM_PATTERNS.test(`${normalizedResult.title} ${normalizedResult.snippet}`) ? 15 : 0;
    selected.push({
      ...normalizedResult,
      filterSignals: {
        spamPenalty,
        normalized: normalizedUrl !== result.url
      }
    });
    if (selected.length >= decision.maxResults) break;
  }
  return { accepted: selected, rejected };
}

function filterSearchResults(results = [], decision = {}) {
  return filterSearchResultsWithReasons(results, decision).accepted;
}

module.exports = {
  filterSearchResults,
  filterSearchResultsWithReasons,
  normalizeUrl,
  isLikelyUsefulResult,
  textSimilarity,
  hostnameMatches,
  getUnsafeUrlReason,
  isPrivateHostname,
  BAD_PATH_PATTERNS
};
