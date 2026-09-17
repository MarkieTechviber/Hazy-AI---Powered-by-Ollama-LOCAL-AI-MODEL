'use strict';

const http = require('http');
const https = require('https');

const DEFAULT_STOP_WORDS = new Set([
  'a', 'an', 'and', 'are', 'as', 'at', 'be', 'but', 'by', 'for', 'from',
  'has', 'have', 'he', 'her', 'his', 'i', 'if', 'in', 'into', 'is', 'it',
  'its', 'me', 'my', 'of', 'on', 'or', 'our', 'she', 'so', 'that', 'the',
  'their', 'them', 'then', 'there', 'these', 'they', 'this', 'to', 'was',
  'we', 'were', 'what', 'when', 'where', 'which', 'who', 'why', 'will',
  'with', 'you', 'your'
]);

function normalizeToken(token) {
  return String(token || '')
    .toLowerCase()
    .replace(/^_+|_+$/g, '')
    .replace(/'s$/i, '')
    .trim();
}

function tokenize(text = '', options = {}) {
  const keepStopWords = options.keepStopWords === true;
  const minLength = Math.max(1, Number(options.minLength || 2));
  return String(text || '')
    .toLowerCase()
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .split(/[^a-z0-9_]+/i)
    .map(normalizeToken)
    .filter((token) => token.length >= minLength)
    .filter((token) => keepStopWords || !DEFAULT_STOP_WORDS.has(token));
}

function buildTokenSet(text = '', options = {}) {
  return new Set(tokenize(text, options));
}

function tokenFrequency(text = '', options = {}) {
  const counts = Object.create(null);
  for (const token of tokenize(text, options)) {
    counts[token] = (counts[token] || 0) + 1;
  }
  return counts;
}

function sparseMagnitude(vector = {}) {
  let total = 0;
  for (const value of Object.values(vector || {})) total += Number(value || 0) ** 2;
  return Math.sqrt(total);
}

function normalizeSparseVector(vector = {}) {
  const magnitude = sparseMagnitude(vector);
  if (!magnitude) return {};
  const normalized = Object.create(null);
  for (const [key, value] of Object.entries(vector || {})) {
    normalized[key] = Number(value || 0) / magnitude;
  }
  return normalized;
}

function buildLexicalVector(text = '') {
  return normalizeSparseVector(tokenFrequency(text));
}

function sparseCosineSimilarity(left = {}, right = {}) {
  const leftEntries = Object.entries(left || {});
  if (!leftEntries.length || !Object.keys(right || {}).length) return 0;
  let dot = 0;
  for (const [key, value] of leftEntries) {
    dot += Number(value || 0) * Number(right[key] || 0);
  }
  return Math.max(0, Math.min(1, dot));
}

function normalizeDenseVector(vector = []) {
  const values = Array.isArray(vector) && vector.every(v => typeof v === 'number' && Number.isFinite(v)) ? vector : [];
  const magnitude = Math.sqrt(values.reduce((sum, value) => sum + value ** 2, 0));
  if (!values.length || !magnitude) return [];
  return values.map((value) => value / magnitude);
}

function denseCosineSimilarity(left = [], right = []) {
  if (!Array.isArray(left) || !Array.isArray(right) || !left.length || left.length !== right.length) return 0;
  let dot = 0;
  let leftMag = 0;
  let rightMag = 0;
  for (let index = 0; index < left.length; index += 1) {
    const l = Number(left[index]);
    const r = Number(right[index]);
    if (!Number.isFinite(l) || !Number.isFinite(r)) return 0;
    dot += l * r;
    leftMag += l ** 2;
    rightMag += r ** 2;
  }
  const denominator = Math.sqrt(leftMag) * Math.sqrt(rightMag);
  return denominator ? Math.max(0, Math.min(1, dot / denominator)) : 0;
}

function requestJson(target, { method = 'POST', headers = {}, body, timeoutMs = 30_000 } = {}) {
  return new Promise((resolve, reject) => {
    const url = target instanceof URL ? target : new URL(target);
    const transport = url.protocol === 'https:' ? https : http;
    const payload = JSON.stringify(body || {});
    const request = transport.request({
      protocol: url.protocol,
      hostname: url.hostname,
      port: url.port || (url.protocol === 'https:' ? 443 : 80),
      path: `${url.pathname}${url.search}`,
      method,
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload),
        ...headers
      }
    }, (response) => {
      let raw = '';
      response.on('error', reject);
      response.on('data', (chunk) => {
        if (Buffer.byteLength(raw) + chunk.length > 8 * 1024 * 1024) { response.destroy(new Error('Embedding response too large.')); return; }
        raw += chunk.toString('utf8');
      });
      response.on('end', () => {
        let data;
        try {
          data = JSON.parse(raw || '{}');
        } catch {
          data = { error: raw || 'Invalid JSON response.' };
        }
        if (response.statusCode < 200 || response.statusCode >= 300) {
          const error = new Error(data?.error?.message || data?.message || `Embedding request failed (${response.statusCode}).`);
          error.statusCode = response.statusCode;
          error.providerBody = data;
          reject(error);
          return;
        }
        resolve(data);
      });
    });
    request.setTimeout(timeoutMs, () => request.destroy(new Error('Embedding request timed out.')));
    request.on('error', reject);
    request.write(payload);
    request.end();
  });
}

class OllamaEmbeddingService {
  constructor(options = {}) {
    this.baseUrl = String(options.baseUrl || process.env.OLLAMA_URL || process.env.OLLAMA_HOST || 'http://localhost:11434').replace(/\/+$/, '');
    this.model = options.model || process.env.HAZY_EMBEDDING_MODEL || 'embeddinggemma';
    this.timeoutMs = Math.max(100, Math.min(30000, Number(options.timeoutMs || process.env.HAZY_EMBEDDING_TIMEOUT_MS) || 5000));
    this.cache = new Map();
    this.pending = new Map();
    this.retryAfter = 0;
  }
  async embed(input) {
    const text = String(input || '').trim();
    if (!text) return [];
    const key = require('node:crypto').createHash('sha256').update(`${this.baseUrl}:${this.model}:${text}`).digest('hex');
    if (this.cache.has(key)) return [...this.cache.get(key)];
    if (this.pending.has(key)) return [...await this.pending.get(key)];
    if (Date.now() < this.retryAfter) throw new Error('Embedding provider temporarily unavailable; using lexical retrieval.');
    const operation = (async () => {
      try {
        const data = await requestJson(`${this.baseUrl}/api/embed`, { body: { model: this.model, input: text }, timeoutMs: this.timeoutMs });
        const vector = normalizeDenseVector(data?.embeddings?.[0] || data?.embedding || []);
        if (!vector.length) throw new Error('Invalid embedding response.');
        if (this.cache.size >= 128) this.cache.delete(this.cache.keys().next().value);
        this.cache.set(key, vector);
        return vector;
      } catch (error) { this.retryAfter = Date.now() + 30000; throw error; }
    })();
    this.pending.set(key, operation);
    try { return [...await operation]; } finally { this.pending.delete(key); }
  }
  async embedMany(inputs = []) {
    // Sequential bounded requests reuse the same cache and circuit breaker.
    // Preserve input alignment, including empty chunks.
    const results = [];
    for (const input of inputs) results.push(await this.embed(input));
    return results;
  }
}

module.exports = {
  DEFAULT_STOP_WORDS,
  tokenize,
  buildTokenSet,
  tokenFrequency,
  buildLexicalVector,
  sparseCosineSimilarity,
  denseCosineSimilarity,
  normalizeDenseVector,
  OllamaEmbeddingService
};
