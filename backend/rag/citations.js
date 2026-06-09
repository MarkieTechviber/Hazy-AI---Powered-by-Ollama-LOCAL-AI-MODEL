'use strict';

const CITATION_PATTERN = /\[\s*sources?\s*:\s*([^\]]+)\]/gi;

function normalizeAllowedIds(allowed = []) {
  return allowed.map((item) => {
    if (typeof item === 'string' || typeof item === 'number') return String(item);
    return String(item?.id || item?.chunkId || '').trim();
  }).filter(Boolean);
}

function parseCitationIds(raw = '') {
  return String(raw || '')
    .split(/[\s,;]+/g)
    .map((item) => item.trim())
    .filter(Boolean);
}

function extractCitedIds(answer = '') {
  const ids = [];
  for (const match of String(answer || '').matchAll(CITATION_PATTERN)) {
    ids.push(...parseCitationIds(match[1]));
  }
  return ids;
}

function validateCitations(answer, allowedChunkIds = []) {
  const allowedIds = normalizeAllowedIds(allowedChunkIds);
  const allowed = new Set(allowedIds);
  const citedIds = extractCitedIds(answer);
  const invalid = [...new Set(citedIds.filter((id) => !allowed.has(id)))];
  const unusedAllowed = allowedIds.filter((id) => !citedIds.includes(id));

  return {
    citedIds,
    invalid,
    unusedAllowed,
    allowedIds,
    isValid: invalid.length === 0
  };
}

function removeInvalidCitations(answer, allowedChunkIds = []) {
  const allowed = new Set(normalizeAllowedIds(allowedChunkIds));
  return String(answer || '').replace(CITATION_PATTERN, (match, rawIds) => {
    const validIds = parseCitationIds(rawIds).filter((id) => allowed.has(id));
    return validIds.length ? `[source: ${validIds.join(',')}]` : '';
  }).replace(/\s{2,}/g, ' ').trim();
}

function stripAllCitations(answer = '') {
  return String(answer || '').replace(CITATION_PATTERN, '').replace(/\s{2,}/g, ' ').trim();
}

function formatSourceForPrompt(chunk) {
  const id = String(chunk?.id || chunk?.chunkId || '').trim();
  const title = chunk?.sectionTitle || chunk?.filename || chunk?.source || 'document';
  const page = chunk?.pageNumber ? ` p.${chunk.pageNumber}` : '';
  const text = String(chunk?.text || '').replace(/\s+/g, ' ').trim();
  if (!id || !text) return '';
  return `[source: ${id}] ${title}${page}\n${text}`;
}

function buildCitationContext(chunks = [], options = {}) {
  const maxChars = Math.max(300, Number(options.maxCharsPerChunk || 1400));
  return chunks
    .map((chunk) => ({ ...chunk, text: String(chunk?.text || '').slice(0, maxChars) }))
    .map(formatSourceForPrompt)
    .filter(Boolean)
    .join('\n\n');
}

function citationInstruction(chunks = []) {
  const ids = normalizeAllowedIds(chunks);
  if (!ids.length) return 'No retrieved sources are available. Do not invent citations.';
  return [
    'Use only the retrieved sources below for factual claims from documents.',
    `Allowed citation ids: ${ids.join(', ')}`,
    'Cite document-backed claims with [source: chunk_id]. Do not cite ids that are not in the allowed list.'
  ].join('\n');
}

module.exports = {
  CITATION_PATTERN,
  extractCitedIds,
  validateCitations,
  removeInvalidCitations,
  stripAllCitations,
  formatSourceForPrompt,
  buildCitationContext,
  citationInstruction
};
