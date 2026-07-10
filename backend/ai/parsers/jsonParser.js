'use strict';

/**
 * Parses raw JSON text from the LLM.
 * Deals with markdown formatting that some models accidentally include.
 * @param {string} text - The raw response from the LLM
 * @returns {Object|null} Parsed JSON object, or null if invalid
 */
function parseJsonFromText(text) {
  let safeText = String(text || '').trim();
  
  // Remove markdown code fences if present (e.g. ```json ... ```)
  if (safeText.startsWith('```')) {
    const firstNewline = safeText.indexOf('\n');
    const lastBacktick = safeText.lastIndexOf('```');
    if (firstNewline !== -1 && lastBacktick > firstNewline) {
      safeText = safeText.slice(firstNewline, lastBacktick).trim();
    }
  }

  try {
    return JSON.parse(safeText);
  } catch (err) {
    return null;
  }
}

module.exports = { parseJsonFromText };
