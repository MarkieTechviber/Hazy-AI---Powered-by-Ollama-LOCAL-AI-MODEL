'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { chunkSections, cleanExtractedText } = require('./chunker');

const SOURCE_TYPES = new Set(['pdf', 'docx', 'txt', 'md', 'html', 'csv', 'json']);

function sourceTypeFromPath(filePath) {
  const extension = path.extname(filePath).slice(1).toLowerCase();
  return SOURCE_TYPES.has(extension) ? extension : 'txt';
}

function hashBuffer(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

function stripHtml(html = '') {
  return String(html || '')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|section|article|li|h[1-6])>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/g, "'");
}

function csvToText(csv = '') {
  return String(csv || '')
    .split(/\r?\n/g)
    .map((line) => line.split(',').map((cell) => cell.trim().replace(/^"|"$/g, '')).filter(Boolean).join(' | '))
    .filter(Boolean)
    .join('\n');
}

function jsonToText(raw = '') {
  try {
    const parsed = JSON.parse(raw);
    return JSON.stringify(parsed, null, 2);
  } catch {
    return raw;
  }
}

function readDocumentText(filePath, options = {}) {
  if (typeof options.text === 'string') return options.text;
  if (typeof options.extractedText === 'string') return options.extractedText;

  const sourceType = options.sourceType || sourceTypeFromPath(filePath);
  if (sourceType === 'pdf' || sourceType === 'docx') {
    throw new Error(`${sourceType.toUpperCase()} ingestion needs extracted text. Pass { extractedText } from a PDF/DOCX parser before chunking.`);
  }

  const raw = fs.readFileSync(path.resolve(filePath), 'utf8');
  if (sourceType === 'html') return stripHtml(raw);
  if (sourceType === 'csv') return csvToText(raw);
  if (sourceType === 'json') return jsonToText(raw);
  return raw;
}

function detectSections(text) {
  const lines = cleanExtractedText(text).split('\n');
  const sections = [];
  let headingPath = [];
  let buffer = [];

  const flush = () => {
    const sectionText = buffer.join('\n').trim();
    if (sectionText) sections.push({ headingPath: [...headingPath], sectionTitle: headingPath.at(-1), text: sectionText });
    buffer = [];
  };

  for (const rawLine of lines) {
    const line = rawLine.trim();
    const markdownHeading = line.match(/^(#{1,6})\s+(.+)$/);
    const numberedHeading = line.match(/^(\d+(?:\.\d+){0,5})\s+([A-Z][\w\s,:()/-]{3,100})$/);
    const loudHeading = line.length >= 4 && line.length <= 90 && /^[A-Z0-9\s,:()/-]+$/.test(line) && /[A-Z]/.test(line);

    if (markdownHeading || numberedHeading || loudHeading) {
      flush();
      const depth = markdownHeading ? markdownHeading[1].length : numberedHeading ? numberedHeading[1].split('.').length : 1;
      const title = markdownHeading ? markdownHeading[2].trim() : numberedHeading ? numberedHeading[2].trim() : line;
      headingPath = [...headingPath.slice(0, depth - 1), title];
      continue;
    }
    buffer.push(rawLine);
  }
  flush();

  return sections.length ? sections : [{ headingPath: [], text: cleanExtractedText(text) }];
}

function ingestDocument(filePath, options = {}) {
  const absolutePath = path.resolve(filePath);
  const sourceType = options.sourceType || sourceTypeFromPath(filePath);
  const inlineText = typeof options.text === 'string' ? options.text : options.extractedText;
  const fileBuffer = typeof inlineText === 'string' ? Buffer.from(inlineText) : fs.readFileSync(absolutePath);
  const fileHash = hashBuffer(fileBuffer);
  const fileId = options.fileId || fileHash.slice(0, 16);
  const rawText = readDocumentText(absolutePath, { ...options, sourceType });
  const cleanedText = cleanExtractedText(rawText);
  if (!cleanedText) throw new Error('Document contains no extractable text.');

  const sections = Array.isArray(options.sections) && options.sections.length
    ? options.sections
    : detectSections(cleanedText);

  const chunkInputs = chunkSections({
    userId: options.userId || 'default',
    projectId: options.projectId || '',
    fileId,
    sourceType,
    sections
  }, options.chunking);

  const chunks = chunkInputs.map((chunk) => ({
    ...chunk,
    projectId: options.projectId || chunk.projectId || '',
    id: chunk.id || `chunk_${fileId}_${chunk.chunkIndex}`,
    filename: options.filename || path.basename(filePath),
    source: absolutePath,
    fileHash,
    documentTrustScore: options.documentTrustScore,
    createdAt: new Date().toISOString()
  }));

  return {
    fileId,
    fileHash,
    filename: options.filename || path.basename(filePath),
    source: absolutePath,
    sourceType,
    totalChunks: chunks.length,
    chunks
  };
}

async function ingestDocumentAsync(filePath, options = {}) {
  const result = ingestDocument(filePath, options);
  const embeddingService = options.embeddingService;
  if (embeddingService && typeof embeddingService.embedMany === 'function') {
    const embeddings = await embeddingService.embedMany(result.chunks.map((chunk) => chunk.text));
    result.chunks = result.chunks.map((chunk, index) => ({ ...chunk, embedding: embeddings[index] }));
  }
  return result;
}

module.exports = {
  SOURCE_TYPES,
  sourceTypeFromPath,
  stripHtml,
  csvToText,
  jsonToText,
  readDocumentText,
  detectSections,
  ingestDocument,
  ingestDocumentAsync
};
