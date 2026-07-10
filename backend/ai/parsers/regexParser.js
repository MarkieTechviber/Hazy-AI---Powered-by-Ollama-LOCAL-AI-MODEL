'use strict';

const FILE_BLOCK_PATTERN = /===FILE:\s*([^\n=]+?)\s*===\s*([\s\S]*?)(?=\n===FILE:|\n===SETUP===|\n===|$)/gi;

function normalizeLanguage(value = '') {
  const raw = String(value || '').toLowerCase().trim();
  const aliases = {
    js: 'javascript', jsx: 'javascript', mjs: 'javascript', cjs: 'javascript',
    ts: 'typescript', tsx: 'typescript', py: 'python', rb: 'ruby',
    sh: 'bash', shell: 'bash', ps1: 'powershell', cs: 'csharp',
    'c#': 'csharp', cpp: 'cpp', cxx: 'cpp', cc: 'cpp'
  };
  return aliases[raw] || raw;
}

function inferLanguageFromFilename(filename = '') {
  const ext = String(filename).split('.').pop()?.toLowerCase() || '';
  return normalizeLanguage(ext);
}

/**
 * Parses raw text from the LLM looking for ===FILE: ...=== delimiters.
 * @param {string} text - The raw response from the LLM
 * @returns {Array<{filename: string, code: string, language: string}>}
 */
function parseFilesFromText(text) {
  const files = [];
  const safeText = String(text || '');
  for (const match of safeText.matchAll(FILE_BLOCK_PATTERN)) {
    const filename = match[1].trim();
    files.push({
      filename,
      language: inferLanguageFromFilename(filename),
      code: String(match[2] || '').trim()
    });
  }
  return files;
}

module.exports = { parseFilesFromText };
