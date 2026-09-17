'use strict';

const fs = require('fs');
const path = require('path');
const {
  buildTokenSet,
  tokenize,
  tokenFrequency,
  buildLexicalVector,
  sparseCosineSimilarity,
  denseCosineSimilarity,
  normalizeDenseVector
} = require('../../../rag/embeddingService');

let estimateTokens;
try {
  ({ estimateTokens } = require('../../../ai/context/contextWindowManager'));
} catch {
  estimateTokens = (value = '') => Math.max(1, Math.ceil(String(value || '').split(/\s+/).filter(Boolean).length * 1.3));
}

function clamp01(value) {
  return Math.max(0, Math.min(1, Number(value) || 0));
}

function jaccardSimilarity(left, right) {
  if (!left.size || !right.size) return 0;
  let intersection = 0;
  for (const token of left) {
    if (right.has(token)) intersection += 1;
  }
  return intersection / (left.size + right.size - intersection);
}

function keywordScore(queryTokens, entryTokens) {
  if (!queryTokens.length) return 0;
  const counts = new Map();
  for (const token of entryTokens) counts.set(token, (counts.get(token) || 0) + 1);
  const matches = queryTokens.reduce((sum, token) => sum + Math.min(counts.get(token) || 0, 2), 0);
  return clamp01(matches / queryTokens.length);
}

function phraseScore(query = '', text = '') {
  const cleanQuery = String(query || '').toLowerCase().replace(/\s+/g, ' ').trim();
  if (!cleanQuery || cleanQuery.length < 4) return 0;
  const cleanText = String(text || '').toLowerCase().replace(/\s+/g, ' ');
  if (cleanText.includes(cleanQuery)) return 1;
  const queryTokens = tokenize(cleanQuery, { keepStopWords: true });
  if (queryTokens.length < 2) return 0;
  let phraseHits = 0;
  for (let index = 0; index < queryTokens.length - 1; index += 1) {
    if (cleanText.includes(`${queryTokens[index]} ${queryTokens[index + 1]}`)) phraseHits += 1;
  }
  return clamp01(phraseHits / Math.max(1, queryTokens.length - 1));
}

function recencyScore(createdAt) {
  const timestamp = Date.parse(createdAt || '');
  if (!Number.isFinite(timestamp)) return 0.5;
  const ageDays = Math.max(0, (Date.now() - timestamp) / 86400000);
  return clamp01(Math.exp(-ageDays / 365));
}

function contentSimilarity(left, right) {
  const leftTokens = new Set(Array.isArray(left.tokenSet) ? left.tokenSet : tokenize(left.text));
  const rightTokens = new Set(Array.isArray(right.tokenSet) ? right.tokenSet : tokenize(right.text));
  return jaccardSimilarity(leftTokens, rightTokens);
}

function mmrDiversify(entries, limit, lambda = 0.82) {
  const pool = [...entries];
  const selected = [];
  while (pool.length && selected.length < limit) {
    let bestIndex = 0;
    let bestScore = -Infinity;
    for (let index = 0; index < pool.length; index += 1) {
      const candidate = pool[index];
      const redundancy = selected.length
        ? Math.max(...selected.map((item) => contentSimilarity(candidate, item)))
        : 0;
      const sameFilePenalty = selected.some((item) => item.fileId === candidate.fileId) ? 0.03 : 0;
      const score = lambda * candidate.finalScore - (1 - lambda) * redundancy - sameFilePenalty;
      if (score > bestScore) {
        bestScore = score;
        bestIndex = index;
      }
    }
    selected.push(pool.splice(bestIndex, 1)[0]);
  }
  return selected;
}

function normalizeEntry(chunk, id) {
  const text = String(chunk.text || '').trim();
  const tokenSet = Array.from(buildTokenSet(text));
  return {
    ...chunk,
    id,
    userId: chunk.userId || 'default',
    projectId: chunk.projectId || '',
    tokenCount: chunk.tokenCount || estimateTokens(text),
    tokenSet,
    tokenFrequency: tokenFrequency(text),
    lexicalVector: buildLexicalVector(text),
    embedding: Array.isArray(chunk.embedding) ? normalizeDenseVector(chunk.embedding) : undefined,
    createdAt: chunk.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
}

class VectorSearch {
  constructor(baseDir, options = {}) {
    this.baseDir = baseDir;
    this.filePath = options.filePath || path.join(baseDir, 'rag-index.json');
    this.embeddingService = options.embeddingService || null;
    this._cachedIndex = null;
    this._cachedMtime = 0;
    this._lastStatTime = 0;
  }

  ensureFile() {
    if (!fs.existsSync(this.baseDir)) fs.mkdirSync(this.baseDir, { recursive: true });
    if (!fs.existsSync(this.filePath)) fs.writeFileSync(this.filePath, JSON.stringify([], null, 2));
  }

  readIndex() {
    this.ensureFile();
    try {
      const now = Date.now();
      // Throttle fs.statSync checks to at most once per 1000ms under load to prevent blocking Node's event loop
      if (this._cachedIndex && this._lastStatTime && (now - this._lastStatTime < 1000)) {
        return this._cachedIndex;
      }
      const stats = fs.statSync(this.filePath);
      const mtime = stats.mtimeMs;
      this._lastStatTime = now;
      if (this._cachedIndex && this._cachedMtime === mtime) {
        return this._cachedIndex;
      }
      const raw = fs.readFileSync(this.filePath, 'utf8');
      const parsed = JSON.parse(raw || '[]');
      this._cachedIndex = Array.isArray(parsed) ? parsed : [];
      this._cachedMtime = mtime;
      return this._cachedIndex;
    } catch {
      let raw = '';
      try {
        raw = fs.readFileSync(this.filePath, 'utf8');
      } catch {}
      const backupPath = `${this.filePath}.corrupt.${Date.now()}.bak`;
      try {
        fs.writeFileSync(backupPath, raw);
      } catch {}
      fs.writeFileSync(this.filePath, JSON.stringify([], null, 2));
      this._cachedIndex = [];
      this._cachedMtime = 0;
      this._lastStatTime = 0;
      return [];
    }
  }

  writeIndex(entries) {
    this.ensureFile();
    const safeEntries = Array.isArray(entries) ? entries : [];
    const tmpPath = `${this.filePath}.${process.pid}.${Date.now()}.tmp`;
    fs.writeFileSync(tmpPath, JSON.stringify(safeEntries, null, 2));
    fs.renameSync(tmpPath, this.filePath);
    this._cachedIndex = safeEntries;
    try {
      const stats = fs.statSync(this.filePath);
      this._cachedMtime = stats.mtimeMs;
      this._lastStatTime = Date.now();
    } catch {
      this._cachedMtime = 0;
      this._lastStatTime = 0;
    }
  }

  addDocuments(chunks = [], options = {}) {
    const replaceFile = options.replaceFile !== false;
    const current = this.readIndex();
    const scopeKey = entry => JSON.stringify([entry.userId || 'default', entry.projectId || '', String(entry.fileId)]);
    const incomingFileIds = new Set(chunks.filter(chunk => chunk?.fileId).map(scopeKey));
    const byId = new Map(
      current
        .filter((entry) => !replaceFile || !incomingFileIds.has(scopeKey(entry)))
        .map((entry) => [JSON.stringify([scopeKey(entry), entry.id]), entry])
    );

    for (const chunk of chunks) {
      if (!chunk?.text) continue;
      const id = chunk.id || chunk.chunkId || `chunk_${chunk.fileId || 'document'}_${chunk.chunkIndex ?? byId.size}`;
      byId.set(JSON.stringify([scopeKey(chunk), id]), normalizeEntry(chunk, id));
    }
    this.writeIndex([...byId.values()]);
  }

  async addDocumentsAsync(chunks = [], options = {}) {
    const embeddingService = options.embeddingService || this.embeddingService;
    const withEmbeddings = chunks.map(chunk => ({ ...chunk }));
    if (embeddingService && typeof embeddingService.embedMany === 'function') {
      const missing = withEmbeddings.filter((chunk) => chunk?.text && !Array.isArray(chunk.embedding));
      if (missing.length) {
        try {
          const embeddings = await embeddingService.embedMany(missing.map(chunk => chunk.text));
          missing.forEach((chunk, index) => { chunk.embedding = embeddings[index]; chunk.embeddingModel = embeddingService.model; });
        } catch { /* Lexical indexing remains available without an embedding model. */ }
      }
    }
    this.addDocuments(withEmbeddings, options);
  }

  deleteFile(fileId, userId = null, projectId) {
    const before = this.readIndex();
    const after = before.filter((entry) => {
      if (String(entry.fileId) !== String(fileId)) return true;
      if (userId && String(entry.userId || 'default') !== String(userId)) return true;
      if (projectId !== undefined && (entry.projectId || '') !== projectId) return true;
      return false;
    });
    if (after.length !== before.length) this.writeIndex(after);
    return before.length - after.length;
  }

  scoreEntry(entry, query, queryTokens, querySet, queryLexicalVector, queryEmbedding = null, queryEmbeddingModel = '') {
    const entryTokens = Array.isArray(entry.tokenSet) ? entry.tokenSet : tokenize(entry.text);
    const entrySet = new Set(entryTokens);
    const lexicalVector = entry.lexicalVector || buildLexicalVector(entry.text);
    const lexicalCosine = sparseCosineSimilarity(queryLexicalVector, lexicalVector);
    const lexicalJaccard = jaccardSimilarity(querySet, entrySet);
    const lexicalScore = clamp01((0.65 * lexicalCosine) + (0.35 * lexicalJaccard));
    const exactKeywordScore = keywordScore(queryTokens, tokenize(entry.text));
    const exactPhraseScore = phraseScore(query, entry.text);
    const modelCompatible = !entry.embeddingModel || !queryEmbeddingModel || entry.embeddingModel === queryEmbeddingModel;
    const semanticScore = modelCompatible && queryEmbedding && Array.isArray(entry.embedding)
      ? denseCosineSimilarity(queryEmbedding, entry.embedding)
      : 0;

    const relevanceScore = semanticScore > 0
      ? clamp01(0.48 * semanticScore + 0.22 * lexicalScore + 0.20 * exactKeywordScore + 0.10 * exactPhraseScore)
      : clamp01(0.45 * lexicalScore + 0.38 * exactKeywordScore + 0.17 * exactPhraseScore);

    const freshness = recencyScore(entry.createdAt);
    const documentTrustScore = clamp01(entry.documentTrustScore ?? 0.8);
    const finalScore = clamp01(
      0.90 * relevanceScore
      + 0.06 * documentTrustScore
      + 0.04 * freshness
    );

    return {
      ...entry,
      semanticScore,
      lexicalScore,
      vectorScore: semanticScore || lexicalScore,
      keywordScore: exactKeywordScore,
      phraseScore: exactPhraseScore,
      relevanceScore,
      recencyScore: freshness,
      documentTrustScore,
      finalScore
    };
  }

  getCandidates(query = '', options = {}) {
    const settings = typeof options === 'number' ? { limit: options } : options;
    const queryTokens = tokenize(query);
    if (!queryTokens.length && !settings.allowEmptyQuery) return [];

    const selectedFileIds = new Set((settings.fileIds || []).map(String));
    const querySet = new Set(queryTokens);
    const queryLexicalVector = buildLexicalVector(query);
    const queryEmbedding = Array.isArray(settings.queryEmbedding) ? normalizeDenseVector(settings.queryEmbedding) : null;
    const minimumRelevance = Number(settings.minimumRelevance ?? 0.05);
    const minimumScore = Number(settings.minimumScore ?? 0.08);

    return this.readIndex()
      .filter((entry) => !settings.userId || String(entry.userId || 'default') === String(settings.userId))
      .filter((entry) => settings.projectId === undefined || String(entry.projectId || '') === String(settings.projectId || ''))
      .filter((entry) => !selectedFileIds.size || selectedFileIds.has(String(entry.fileId)))
      .map((entry) => this.scoreEntry(entry, query, queryTokens, querySet, queryLexicalVector, queryEmbedding, settings.queryEmbeddingModel))
      .filter((entry) => settings.allowEmptyQuery || entry.relevanceScore >= minimumRelevance)
      .filter((entry) => entry.finalScore >= minimumScore)
      .sort((a, b) => b.finalScore - a.finalScore);
  }

  formatResult(entry) {
    const filename = entry.filename || path.basename(entry.source || 'document');
    return {
      id: entry.id,
      userId: entry.userId || 'default',
      projectId: entry.projectId || '',
      fileId: entry.fileId,
      filename,
      source: entry.source,
      sourceType: entry.sourceType || 'txt',
      pageNumber: entry.pageNumber,
      headingPath: entry.headingPath || [],
      sectionTitle: entry.sectionTitle,
      chunkIndex: entry.chunkIndex,
      contentHash: entry.contentHash,
      text: entry.text,
      tokenCount: entry.tokenCount || estimateTokens(entry.text),
      semanticScore: entry.semanticScore,
      lexicalScore: entry.lexicalScore,
      vectorScore: entry.vectorScore,
      keywordScore: entry.keywordScore,
      phraseScore: entry.phraseScore,
      relevanceScore: entry.relevanceScore,
      recencyScore: entry.recencyScore,
      finalScore: entry.finalScore,
      score: entry.finalScore,
      citation: `[source: ${entry.id}]`,
      summary: `[${filename}] ${String(entry.text || '').slice(0, 220).replace(/\s+/g, ' ')}`
    };
  }

  search(query = '', options = {}) {
    const settings = typeof options === 'number' ? { limit: options } : options;
    const limit = Math.max(1, Math.min(20, Math.floor(Number(settings.limit || settings.topK) || 8)));
    const candidateLimit = Math.max(limit, Math.min(100, Math.floor(Number(settings.candidateLimit) || 30)));
    const candidates = this.getCandidates(query, settings).slice(0, candidateLimit);
    const diversified = settings.diversify === false ? candidates.slice(0, limit) : mmrDiversify(candidates, limit, Number(settings.mmrLambda || 0.82));
    return diversified.map((entry) => this.formatResult(entry));
  }

  async searchAsync(query = '', options = {}) {
    const embeddingService = options.embeddingService || this.embeddingService;
    const eligible = this.readIndex().some(entry => (!options.userId || (entry.userId || 'default') === options.userId)
      && (options.projectId === undefined || (entry.projectId || '') === options.projectId)
      && (!options.fileIds?.length || options.fileIds.includes(entry.fileId))
      && entry.embedding?.length && (!entry.embeddingModel || entry.embeddingModel === embeddingService?.model));
    let queryEmbedding = options.queryEmbedding;
    let mode = 'lexical';
    if (eligible && embeddingService && !Array.isArray(queryEmbedding)) {
      try { queryEmbedding = await embeddingService.embed(query); mode = 'hybrid'; }
      catch { mode = 'lexical-fallback'; }
    }
    const results = this.search(query, { ...options, queryEmbedding, queryEmbeddingModel: embeddingService?.model || options.queryEmbeddingModel || '' });
    Object.defineProperty(results, 'retrievalMode', { value: mode });
    return results;
  }

}

module.exports = {
  clamp01,
  jaccardSimilarity,
  keywordScore,
  phraseScore,
  recencyScore,
  mmrDiversify,
  VectorSearch
};
