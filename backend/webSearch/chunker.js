'use strict';

const crypto = require('crypto');
const { estimateTokens } = require('../ai/context/contextWindowManager');

function lastApproxTokens(text, tokens) {
  const words = String(text).split(/\s+/);
  return words.slice(Math.max(0, words.length - Math.ceil(tokens * 0.75))).join(' ');
}

function pageHash(url) {
  return crypto.createHash('sha256').update(String(url)).digest('hex').slice(0, 12);
}

function chunkPage(page, options = {}) {
  const maxTokens = options.maxTokensPerChunk || 900;
  const overlapTokens = options.overlapTokens || 120;
  const sentences = String(page.text || '').split(/(?<=[.!?])\s+|\n+/).filter(Boolean);
  const chunks = [];
  let buffer = [];
  let tokens = 0;

  const flush = () => {
    if (!buffer.length) return;
    const text = buffer.join(' ').trim();
    const chunkIndex = chunks.length;
    chunks.push({
      id: `${pageHash(page.finalUrl || page.url)}_${chunkIndex}`,
      url: page.finalUrl || page.url,
      title: page.title,
      sourceName: page.sourceName,
      text,
      publishedAt: page.publishedAt,
      fetchedAt: page.fetchedAt,
      tokenCount: estimateTokens(text),
      chunkIndex
    });
    const overlap = lastApproxTokens(text, overlapTokens);
    buffer = overlap ? [overlap] : [];
    tokens = estimateTokens(overlap);
  };

  for (const sentence of sentences) {
    const sentenceTokens = estimateTokens(sentence);
    if (tokens + sentenceTokens > maxTokens && buffer.length) flush();
    buffer.push(sentence);
    tokens += sentenceTokens;
  }
  flush();
  return chunks.filter((chunk) => chunk.text.length >= 80);
}

function chunksFromSearchSnippets(results = []) {
  const now = new Date().toISOString();
  return results.filter((result) => result.snippet).map((result, index) => ({
    id: `${pageHash(result.url)}_snippet`,
    url: result.url,
    title: result.title,
    sourceName: result.sourceName,
    text: result.snippet,
    publishedAt: result.publishedAt,
    fetchedAt: now,
    tokenCount: estimateTokens(result.snippet),
    chunkIndex: index,
    snippetFallback: true,
    sourceQualityScore: result.sourceQualityScore
  }));
}

module.exports = {
  chunkPage,
  chunksFromSearchSnippets,
  lastApproxTokens,
  pageHash
};
