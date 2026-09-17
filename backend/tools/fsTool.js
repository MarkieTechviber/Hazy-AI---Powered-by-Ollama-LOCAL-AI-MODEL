'use strict';
const fs = require('node:fs/promises');
const path = require('node:path');
const { ROOT_DIR, ARTIFACTS_DIR } = require('../config/runtimePaths');
const { assertSafePath, contained, artifactScopeSegment } = require('../security/safePath');

function sensitive(relative) {
  const parts = relative.replace(/\\/g, '/').toLowerCase().split('/');
  return parts.some(part => ['.git', 'node_modules', 'config', 'cache', 'backup', 'prompt dump', 'docx'].includes(part)
    || /^\.env(?:\.|$)/.test(part) || part === '.hazy-master-key'
    || /\.(?:key|pem|p12|pfx|db|sqlite|sqlite3|jsonl|wal|shm)(?:-|$)/.test(part));
}
function register(registry) {
  registry.register({
    name: 'fs.read_file',
    description: 'Read bounded source/document text from the workspace or this chat artifacts. Secrets, configuration, runtime state and symbolic links are blocked.',
    risk: 'read', toolset: 'safe_default', requiresConfirmation: false,
    allowedRoles: ['admin', 'cashier', 'user'],
    schema: { type: 'object', properties: {
      path: { type: 'string', minLength: 1, maxLength: 2000 },
      maxBytes: { type: 'integer', minimum: 1, maximum: 1048576 }
    }, required: ['path'], additionalProperties: false },
    execute: async ({ path: userPath, maxBytes = 65536 }, ctx = {}) => {
      let handle;
      try {
        const input = String(userPath || '').replace(/\\/g, '/');
        let base = path.resolve(ctx.services?.workspaceDir || ROOT_DIR);
        let relative = input;
        const prefix = 'cache/hazy-engine/artifacts/';
        if (input.startsWith(prefix)) {
          const scopedPrefix = `${prefix}${artifactScopeSegment(ctx)}/`;
          if (!input.startsWith(scopedPrefix)) return { ok: false, error: { code: 'SENSITIVE_PATH_DENIED', message: 'Artifact belongs to another chat.' } };
          base = path.join(ARTIFACTS_DIR, artifactScopeSegment(ctx));
          relative = input.slice(scopedPrefix.length);
        } else if (sensitive(path.relative(base, path.resolve(base, input)))) {
          return { ok: false, error: { code: 'SENSITIVE_PATH_DENIED', message: 'Sensitive local files cannot be read by tools.' } };
        }
        const target = path.resolve(base, relative);
        if (!contained(base, target)) return { ok: false, error: { code: 'PATH_TRAVERSAL', message: 'Path escapes workspace.' } };
        await assertSafePath(base, target);
        handle = await fs.open(target, 'r');
        const stat = await handle.stat();
        if (!stat.isFile()) throw new Error('Path is not a regular file.');
        if (stat.size > 10 * 1024 * 1024) throw new Error('File exceeds 10 MiB read limit.');
        const buffer = Buffer.alloc(Math.min(maxBytes, stat.size));
        const { bytesRead } = await handle.read(buffer, 0, buffer.length, 0);
        return { ok: true, data: { path: input, content: buffer.subarray(0, bytesRead).toString('utf8'), bytes: stat.size, truncated: stat.size > bytesRead } };
      } catch {
        return { ok: false, error: { code: 'FS_READ_FAILED', message: 'File is unavailable or outside the permitted workspace.' } };
      } finally { await handle?.close(); }
    }
  });
}
module.exports = { register, sensitive };
