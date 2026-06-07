'use strict';

function extractCitedIds(answer = '') {
  return [...String(answer).matchAll(/\[source:\s*([a-zA-Z0-9_.:-]+)\s*\]/g)]
    .map((match) => match[1]);
}

function validateCitations(answer, allowedChunkIds = []) {
  const allowed = new Set(allowedChunkIds.map(String));
  const citedIds = extractCitedIds(answer);
  const invalid = [...new Set(citedIds.filter((id) => !allowed.has(id)))];

  return {
    citedIds,
    invalid,
    isValid: invalid.length === 0
  };
}

function removeInvalidCitations(answer, allowedChunkIds = []) {
  const allowed = new Set(allowedChunkIds.map(String));
  return String(answer).replace(
    /\[source:\s*([a-zA-Z0-9_.:-]+)\s*\]/g,
    (match, id) => (allowed.has(id) ? match : '')
  );
}

module.exports = {
  extractCitedIds,
  validateCitations,
  removeInvalidCitations
};
