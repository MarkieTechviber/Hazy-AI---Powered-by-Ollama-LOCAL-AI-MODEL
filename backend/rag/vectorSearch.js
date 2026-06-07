'use strict';

const fs = require('fs');
const path = require('path');
const { buildTokenSet, tokenize } = require('./embeddingService');
const { estimateTokens } = require('../ai/context/contextWindowManager');

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

function recencyScore(createdAt) {
  const timestamp = Date.parse(createdAt || '');
  if (!Number.isFinite(timestamp)) return 0.5;
  const ageDays = Math.max(0, (Date.now() - timestamp) / 86400000);
  return clamp01(Math.exp(-ageDays / 365));
}

class VectorSearch {
  constructor(baseDir) {
    this.baseDir = baseDir;
    this.filePath = path.join(baseDir, 'rag-index.json');
  }

  ensureFile() {
    if (!fs.existsSync(this.baseDir)) fs.mkdirSync(this.baseDir, { recursive: true });
    if (!fs.existsSync(this.filePath)) fs.writeFileSync(this.filePath, JSON.stringify([], null, 2));
  }

  readIndex() {
    this.ensureFile();
    try {
      const parsed = JSON.parse(fs.readFileSync(this.filePath, 'utf8'));
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  writeIndex(entries) {
    this.ensureFile();
    fs.writeFileSync(this.filePath, JSON.stringify(entries, null, 2));
  }

  addDocuments(chunks = []) {
    const byId = new Map(this.readIndex().map((entry) => [entry.id, entry]));
    for (const chunk of chunks) {
      if (!chunk?.text) continue;
      const id = chunk.id || `chunk_${chunk.fileId || 'document'}_${chunk.chunkIndex ?? byId.size}`;
      byId.set(id, {
        ...chunk,
        id,
        userId: chunk.userId || 'default',
        tokenCount: chunk.tokenCount || estimateTokens(chunk.text),
        tokenSet: Array.from(buildTokenSet(chunk.text)),
        createdAt: chunk.createdAt || new Date().toISOString()
      });
    }
    this.writeIndex([...byId.values()]);
  }

  search(query = '', options = {}) {
    const settings = typeof options === 'number' ? { limit: options } : options;
    const limit = Math.max(1, Number(settings.limit || settings.topK || 8));
    const candidateLimit = Math.max(limit, Number(settings.candidateLimit || 30));
    const minimumScore = Number(settings.minimumScore ?? 0.12);
    const queryTokens = tokenize(query);
    const querySet = new Set(queryTokens);
    const selectedFileIds = new Set((settings.fileIds || []).map(String));

    return this.readIndex()
      .filter((entry) => !settings.userId || String(entry.userId || 'default') === String(settings.userId))
      .filter((entry) => !selectedFileIds.size || selectedFileIds.has(String(entry.fileId)))
      .map((entry) => {
        const entryTokens = Array.isArray(entry.tokenSet) ? entry.tokenSet : tokenize(entry.text);
        const vectorScore = jaccardSimilarity(querySet, new Set(entryTokens));
        const exactKeywordScore = keywordScore(queryTokens, tokenize(entry.text));
        const freshness = recencyScore(entry.createdAt);
        const documentTrustScore = clamp01(entry.documentTrustScore ?? 0.8);
        const finalScore = (
          0.60 * vectorScore
          + 0.25 * exactKeywordScore
          + 0.10 * freshness
          + 0.05 * documentTrustScore
        );
        return {
          ...entry,
          vectorScore,
          keywordScore: exactKeywordScore,
          recencyScore: freshness,
          documentTrustScore,
          finalScore
        };
      })
      .filter((entry) => entry.finalScore >= minimumScore)
      .sort((a, b) => b.finalScore - a.finalScore)
      .slice(0, candidateLimit)
      .slice(0, limit)
      .map((entry) => ({
        id: entry.id,
        userId: entry.userId || 'default',
        fileId: entry.fileId,
        filename: entry.filename || path.basename(entry.source || 'document'),
        source: entry.source,
        sourceType: entry.sourceType || 'txt',
        pageNumber: entry.pageNumber,
        headingPath: entry.headingPath || [],
        sectionTitle: entry.sectionTitle,
        chunkIndex: entry.chunkIndex,
        text: entry.text,
        tokenCount: entry.tokenCount || estimateTokens(entry.text),
        vectorScore: entry.vectorScore,
        keywordScore: entry.keywordScore,
        recencyScore: entry.recencyScore,
        finalScore: entry.finalScore,
        score: entry.finalScore,
        summary: `[${entry.filename || path.basename(entry.source || 'document')}] ${entry.text.slice(0, 220).replace(/\s+/g, ' ')}`
      }));
  }
}

module.exports = {
  clamp01,
  jaccardSimilarity,
  keywordScore,
  recencyScore,
  VectorSearch
};
