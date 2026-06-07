'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { chunkSections, cleanExtractedText } = require('./chunker');

const SOURCE_TYPES = new Set(['pdf', 'docx', 'txt', 'md', 'html', 'csv']);

function sourceTypeFromPath(filePath) {
  const extension = path.extname(filePath).slice(1).toLowerCase();
  return SOURCE_TYPES.has(extension) ? extension : 'txt';
}

function detectSections(text) {
  const lines = cleanExtractedText(text).split('\n');
  const sections = [];
  let headingPath = [];
  let buffer = [];

  const flush = () => {
    const sectionText = buffer.join('\n').trim();
    if (sectionText) sections.push({ headingPath: [...headingPath], text: sectionText });
    buffer = [];
  };

  for (const line of lines) {
    const markdownHeading = line.match(/^(#{1,6})\s+(.+)$/);
    if (markdownHeading) {
      flush();
      const depth = markdownHeading[1].length;
      headingPath = [...headingPath.slice(0, depth - 1), markdownHeading[2].trim()];
      continue;
    }
    buffer.push(line);
  }
  flush();

  return sections.length ? sections : [{ headingPath: [], text: cleanExtractedText(text) }];
}

function ingestDocument(filePath, options = {}) {
  const absolutePath = path.resolve(filePath);
  const text = fs.readFileSync(absolutePath, 'utf8');
  const fileId = options.fileId || crypto.createHash('sha256')
    .update(absolutePath)
    .digest('hex')
    .slice(0, 16);
  const sourceType = options.sourceType || sourceTypeFromPath(filePath);
  const chunkInputs = chunkSections({
    userId: options.userId || 'default',
    fileId,
    sourceType,
    sections: detectSections(text)
  }, options.chunking);

  const chunks = chunkInputs.map((chunk) => ({
    id: `chunk_${fileId}_${chunk.chunkIndex}`,
    ...chunk,
    filename: path.basename(filePath),
    source: absolutePath,
    createdAt: new Date().toISOString()
  }));

  return {
    fileId,
    filename: path.basename(filePath),
    source: absolutePath,
    sourceType,
    totalChunks: chunks.length,
    chunks
  };
}

module.exports = {
  sourceTypeFromPath,
  detectSections,
  ingestDocument
};
