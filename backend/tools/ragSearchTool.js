'use strict';

const path = require('path');
let vectorSearchMod;
try { vectorSearchMod = require('../rag/vectorSearch'); } catch {}
let embeddingServiceMod;
try { embeddingServiceMod = require('../rag/embeddingService'); } catch {}

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
    execute: async ({ query, limit }, ctx) => {
      try {
        const mod = vectorSearchMod || {};
        let results = [];
        const embeddingService = (ctx && ctx.services && ctx.services.embeddingService) || 
          (embeddingServiceMod?.OllamaEmbeddingService ? new embeddingServiceMod.OllamaEmbeddingService() : null);

        const vs = (ctx && ctx.services && ctx.services.vectorSearch) || 
          (mod.VectorSearch ? new mod.VectorSearch(
            path.resolve((ctx && ctx.services && ctx.services.ragBaseDir) || path.join(__dirname, '..', '..', 'cache', 'hazy-engine', 'rag')),
            { embeddingService }
          ) : null);

        if (vs) {
          if (typeof vs.searchAsync === 'function') {
            results = await vs.searchAsync(query, { limit: limit || 8 }) || [];
          } else if (typeof vs.search === 'function') {
            results = vs.search(query, { limit: limit || 8 }) || [];
          }
        } else if (typeof mod.search === 'function') {
          results = mod.search(query, { limit: limit || 8 }) || [];
        }
        return { ok: true, data: { results: results || [], source: 'local_rag' } };
      } catch (e) {
        return { ok: false, error: { code: 'RAG_SEARCH_FAILED', message: String(e) } };
      }
    }
  });
}

module.exports = { register };
