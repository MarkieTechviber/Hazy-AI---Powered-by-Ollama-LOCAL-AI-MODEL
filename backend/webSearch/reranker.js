'use strict';

const STOP_WORDS = new Set([
  'about', 'after', 'before', 'could', 'from', 'have', 'into', 'latest',
  'please', 'search', 'that', 'their', 'there', 'these', 'this', 'what',
  'when', 'where', 'which', 'with', 'would', 'your'
]);

function terms(value = '') {
  return new Set(
    String(value).toLowerCase().split(/\W+/)
      .filter((word) => word.length > 3 && !STOP_WORDS.has(word))
  );
}

function keywordOverlap(query, text) {
  const queryTerms = terms(query);
  const textTerms = terms(text);
  if (!queryTerms.size) return 0;
  let hits = 0;
  for (const word of queryTerms) if (textTerms.has(word)) hits += 1;
  return Math.min(100, (hits / queryTerms.size) * 100);
}

function scoreFreshness(publishedAt, freshnessRequired) {
  if (!publishedAt) return freshnessRequired ? 35 : 55;
  const timestamp = Date.parse(publishedAt);
  if (!Number.isFinite(timestamp)) return freshnessRequired ? 40 : 55;
  const days = (Date.now() - timestamp) / 86_400_000;
  if (days < 7) return 100;
  if (days < 30) return 90;
  if (days < 180) return 75;
  if (days < 365) return 60;
  return freshnessRequired ? 25 : 45;
}

function rerankChunks({ userMessage, chunks = [], decision = {} }) {
  return chunks.map((chunk) => {
    const semantic = keywordOverlap(userMessage, `${chunk.title} ${chunk.text}`);
    const source = Number(chunk.sourceQualityScore || 55);
    const freshness = scoreFreshness(chunk.publishedAt, decision.freshnessRequired);
    const keyword = keywordOverlap(userMessage, chunk.text);
    const citationValue = chunk.title && chunk.url ? 90 : 20;
    const score = semantic * 0.50
      + source * 0.20
      + freshness * 0.15
      + keyword * 0.10
      + citationValue * 0.05;
    return { ...chunk, score: Number(score.toFixed(2)) };
  }).sort((a, b) => b.score - a.score)
    .filter((chunk) => chunk.score >= 35);
}

module.exports = {
  rerankChunks,
  keywordOverlap,
  scoreFreshness,
  terms
};
