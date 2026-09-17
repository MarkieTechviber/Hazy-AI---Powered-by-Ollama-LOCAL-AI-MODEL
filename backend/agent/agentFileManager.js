'use strict';

const fs = require('fs');
const fsp = fs.promises;
const path = require('path');
const { assertSafePath, artifactScopeSegment } = require('../security/safePath');
const { ARTIFACTS_DIR } = require('../config/runtimePaths');

// Session-scoped map: { sanitizedConversationId -> Map(taskKey -> filename) }
const sessionMap = new Map();

const EXTENSIONS = {
  javascript: 'js',
  typescript: 'ts',
  python: 'py',
  html: 'html',
  css: 'css',
  json: 'json',
  markdown: 'md',
  bash: 'sh',
  sh: 'sh'
};

function toKebabCase(str) {
  return String(str || 'generated-code')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
    .slice(0, 50);
}

function getExtension(lang) {
  const l = String(lang || 'javascript').toLowerCase();
  return EXTENSIONS[l] || (/^[a-z0-9]{1,12}$/.test(l) ? l : 'txt');
}

// Single, consistent sanitizer used everywhere
const sanitizeConversationId = (conversationId, userId, projectId) => artifactScopeSegment({ conversationId, userId, projectId });

function getSessionMap(sanitizedId) {
  if (!sessionMap.has(sanitizedId)) {
    sessionMap.set(sanitizedId, new Map());
  }
  return sessionMap.get(sanitizedId);
}

// Guard that the resolved path stays inside the expected base directory
function assertInsideDir(baseDir, filePath) {
  const resolved = path.resolve(filePath);
  if (!resolved.startsWith(path.resolve(baseDir) + path.sep)) {
    throw new Error(`Path traversal detected: ${filePath}`);
  }
}

const assertNoSymlinkEscape = (_base, target) => assertSafePath(ARTIFACTS_DIR, target);

// In-flight promise map prevents race conditions on the same key
const inFlight = new Map();

async function writeOrUpdate({ conversationId, userId, projectId, taskContext, code, language }) {
  const safeChat = sanitizeConversationId(conversationId, userId, projectId);
  const key = String(taskContext || 'default-task').toLowerCase().trim();

  // Deduplicate concurrent writes to the same (safeChat, key) pair
  const lockKey = `${safeChat}::${key}`;
  while (inFlight.has(lockKey)) await inFlight.get(lockKey);

  let resolve;
  const lock = new Promise(r => { resolve = r; });
  inFlight.set(lockKey, lock);

  try {
    const artifactsRoot = require('../config/runtimePaths').ARTIFACTS_DIR;
    const baseDir = path.resolve(artifactsRoot, safeChat);
    await assertSafePath(ARTIFACTS_DIR, baseDir);
    await fsp.mkdir(baseDir, { recursive: true });

    const filesMap = getSessionMap(safeChat);
    let filename = filesMap.get(key);

    if (!filename) {
      const ext = getExtension(language);
      const baseName = toKebabCase(taskContext) || 'code';
      filename = `${baseName}.${ext}`;
      filesMap.set(key, filename);
    }

    const targetPath = path.resolve(baseDir, filename);
    assertInsideDir(baseDir, targetPath);
    await assertNoSymlinkEscape(baseDir, targetPath);

    await fsp.writeFile(targetPath, String(code || ''), 'utf8');

    return `cache/hazy-engine/artifacts/${safeChat}/${filename}`;
  } finally {
    inFlight.delete(lockKey);
    resolve();
  }
}

function clearSession(conversationId) {
  const safeChat = sanitizeConversationId(conversationId);
  sessionMap.delete(safeChat);
}

module.exports = { writeOrUpdate, clearSession };
