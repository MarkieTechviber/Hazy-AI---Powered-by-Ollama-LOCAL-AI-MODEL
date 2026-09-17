'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');

function contained(root, target) {
  const relative = path.relative(path.resolve(root), path.resolve(target));
  return relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
}

// Check every existing component before mkdir/read/write. Reject junctions as
// well as symlinks, including the supplied root. Local same-account processes
// can still race filesystem operations: this is not an OS sandbox.
async function assertSafePath(root, target) {
  root = path.resolve(root);
  target = path.resolve(target);
  if (!contained(root, target)) throw new Error('Path escapes the workspace.');
  const parsed = path.parse(target);
  let current = parsed.root;
  for (const part of target.slice(parsed.root.length).split(path.sep).filter(Boolean)) {
    current = path.join(current, part);
    try {
      const stat = await fs.lstat(current);
      if (stat.isSymbolicLink()) throw new Error('Symbolic links and junctions are not allowed.');
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
  }
  return target;
}

function safeSegment(value = 'default') {
  const input = String(value || 'default');
  if (input === '.' || input === '..') throw new Error('Invalid workspace identifier.');
  const safe = input.replace(/[^a-zA-Z0-9_.-]/g, '_').slice(0, 64);
  if (!safe || /[. ]$/.test(safe) || /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(safe)) {
    throw new Error('Invalid workspace identifier.');
  }
  // Avoid collisions after sanitizing/truncating while preserving ordinary IDs.
  return safe === input ? safe : `${safe.slice(0, 48)}-${require('node:crypto').createHash('sha256').update(input).digest('hex').slice(0, 12)}`;
}

function artifactScopeSegment(ctx = {}) {
  if (!ctx.userId && !ctx.projectId) return safeSegment(ctx.chatId || ctx.conversationId || 'default');
  return safeSegment(JSON.stringify([
    String(ctx.userId || 'local-user'),
    String(ctx.projectId || ''),
    String(ctx.chatId || ctx.conversationId || 'default')
  ]));
}

module.exports = { contained, assertSafePath, safeSegment, artifactScopeSegment };
