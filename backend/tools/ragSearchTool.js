'use strict';

const path = require('path');
let vectorSearchMod;
try { vectorSearchMod = require('../rag/vectorSearch'); } catch {}

function register(registry) {
  registry.register({
    name: 'rag.search',
    description: 'Search the local RAG index for project/workspace knowledge, documents, and prior artifacts (complements web.search).',
    risk: 'read',
    toolset: 'safe_default',
    requiresConfirmation: false,
    allowedRoles: ['admin', 'cashier', 'user'],
    schema: {
      type: 'object',
      properties: {
        query: { type: 'string', minLength: 1 },
        limit: { type: 'integer', minimum: 1, maximum: 20 }
      },
      required: ['query'],
      additionalProperties: false
    },
    execute: ({ query, limit }, ctx) => {
      try {
        const mod = vectorSearchMod || {};
        let results = [];
        if (typeof mod.search === 'function') {
          results = mod.search(query, { limit: limit || 8 }) || [];
        } else if (mod.VectorSearch) {
          const ragBase = path.resolve(
            (ctx && ctx.services && ctx.services.ragBaseDir) ||
            path.join(__dirname, '..', '..', 'cache', 'hazy-engine', 'rag')
          );
          const vs = new mod.VectorSearch(ragBase);
          results = (typeof vs.search === 'function' ? vs.search(query, { limit: limit || 8 }) : []) || [];
        }
        return { ok: true, data: { results: results || [], source: 'local_rag' } };
      } catch (e) {
        return { ok: false, error: { code: 'RAG_SEARCH_FAILED', message: String(e) } };
      }
    }
  });
}

module.exports = { register };
