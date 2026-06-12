'use strict';

const fs = require('fs');
const fsp = fs.promises;
const path = require('path');

function register(registry) {
  registry.register({
    name: 'fs.read_file',
    description: 'Read a file from the local workspace (scoped to project dir with lexical+realpath+win-norm+relative+denylist guards; cache/artifacts allowed for handoff, secrets/audit/other-cache denied; special-case for artifact rels). Use for inspecting code, docs, or prior artifacts. Always bounded read to maxBytes (or 64k) + truncated flag; hard-fail only >10MB extreme. Allows source paths with keywords (e.g. backend/tools/).',
    risk: 'read',
    toolset: 'safe_default',
    requiresConfirmation: false,
    allowedRoles: ['admin', 'cashier', 'user'],
    schema: {
      type: 'object',
      properties: {
        path: { type: 'string', minLength: 1, description: 'Relative path from workspace root' },
        maxBytes: { type: 'integer', minimum: 1, maximum: 1048576 }
      },
      required: ['path'],
      additionalProperties: false
    },
    execute: async ({ path: userPath, maxBytes }, ctx) => {
      try {
        const rawBase = (ctx && ctx.services && ctx.services.workspaceDir) ?? process.cwd() ?? path.join(__dirname, '..', '..');
        let base = path.resolve(rawBase);
        let userP = String(userPath || '');
        const toPosix = (p) => String(p).replace(/\\/g, '/');
        const normUser = toPosix(userP);
        // special-case well-known artifact subtree for robust handoff even with custom workspaceDir (resolve from engine root)
        if (normUser.startsWith('cache/hazy-engine/artifacts/')) {
          base = path.resolve(__dirname, '..', '..');
        }
        const resolved = path.resolve(base, userP);
        const safeBase = base.endsWith(path.sep) ? base : base + path.sep;
        // cross-platform + traversal guard (lexical + relative + win case norm)
        const relCheck = path.relative(base, resolved);
        const normBase = toPosix(safeBase).toLowerCase();
        const normRes = toPosix(resolved).toLowerCase();
        if ((relCheck.startsWith('..') || normRes.startsWith('..')) || (!normRes.startsWith(normBase) && normRes !== toPosix(base).toLowerCase())) {
          return { ok: false, error: { code: 'PATH_TRAVERSAL', message: 'Path escapes workspace (traversal blocked).' } };
        }
        // denylist tightened to precise internals (exact cache non-artifacts, secret exts, git/node, specific audit/memory/rag paths); allows source like backend/tools/, docs/, paths containing keywords for "inspect code"
        const rel = toPosix(relCheck);
        const lrel = rel.toLowerCase();
        if ((lrel.startsWith('cache/hazy-engine/') && !lrel.startsWith('cache/hazy-engine/artifacts/')) ||
            /\.(key|env|db|jsonl|wal|shm)$/i.test(rel) ||
            /\/(?:\.git|node_modules)\//i.test(rel) ||
            /\/(?:audit|memory-conversation|user-profiles|rag-index)/i.test(lrel)) {
          return { ok: false, error: { code: 'SENSITIVE_PATH_DENIED', message: 'Access to internal/sensitive files (secrets, dbs, audit, non-artifact cache) denied via fs.read_file. Use rag.search for project knowledge or target source/docs/artifacts explicitly.' } };
        }
        const stat = await fsp.stat(resolved);
        if (stat.isDirectory()) {
          return { ok: false, error: { code: 'IS_DIRECTORY', message: 'Path is a directory.' } };
        }
        const max = maxBytes || (64 * 1024);
        // bounded read + truncate semantics preserved for normal oversized (original contract); extreme >10MB hard-fail only as DoS defense (preserves security)
        if (stat.size > 10 * 1024 * 1024) {
          return { ok: false, error: { code: 'FILE_TOO_LARGE', message: `File size ${stat.size} exceeds extreme limit.` } };
        }
        // realpath re-guard (symlink escape protection) + byte-accurate read (always truncate to cap, set flag)
        let toRead = resolved;
        try {
          const real = await fsp.realpath(resolved);
          const normReal = toPosix(real).toLowerCase();
          if (!normReal.startsWith(normBase) && normReal !== toPosix(base).toLowerCase()) {
            return { ok: false, error: { code: 'PATH_TRAVERSAL', message: 'Symlink target escapes workspace.' } };
          }
          toRead = real;
        } catch {}
        const buf = await fsp.readFile(toRead);
        const byteLen = buf.length;
        const content = buf.slice(0, max).toString('utf8');
        return {
          ok: true,
          data: {
            path: toPosix(path.relative(base, toRead)),
            content,
            bytes: byteLen,
            truncated: byteLen > max
          }
        };
      } catch (e) {
        return { ok: false, error: { code: 'FS_READ_FAILED', message: String(e) } };
      }
    }
  });
}

module.exports = { register };
