'use strict';

function citationDomain(url = '') {
  try { return new URL(url).hostname.replace(/^www\./, '').toLowerCase(); } catch { return ''; }
}

function buildCitations(chunks = []) {
  const seen = new Map();
  chunks.forEach((chunk) => {
    if (!chunk.url || seen.has(chunk.url)) return;
    const sourceNumber = chunk.sourceNumber || seen.size + 1;
    seen.set(chunk.url, {
      sourceId: chunk.sourceId || chunk.id,
      sourceNumber,
      url: chunk.url,
      domain: chunk.domain || citationDomain(chunk.url),
      title: chunk.title || chunk.sourceName || 'Web source',
      publishedAt: chunk.publishedAt || null,
      fetchedAt: chunk.fetchedAt || null,
      sourceQualityScore: chunk.sourceQualityScore || 0,
      relevanceScore: chunk.score || 0,
      officialSource: Boolean(chunk.officialSource),
      quote: String(chunk.text || '').slice(0, 360),
      usedFor: 'web_search_answer',
      warning: chunk.untrustedInstructions ? 'Prompt-injection-like text was detected; treated as untrusted evidence.' : null
    });
  });
  return Array.from(seen.values()).sort((a, b) => a.sourceNumber - b.sourceNumber);
}

/**
 * FIX Issue 3: Filter citations to only those the model actually referenced in its response.
 * Parses [SOURCE N] tags from the generated text and removes citation objects for
 * sources the model never mentioned — preventing the "cited sources don't match answer" bug.
 *
 * @param {Array}  citations    - Full citation list from buildCitations()
 * @param {string} responseText - The model's final response text
 * @returns {{ cited: Array, uncited: Array, hallucinated: number[] }}
 */
function filterCitationsByResponse(citations = [], responseText = '') {
  const text = String(responseText || '');
  // Match [SOURCE 1], [source 2], SOURCE 1, etc.
  const citedNums = new Set(
    [...text.matchAll(/\[?SOURCE\s+(\d+)\]?/gi)].map((m) => parseInt(m[1], 10))
  );

  const cited = citations.filter((c) => citedNums.has(c.sourceNumber));
  const uncited = citations.filter((c) => !citedNums.has(c.sourceNumber));

  // Detect hallucinated citations: model cited a number with no matching source
  const availableNums = new Set(citations.map((c) => c.sourceNumber));
  const hallucinated = [...citedNums].filter((n) => !availableNums.has(n));

  return { cited, uncited, hallucinated };
}

function estimateConfidence({ selectedChunks = [], citations = [], freshnessRequired = false, suspiciousSources = [] }) {
  const average = selectedChunks.reduce((sum, chunk) => sum + (chunk.score || 0), 0) / Math.max(1, selectedChunks.length);
  const qualityAverage = selectedChunks.reduce((sum, chunk) => sum + (chunk.sourceQualityScore || 0), 0) / Math.max(1, selectedChunks.length);
  const hosts = new Set(citations.map((citation) => citation.domain || citationDomain(citation.url)).filter(Boolean));
  const officialCount = citations.filter((citation) => citation.officialSource).length;
  const hasSuspiciousSelected = selectedChunks.some((chunk) => chunk.untrustedInstructions)
    || (suspiciousSources || []).length > 0;
  if (!citations.length) return 'low';
  if (hasSuspiciousSelected && citations.length < 3) return 'low';
  if (hosts.size >= 3 && average >= 68 && qualityAverage >= 65) return 'high';
  if (officialCount >= 1 && average >= 62 && qualityAverage >= 62) return freshnessRequired && citations.length < 2 ? 'medium' : 'high';
  if (citations.length >= 1 && average >= (freshnessRequired ? 55 : 45)) return 'medium';
  return 'low';
}

function buildSourcePanelSummary({ decision = {}, queries = [], citations = [], rejectedResults = [], fetchErrors = [], warnings = [] } = {}) {
  return {
    mode: decision.mode || 'none',
    reason: decision.reason || '',
    queries: queries.map((query) => query.query || query),
    sourcesRead: citations.length,
    sourcesRejected: rejectedResults.length,
    fetchFailures: fetchErrors.length,
    warnings
  };
}

module.exports = { buildCitations, filterCitationsByResponse, estimateConfidence, buildSourcePanelSummary, citationDomain };
