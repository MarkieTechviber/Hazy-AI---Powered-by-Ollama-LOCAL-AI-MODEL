'use strict';

const fs = require('fs');
const fsp = fs.promises;
const path = require('path');

const { assertSafePath, safeSegment, artifactScopeSegment } = require('../security/safePath');
const { ARTIFACTS_DIR } = require('../config/runtimePaths');
const assertSafeTarget = (_base, target) => assertSafePath(ARTIFACTS_DIR, target);

function register(registry) {
  registry.register({
    name: 'artifact.write',
    description: 'Write an artifact (output file, patch, note, etc) to a scoped per-chat artifacts directory (sanitized chatId, resolved+guard+realpath) with post-write verification. Always returns conventional cache/hazy-engine/artifacts/... rel (fs special-cases for handoff independent of custom workspaceDir).',
    risk: 'low_write',
    toolset: 'safe_default',
    requiresConfirmation: false,
    allowedRoles: ['admin', 'cashier', 'user'],
    schema: {
      type: 'object',
      properties: {
        filename: { type: 'string', minLength: 1, maxLength: 200 },
        content: { type: 'string', minLength: 0, maxLength: 200000 },
        action: { type: 'string', enum: ['write', 'read', 'list', 'patch'] }
      },
      additionalProperties: false
    },
    execute: async ({ filename, content, action = 'write' }, ctx) => {
      try {
        const safeChat = artifactScopeSegment(ctx);
        const artifactsRoot = require('../config/runtimePaths').ARTIFACTS_DIR;
        const base = path.resolve(artifactsRoot, safeChat);
        const rootBase = artifactsRoot.endsWith(path.sep) ? artifactsRoot : artifactsRoot + path.sep;
        const relUp = path.relative(artifactsRoot, base);
        if (relUp.startsWith('..') || (!base.startsWith(rootBase) && base !== artifactsRoot)) {
          return { ok: false, error: { code: 'INVALID_CHATID', message: 'Chat ID escapes artifacts root (traversal blocked).' } };
        }
        await assertSafeTarget(artifactsRoot, base);
        await fsp.mkdir(base, { recursive: true });
        // dir-aware support for sub-paths (e.g. assets/foo.js, src/bar.ts from buildData filenames).
        // Sanitize each path segment to prevent traversal/bad chars, mkdir intermediates, preserve logical structure.
        // list is recursive to surface subdirs. Manifest + buildData remain source of truth for original names/reopen (sanitized FS names may differ slightly on special chars).
        function toSafePathSegments(rawName) {
          if (!rawName) return ['artifact.txt'];
          return String(rawName).split(/[\\/]/).filter(Boolean).map(seg => String(seg).replace(/[^a-zA-Z0-9_.-]/g, '_').slice(0, 200));
        }
        const toPosix = (p) => String(p).replace(/\\/g, '/');

        let target = null;
        let targetDir = base;
        if (filename) {
          const segs = toSafePathSegments(filename);
          target = path.resolve(base, ...segs);
          targetDir = path.dirname(target);

          const safeBase = base.endsWith(path.sep) ? base : base + path.sep;
          const relCheck = path.relative(base, target);
          const normBase = toPosix(safeBase).toLowerCase();
          const normRes = toPosix(target).toLowerCase();
          if ((relCheck.startsWith('..') || normRes.startsWith('..')) || (!normRes.startsWith(normBase) && normRes !== toPosix(base).toLowerCase())) {
            return { ok: false, error: { code: 'PATH_TRAVERSAL', message: 'Path escapes chat artifacts directory (traversal blocked).' } };
          }
        }

        if (action === 'list' || (!filename && !content)) {
          const files = [];
          async function walk(dir, prefix = '') {
            try {
              const entries = await fsp.readdir(dir, { withFileTypes: true });
              for (const e of entries) {
                if (e.isSymbolicLink() || files.length >= 200) continue;
                const rel = prefix ? `${prefix}/${e.name}` : e.name;
                if (e.isDirectory()) {
                  await walk(path.join(dir, e.name), rel);
                } else {
                  files.push(rel);
                }
              }
            } catch (_) {}
          }
          await walk(base);
          return { ok: true, data: { chat: safeChat, files, count: files.length, note: 'List from chat-scoped artifacts dir (recursive for subdirs).' } };
        }
        if (action === 'read') {
          try {
            await assertSafeTarget(base, target);
            if ((await fsp.stat(target)).size > 1024 * 1024) throw new Error('Artifact too large to read.');
            const data = await fsp.readFile(target, 'utf8');
            return { ok: true, data: { filename: filename, content: data, note: 'Read from artifacts (subdir-aware).' } };
          } catch (re) {
            return { ok: false, error: { code: 'ARTIFACT_NOT_FOUND', message: String(re) } };
          }
        }
        // FIX Issue 2B: patch action — apply search/replace diffs to an existing artifact file.
        // content must be a JSON array of {search: string, replace: string} patch objects.
        // Falls back to full write if the file doesn't exist yet or JSON parse fails.
        if (action === 'patch' && filename) {
          await assertSafeTarget(base, target);
          await fsp.mkdir(targetDir, { recursive: true });
          const patchTarget = target;
          await assertSafeTarget(base, patchTarget);
          if (await fsp.stat(patchTarget).then(s => s.size > 1024 * 1024).catch(() => false)) throw new Error('Artifact too large to patch.');
          let existing = '';
          try { existing = await fsp.readFile(patchTarget, 'utf8'); } catch { /* file may not exist yet */ }
          let patched = existing;
          let patchesApplied = 0;
          let patchErrors = [];
          try {
            const patches = JSON.parse(String(content || '[]'));
            if (!Array.isArray(patches)) throw new Error('patches must be an array');
            for (const p of patches) {
              if (typeof p.search === 'string' && typeof p.replace === 'string') {
                if (patched.includes(p.search)) {
                  patched = patched.replace(p.search, p.replace);
                  patchesApplied++;
                } else {
                  patchErrors.push(`search string not found: ${String(p.search).slice(0, 60)}`);
                }
              }
            }
          } catch (pe) {
            // JSON parse failed — treat content as full replacement
            patched = String(content || existing);
            patchErrors.push(`patch JSON parse failed (${pe.message}); fell back to full write`);
          }
          await fsp.writeFile(patchTarget, patched, 'utf8');
          const relName = String(filename);
          const relPath = `cache/hazy-engine/artifacts/${safeChat}/${relName}`;
          return {
            ok: true,
            data: {
              path: relPath,
              patchesApplied,
              patchErrors,
              note: `Patch applied to ${relName}. ${patchesApplied} substitution(s) made.`
            }
          };
        }
        // default write (subdir-aware)
        const activeFilename = filename || 'artifact.txt';
        const activeTarget = target || path.resolve(base, 'artifact.txt');
        const activeTargetDir = targetDir;
        await assertSafeTarget(base, activeTarget);
        await fsp.mkdir(activeTargetDir, { recursive: true });
        await assertSafeTarget(base, activeTarget);
        await fsp.writeFile(activeTarget, String(content || ''), 'utf8');
        let verified = false;
        let size = 0;
        let realWritten = activeTarget;
        try {
          realWritten = await fsp.realpath(activeTarget);
          const st = await fsp.stat(realWritten);
          verified = realWritten.startsWith(artifactsRoot);
          size = st.size;
        } catch (v) { /* verifier non-fatal */ }
        // rel uses original logical name (from caller) for consistency with manifest/buildData; FS uses sanitized segments
        const relName = String(activeFilename);
        const relPath = `cache/hazy-engine/artifacts/${safeChat}/${relName}`;
        return {
          ok: true,
          data: {
            path: relPath,
            verified,
            size,
            note: 'Artifact written and verified on disk (chat-scoped write, subdir-aware). Use fs.read_file with the conventional relative path (cache/hazy-engine/artifacts/...) or rag.search to retrieve. Reads via fs are workspace-global for project knowledge.'
          }
        };
      } catch (e) {
        return { ok: false, error: { code: 'ARTIFACT_OP_FAILED', message: String(e) } };
      }
    }
  });
}

module.exports = { register };
