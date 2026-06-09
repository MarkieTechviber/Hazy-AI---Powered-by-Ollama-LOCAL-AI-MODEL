'use strict';

const crypto = require('crypto');

let estimateTokens;
try {
  ({ estimateTokens } = require('../ai/context/contextWindowManager'));
} catch {
  estimateTokens = (value = '') => Math.max(1, Math.ceil(String(value || '').split(/\s+/).filter(Boolean).length * 1.3));
}

const DEFAULTS = Object.freeze({
  targetTokens: 750,
  maxTokens: 1200,
  overlapTokens: 120,
  minChunkTokens: 35
});

function normalizeSettings(options = {}) {
  const settings = { ...DEFAULTS, ...options };
  settings.maxTokens = Math.max(64, Number(settings.maxTokens || DEFAULTS.maxTokens));
  settings.targetTokens = Math.max(32, Math.min(Number(settings.targetTokens || DEFAULTS.targetTokens), settings.maxTokens));
  settings.overlapTokens = Math.max(0, Math.min(Number(settings.overlapTokens || DEFAULTS.overlapTokens), Math.floor(settings.maxTokens * 0.25)));
  settings.minChunkTokens = Math.max(1, Math.min(Number(settings.minChunkTokens || DEFAULTS.minChunkTokens), settings.targetTokens));
  return settings;
}

function stableHash(value = '') {
  return crypto.createHash('sha256').update(String(value || '')).digest('hex').slice(0, 16);
}

function cleanExtractedText(text = '') {
  return String(text || '')
    .replace(/\r\n/g, '\n')
    .replace(/[\t ]+/g, ' ')
    .replace(/\n[\t ]+/g, '\n')
    .replace(/Page\s+\d+\s+(?:of|\/)?\s*\d*/gi, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function splitIntoParagraphs(text = '') {
  return cleanExtractedText(text)
    .split(/\n\s*\n/g)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);
}

function splitIntoSentences(text = '') {
  const normalized = String(text || '').replace(/\s+/g, ' ').trim();
  if (!normalized) return [];
  const sentences = normalized.match(/[^.!?;]+[.!?;]+(?:\s+|$)|[^.!?;]+$/g) || [normalized];
  return sentences.map((sentence) => sentence.trim()).filter(Boolean);
}

function takeTokenOverlap(text, overlapTokens) {
  if (overlapTokens <= 0) return '';
  const words = String(text || '').split(/\s+/).filter(Boolean);
  const selected = [];
  for (let index = words.length - 1; index >= 0; index -= 1) {
    const candidate = [words[index], ...selected].join(' ');
    if (selected.length && estimateTokens(candidate) > overlapTokens) break;
    selected.unshift(words[index]);
  }
  return selected.join(' ');
}

function splitWordsByTokenLimit(text, maxTokens, overlapTokens) {
  const words = String(text || '').split(/\s+/).filter(Boolean);
  const pieces = [];
  let buffer = [];
  for (const word of words) {
    const candidate = [...buffer, word].join(' ');
    if (buffer.length && estimateTokens(candidate) > maxTokens) {
      const piece = buffer.join(' ');
      pieces.push(piece);
      buffer = takeTokenOverlap(piece, overlapTokens).split(/\s+/).filter(Boolean);
    }
    buffer.push(word);
  }
  if (buffer.length) pieces.push(buffer.join(' '));
  return pieces;
}

function splitOversizedParagraph(paragraph, maxTokens, overlapTokens) {
  const sentences = splitIntoSentences(paragraph);
  const pieces = [];
  let buffer = '';
  const flush = () => {
    const cleaned = buffer.trim();
    if (cleaned) pieces.push(cleaned);
    buffer = '';
  };

  for (const sentence of sentences) {
    if (estimateTokens(sentence) > maxTokens) {
      flush();
      pieces.push(...splitWordsByTokenLimit(sentence, maxTokens, overlapTokens));
      continue;
    }
    const candidate = buffer ? `${buffer} ${sentence}` : sentence;
    if (buffer && estimateTokens(candidate) > maxTokens) {
      const overlap = takeTokenOverlap(buffer, overlapTokens);
      flush();
      buffer = overlap ? `${overlap} ${sentence}` : sentence;
    } else {
      buffer = candidate;
    }
  }
  flush();
  return pieces;
}

function chunkSections(input, options = {}) {
  const settings = normalizeSettings(options);
  const chunks = [];
  const seenHashes = new Set();
  let chunkIndex = 0;

  const pushChunk = (section, text, flags = {}) => {
    const cleaned = String(text || '').trim();
    if (!cleaned) return false;
    const tokenCount = estimateTokens(cleaned);
    if (!flags.force && tokenCount < settings.minChunkTokens) return false;
    const contentHash = stableHash(cleaned);
    if (seenHashes.has(contentHash)) return false;
    seenHashes.add(contentHash);
    const index = chunkIndex++;
    chunks.push({
      id: `chunk_${input.fileId || 'document'}_${index}`,
      chunkId: `chunk_${input.fileId || 'document'}_${index}`,
      userId: input.userId || 'default',
      fileId: input.fileId,
      chunkIndex: index,
      sectionIndex: section.sectionIndex ?? 0,
      text: cleaned,
      contentHash,
      tokenCount,
      pageNumber: section.pageNumber,
      headingPath: section.headingPath || [],
      sectionTitle: section.sectionTitle || (section.headingPath || []).at(-1) || undefined,
      sourceType: input.sourceType || 'txt'
    });
    return true;
  };

  for (const [sectionIndex, rawSection] of (input.sections || []).entries()) {
    const section = { ...rawSection, sectionIndex };
    const paragraphs = splitIntoParagraphs(section.text)
      .flatMap((paragraph) => (
        estimateTokens(paragraph) > settings.maxTokens
          ? splitOversizedParagraph(paragraph, Math.max(1, settings.maxTokens - settings.overlapTokens), settings.overlapTokens)
          : [paragraph]
      ));

    let buffer = '';
    let bufferIsOnlyOverlap = false;
    let pushedForSection = false;

    for (const paragraph of paragraphs) {
      const candidate = buffer ? `${buffer}\n\n${paragraph}` : paragraph;
      if (buffer && estimateTokens(candidate) > settings.maxTokens) {
        pushedForSection = pushChunk(section, buffer, { force: !pushedForSection }) || pushedForSection;
        const overlap = takeTokenOverlap(buffer, settings.overlapTokens);
        buffer = overlap ? `${overlap}\n\n${paragraph}` : paragraph;
        bufferIsOnlyOverlap = false;
      } else {
        buffer = candidate;
        bufferIsOnlyOverlap = false;
      }

      if (estimateTokens(buffer) >= settings.targetTokens) {
        pushedForSection = pushChunk(section, buffer, { force: !pushedForSection }) || pushedForSection;
        buffer = takeTokenOverlap(buffer, settings.overlapTokens);
        bufferIsOnlyOverlap = Boolean(buffer);
      }
    }

    if (buffer && !bufferIsOnlyOverlap) {
      pushChunk(section, buffer, { force: !pushedForSection });
    }
  }

  return chunks;
}

function chunkText(text = '', options = {}) {
  const legacyMaxLength = Number(options.maxLength);
  const legacyOverlap = Number(options.overlap);
  const normalizedOptions = normalizeSettings({
    targetTokens: options.targetTokens || (Number.isFinite(legacyMaxLength) ? Math.max(1, Math.floor(legacyMaxLength / 4)) : DEFAULTS.targetTokens),
    maxTokens: options.maxTokens || (Number.isFinite(legacyMaxLength) ? Math.max(1, Math.floor(legacyMaxLength / 4)) : DEFAULTS.maxTokens),
    overlapTokens: options.overlapTokens || (Number.isFinite(legacyOverlap) ? Math.max(0, Math.floor(legacyOverlap / 4)) : DEFAULTS.overlapTokens),
    minChunkTokens: options.minChunkTokens || DEFAULTS.minChunkTokens
  });

  return chunkSections({
    userId: options.userId || 'default',
    fileId: options.fileId || 'document',
    sourceType: options.sourceType || 'txt',
    sections: [{
      headingPath: options.headingPath || [],
      pageNumber: options.pageNumber,
      text
    }]
  }, normalizedOptions).map((chunk) => chunk.text);
}

module.exports = {
  DEFAULTS,
  normalizeSettings,
  stableHash,
  cleanExtractedText,
  splitIntoParagraphs,
  splitIntoSentences,
  takeTokenOverlap,
  splitOversizedParagraph,
  chunkSections,
  chunkText
};
