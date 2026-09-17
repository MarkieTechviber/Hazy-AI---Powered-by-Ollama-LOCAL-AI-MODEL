'use strict';

const dns = require('dns').promises;
const net = require('net');

const MAX_HTML_BYTES = 2 * 1024 * 1024;
const DEFAULT_TIMEOUT_MS = 8000;
const DEFAULT_MAX_REDIRECTS = 4;

const { isPrivateIp, resolvePublicUrl, publicFetch } = require('../security/publicNetwork');
async function assertPublicUrl(rawUrl, lookup = dns.lookup, options = {}) {
  return (await resolvePublicUrl(rawUrl, lookup, options)).url;
}

async function readLimitedText(response, maxBytes) {
  if (!response.body?.getReader) {
    const text = await response.text();
    if (Buffer.byteLength(text, 'utf8') > maxBytes) throw new Error('Page exceeded the maximum response size.');
    return text;
  }
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let bytes = 0;
  let text = '';
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    bytes += value.byteLength;
    if (bytes > maxBytes) {
      await reader.cancel();
      throw new Error('Page exceeded the maximum response size.');
    }
    text += decoder.decode(value, { stream: true });
  }
  return text + decoder.decode();
}

function resolveRedirectUrl(baseUrl, location) {
  if (!location) return null;
  return new URL(location, baseUrl).toString();
}

async function fetchWithRedirects(rawUrl, options = {}) {
  const fetchImpl = options.fetchImpl || ((target, init) => publicFetch(target, { ...options, ...init }));
  let currentUrl = rawUrl;
  const redirects = [];
  for (let count = 0; count <= (options.maxRedirects ?? DEFAULT_MAX_REDIRECTS); count += 1) {
    const safeUrl = await assertPublicUrl(currentUrl, options.lookup, options);
    const response = await fetchImpl(safeUrl, {
      signal: options.signal,
      redirect: 'manual',
      headers: {
        'User-Agent': 'HazyResearch/1.1 (+local-first; safe-fetch)',
        'Accept': 'text/html,application/xhtml+xml,text/plain;q=0.9,*/*;q=0.1'
      }
    });
    if (![301, 302, 303, 307, 308].includes(response.status)) {
      const finalUrl = await assertPublicUrl(response.url || safeUrl.toString(), options.lookup, options);
      return { response, finalUrl: finalUrl.toString(), redirects };
    }
    await response.body?.cancel();
    const location = response.headers.get('location');
    const nextUrl = resolveRedirectUrl(safeUrl.toString(), location);
    if (!nextUrl) throw new Error('Redirect response did not include a Location header.');
    redirects.push({ from: safeUrl.toString(), to: nextUrl, statusCode: response.status });
    currentUrl = nextUrl;
  }
  throw new Error('Too many redirects while fetching page.');
}

async function fetchPage(rawUrl, options = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.timeoutMs || DEFAULT_TIMEOUT_MS);
  const startedAt = Date.now();
  try {
    const sourceUrl = await assertPublicUrl(rawUrl, options.lookup, options);
    const { response, finalUrl, redirects } = await fetchWithRedirects(sourceUrl.toString(), {
      ...options,
      signal: controller.signal
    });
    const contentType = response.headers.get('content-type') || '';
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    if (!/(text\/html|application\/xhtml\+xml|text\/plain)/i.test(contentType)) {
      throw new Error(`Unsupported content type: ${contentType || 'unknown'}`);
    }
    const html = await readLimitedText(response, options.maxBytes || MAX_HTML_BYTES);
    return {
      url: sourceUrl.toString(),
      finalUrl,
      title: '',
      sourceName: options.sourceName,
      html,
      text: '',
      publishedAt: options.publishedAt || null,
      fetchedAt: new Date().toISOString(),
      statusCode: response.status,
      contentType,
      redirects,
      fetchLatencyMs: Date.now() - startedAt,
      fetchError: null
    };
  } catch (error) {
    const payload = {
      url: rawUrl,
      error: error.name === 'AbortError' ? 'Fetch timed out.' : error.message,
      code: error.name === 'AbortError' ? 'FETCH_TIMEOUT' : 'FETCH_FAILED',
      fetchedAt: new Date().toISOString(),
      latencyMs: Date.now() - startedAt
    };
    if (options.onError) options.onError(payload);
    return null;
  } finally {
    clearTimeout(timer);
  }
}

module.exports = {
  fetchPage,
  fetchWithRedirects,
  assertPublicUrl,
  isPrivateIp,
  readLimitedText,
  MAX_HTML_BYTES,
  DEFAULT_MAX_REDIRECTS
};
