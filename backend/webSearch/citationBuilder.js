'use strict';

function buildCitations(chunks = []) {
  const seen = new Map();
  chunks.forEach((chunk, index) => {
    if (!chunk.url || seen.has(chunk.url)) return;
    seen.set(chunk.url, {
      sourceId: chunk.id,
      sourceNumber: index + 1,
      url: chunk.url,
      title: chunk.title || chunk.sourceName || 'Web source',
      quote: chunk.text.slice(0, 280),
      usedFor: 'web_search_answer'
    });
  });
  return Array.from(seen.values());
}

function estimateConfidence({ selectedChunks = [], citations = [], freshnessRequired = false }) {
  const average = selectedChunks.reduce((sum, chunk) => sum + (chunk.score || 0), 0)
    / Math.max(1, selectedChunks.length);
  const hosts = new Set(citations.map((citation) => {
    try { return new URL(citation.url).hostname; } catch { return citation.url; }
  }));
  if (hosts.size >= 2 && average >= 70) return 'high';
  if (citations.length >= 1 && average >= (freshnessRequired ? 55 : 45)) return 'medium';
  return 'low';
}

module.exports = { buildCitations, estimateConfidence };
