'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { performance } = require('node:perf_hooks');

const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'hazy-benchmark-'));
process.env.HAZY_DATA_DIR = scratch;
process.env.HAZY_CONFIG_DIR = path.join(scratch, 'config');

function elapsed(start) { return Number((performance.now() - start).toFixed(2)); }

async function main() {
  let started = performance.now();
  require('../backend/server');
  const startupMs = elapsed(started);

  const { MemoryManager } = require('../backend/memory/memoryManager');
  const { VectorSearch } = require('../backend/src/infrastructure/database/vectorSearch');
  const { OllamaEmbeddingService } = require('../backend/rag/embeddingService');

  const memory = new MemoryManager(path.join(scratch, 'memory'));
  started = performance.now();
  memory.getRelevantMemory({ query: 'benchmark lookup', userId: 'benchmark', conversationId: 'benchmark', projectId: 'benchmark' });
  const memoryLookupMs = elapsed(started);

  const vectors = new VectorSearch(path.join(scratch, 'rag'));
  vectors.addDocuments([{
    id: 'benchmark-chunk', fileId: 'benchmark-file', text: 'Hazy local retrieval benchmark document.',
    source: 'synthetic', userId: 'benchmark', projectId: 'benchmark'
  }], { userId: 'benchmark', projectId: 'benchmark' });
  started = performance.now();
  vectors.search('local retrieval', { userId: 'benchmark', projectId: 'benchmark', limit: 4 });
  const retrievalMs = elapsed(started);

  let embeddingMs = null;
  let embeddingAvailable = false;
  try {
    const embeddings = new OllamaEmbeddingService({ timeoutMs: 5_000 });
    started = performance.now();
    await embeddings.embed('Hazy embedding benchmark');
    embeddingMs = elapsed(started);
    embeddingAvailable = true;
  } catch {}

  let responseMs = null;
  let responseAvailable = false;
  if (process.env.HAZY_BENCHMARK_MODEL === '1') {
    try {
      const base = (process.env.OLLAMA_URL || 'http://127.0.0.1:11434').replace(/\/$/, '');
      const model = (process.env.HAZY_MODEL || 'ollama/llama3.2:1b').replace(/^ollama\//, '');
      started = performance.now();
      const response = await fetch(`${base}/api/chat`, {
        method: 'POST', headers: { 'content-type': 'application/json' }, signal: AbortSignal.timeout(120_000),
        body: JSON.stringify({ model, stream: false, messages: [{ role: 'user', content: 'Reply with OK.' }] })
      });
      if (response.ok) { await response.arrayBuffer(); responseMs = elapsed(started); responseAvailable = true; }
    } catch {}
  }

  console.log(JSON.stringify({
    measuredAt: new Date().toISOString(),
    node: process.versions.node,
    startupMs,
    response: { measured: process.env.HAZY_BENCHMARK_MODEL === '1', available: responseAvailable, latencyMs: responseMs },
    retrievalMs,
    memoryLookupMs,
    embedding: { available: embeddingAvailable, latencyMs: embeddingMs },
    processRamMiB: Number((process.memoryUsage().rss / 1024 / 1024).toFixed(1))
  }, null, 2));
}

main().catch(() => { console.error('Benchmark failed without exposing request data.'); process.exitCode = 1; })
  .finally(() => { try { fs.rmSync(scratch, { recursive: true, force: true }); } catch {} });
