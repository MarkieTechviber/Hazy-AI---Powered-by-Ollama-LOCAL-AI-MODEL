'use strict';

const { estimateTokens } = require('../ai/context/contextWindowManager');

const DEFAULTS = Object.freeze({
  targetTokens: 750,
  maxTokens: 1200,
  overlapTokens: 120
});

function cleanExtractedText(text = '') {
  return String(text)
    .replace(/\r\n/g, '\n')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/Page \d+ of \d+/gi, '')
    .trim();
}

function splitIntoParagraphs(text = '') {
  return cleanExtractedText(text)
    .split(/\n\s*\n/g)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);
}

function takeTokenOverlap(text, overlapTokens) {
  if (overlapTokens <= 0) return '';
  const words = String(text).split(/\s+/).filter(Boolean);
  const selected = [];
  for (let index = words.length - 1; index >= 0; index -= 1) {
    const candidate = [words[index], ...selected].join(' ');
    if (selected.length && estimateTokens(candidate) > overlapTokens) break;
    selected.unshift(words[index]);
  }
  return selected.join(' ');
}

function splitOversizedParagraph(paragraph, maxTokens, overlapTokens) {
  const words = String(paragraph).split(/\s+/).filter(Boolean);
  const pieces = [];
  let buffer = [];

  for (const word of words) {
    const candidate = [...buffer, word].join(' ');
    if (buffer.length && estimateTokens(candidate) > maxTokens) {
      const text = buffer.join(' ');
      pieces.push(text);
      buffer = takeTokenOverlap(text, overlapTokens).split(/\s+/).filter(Boolean);
    }
    buffer.push(word);
  }

  if (buffer.length) pieces.push(buffer.join(' '));
  return pieces;
}

function chunkSections(input, options = {}) {
  const settings = { ...DEFAULTS, ...options };
  const chunks = [];
  let chunkIndex = 0;

  const pushChunk = (section, text) => {
    const cleaned = String(text || '').trim();
    if (!cleaned) return;
    chunks.push({
      userId: input.userId || 'default',
      fileId: input.fileId,
      chunkIndex: chunkIndex++,
      text: cleaned,
      tokenCount: estimateTokens(cleaned),
      pageNumber: section.pageNumber,
      headingPath: section.headingPath || [],
      sectionTitle: section.sectionTitle
        || (section.headingPath || []).at(-1)
        || undefined,
      sourceType: input.sourceType || 'txt'
    });
  };

  for (const section of input.sections || []) {
    const paragraphs = splitIntoParagraphs(section.text)
      .flatMap((paragraph) => (
        estimateTokens(paragraph) > settings.maxTokens
          ? splitOversizedParagraph(
              paragraph,
              Math.max(1, settings.maxTokens - settings.overlapTokens),
              0
            )
          : [paragraph]
      ));
    let buffer = '';

    for (const paragraph of paragraphs) {
      const candidate = buffer ? `${buffer}\n\n${paragraph}` : paragraph;
      if (buffer && estimateTokens(candidate) > settings.maxTokens) {
        pushChunk(section, buffer);
        const overlap = takeTokenOverlap(buffer, settings.overlapTokens);
        buffer = overlap ? `${overlap}\n\n${paragraph}` : paragraph;
      } else {
        buffer = candidate;
      }

      if (estimateTokens(buffer) >= settings.targetTokens) {
        pushChunk(section, buffer);
        buffer = takeTokenOverlap(buffer, settings.overlapTokens);
      }
    }

    pushChunk(section, buffer);
  }

  return chunks;
}

function chunkText(text = '', options = {}) {
  const legacyMaxLength = Number(options.maxLength);
  const legacyOverlap = Number(options.overlap);
  const normalizedOptions = {
    targetTokens: options.targetTokens
      || (Number.isFinite(legacyMaxLength) ? Math.max(1, Math.floor(legacyMaxLength / 4)) : DEFAULTS.targetTokens),
    maxTokens: options.maxTokens
      || (Number.isFinite(legacyMaxLength) ? Math.max(1, Math.floor(legacyMaxLength / 4)) : DEFAULTS.maxTokens),
    overlapTokens: options.overlapTokens
      || (Number.isFinite(legacyOverlap) ? Math.max(0, Math.floor(legacyOverlap / 4)) : DEFAULTS.overlapTokens)
  };

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
  cleanExtractedText,
  splitIntoParagraphs,
  takeTokenOverlap,
  chunkSections,
  chunkText
};
