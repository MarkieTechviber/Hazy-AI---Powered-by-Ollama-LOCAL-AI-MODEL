'use strict';

const { isOfficialSource, getHostname } = require('./sourceQuality');

const STOP_WORDS = new Set([
  'about', 'after', 'before', 'could', 'from', 'have', 'into', 'latest',
  'please', 'search', 'that', 'their', 'there', 'these', 'this', 'what',
  'when', 'where', 'which', 'with', 'would', 'your', 'source', 'sources'
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

function hasPossibleConflict(text = '') {
  return /\b(however|contradict|conflict|dispute|different from|not true|false|debunk|correction|retracted)\b/i.test(text);
}

function rerankChunks({ userMessage, chunks = [], decision = {} }) {
  const domainCounts = new Map();
  const ranked = chunks.map((chunk) => {
    const combinedText = `${chunk.title || ''} ${chunk.description || ''} ${chunk.text || ''}`;
    const semantic = keywordOverlap(userMessage, combinedText);
    const source = Number(chunk.sourceQualityScore || 55);
    const freshness = scoreFreshness(chunk.publishedAt, decision.freshnessRequired);
    const keyword = keywordOverlap(userMessage, chunk.text);
    const official = isOfficialSource(chunk, decision) ? 100 : 35;
    const citationValue = chunk.title && chunk.url ? 90 : 20;
    const promptInjectionPenalty = chunk.untrustedInstructions ? 12 : 0;
    const score = semantic * 0.42
      + source * 0.22
      + freshness * 0.14
      + official * 0.10
      + keyword * 0.08
      + citationValue * 0.04
      - promptInjectionPenalty;
    return {
      ...chunk,
      officialSource: official >= 100,
      conflictSignal: hasPossibleConflict(chunk.text),
      score: Number(Math.max(0, score).toFixed(2))
    };
  }).sort((a, b) => b.score - a.score)
    .filter((chunk) => chunk.score >= 32);

  return ranked.map((chunk) => {
    const domain = chunk.domain || getHostname(chunk.url) || 'unknown';
    const seen = domainCounts.get(domain) || 0;
    domainCounts.set(domain, seen + 1);
    const diversityPenalty = seen >= 2 && decision.mode !== 'domain_limited' ? Math.min(18, (seen - 1) * 8) : 0;
    return {
      ...chunk,
      diversityPenalty,
      score: Number(Math.max(0, chunk.score - diversityPenalty).toFixed(2))
    };
  }).sort((a, b) => b.score - a.score);
}

module.exports = {
  rerankChunks,
  keywordOverlap,
  scoreFreshness,
  terms,
  hasPossibleConflict
};
