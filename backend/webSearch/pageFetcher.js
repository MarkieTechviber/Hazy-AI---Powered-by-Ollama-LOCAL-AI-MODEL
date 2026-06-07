'use strict';

const dns = require('dns').promises;
const net = require('net');

const MAX_HTML_BYTES = 2 * 1024 * 1024;
const DEFAULT_TIMEOUT_MS = 8000;

function isPrivateIp(address) {
  if (!net.isIP(address)) return true;
  if (address === '127.0.0.1' || address === '::1' || address === '0.0.0.0') return true;
  if (address.startsWith('10.') || address.startsWith('192.168.') || address.startsWith('169.254.')) return true;
  const match = address.match(/^172\.(\d+)\./);
  if (match && Number(match[1]) >= 16 && Number(match[1]) <= 31) return true;
  const normalized = address.toLowerCase();
  return normalized.startsWith('fc') || normalized.startsWith('fd') || normalized.startsWith('fe80:');
}

async function assertPublicUrl(rawUrl, lookup = dns.lookup) {
  const url = new URL(rawUrl);
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error('Only HTTP(S) pages may be fetched.');
  if (url.username || url.password) throw new Error('Credential-bearing URLs are not allowed.');
  const host = url.hostname.toLowerCase();
  if (host === 'localhost' || host.endsWith('.local')) throw new Error('Local network URLs are blocked.');
  if (net.isIP(host)) {
    if (isPrivateIp(host)) throw new Error('Private network URLs are blocked.');
    return url;
  }
  const addresses = await lookup(host, { all: true });
  if (!addresses.length || addresses.some((entry) => isPrivateIp(entry.address))) {
    throw new Error('Private or unresolved network target.');
  }
  return url;
}

async function readLimitedText(response, maxBytes) {
  if (!response.body?.getReader) {
    const text = await response.text();
    return text.slice(0, maxBytes);
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

async function fetchPage(rawUrl, options = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.timeoutMs || DEFAULT_TIMEOUT_MS);
  try {
    const url = await assertPublicUrl(rawUrl, options.lookup);
    const response = await (options.fetchImpl || fetch)(url, {
      signal: controller.signal,
      redirect: 'follow',
      headers: {
        'User-Agent': 'HazyResearch/1.0',
        'Accept': 'text/html,application/xhtml+xml,text/plain'
      }
    });
    const finalUrl = await assertPublicUrl(response.url || url.toString(), options.lookup);
    const contentType = response.headers.get('content-type') || '';
    if (!response.ok || !/(text\/html|application\/xhtml\+xml|text\/plain)/i.test(contentType)) return null;
    const html = await readLimitedText(response, options.maxBytes || MAX_HTML_BYTES);
    return {
      url: url.toString(),
      finalUrl: finalUrl.toString(),
      title: '',
      sourceName: options.sourceName,
      html,
      text: '',
      publishedAt: options.publishedAt || null,
      fetchedAt: new Date().toISOString(),
      statusCode: response.status
    };
  } catch (error) {
    if (options.onError) options.onError(error);
    return null;
  } finally {
    clearTimeout(timer);
  }
}

module.exports = {
  fetchPage,
  assertPublicUrl,
  isPrivateIp,
  readLimitedText,
  MAX_HTML_BYTES
};
