'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const path = require('node:path');
const { prepareChatRequest, finalizeResponse, memoryManager, vectorSearch } = require('../orchestrator');
const { OllamaEmbeddingService } = require('../rag/embeddingService');
const { VectorSearch } = require('../rag/vectorSearch');
const { DATA_DIR } = require('../config/runtimePaths');
const { buildContextPack, countMessagesTokens } = require('../ai/context/contextWindowManager');

test('real orchestrator delivers retrieved memory and RAG to the provider, then persists reviewed response', async () => {
  memoryManager.upsertMemory({ userId: 'pipeline-user', projectId: 'p', conversationId: 'pipeline-chat', type: 'preference', key: 'favorite_color', value: 'violet-aurora', confidence: 1 });
  vectorSearch.addDocuments([{ id: 'guide-chunk', fileId: 'guide', userId: 'pipeline-user', projectId: 'p', text: 'The violet aurora project uses the zephyr-storage protocol.' }]);
  const prepared = await prepareChatRequest({ userId: 'pipeline-user', conversationId: 'pipeline-chat', projectId: 'p', model: 'ollama/test',
    options: { num_ctx: 8192 }, hazy: { toolResults: [] }, messages: [{ role: 'user', content: 'Describe the violet aurora project storage.' }] });
  const prompt = prepared.providerBody.messages.map(message => message.content).join('\n');
  assert.match(prompt, /violet-aurora/);
  assert.match(prompt, /zephyr-storage/);
  assert.match(prompt, /Untrusted Reference Data/);
  assert.ok(prepared.providerBody.hazyContext.allowedChunkIds.includes('guide-chunk'));
  await finalizeResponse({ conversationId: 'pipeline-chat', userId: 'pipeline-user', userMessage: prepared.analysis.latestMessage, responseText: 'It uses zephyr-storage.', analysis: prepared.analysis });
  assert.equal(memoryManager.getConversation('pipeline-chat', 'pipeline-user').turns.at(-1).content.includes('zephyr-storage'), true);
});

test('Ollama HTTP embeddings are normalized, cached, and used for semantic retrieval', async t => {
  let calls = 0;
  const server = http.createServer((req, res) => { calls++; assert.equal(req.url, '/api/embed'); req.resume(); res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify({ embeddings: [[3, 4]] })); });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const service = new OllamaEmbeddingService({ baseUrl: `http://127.0.0.1:${server.address().port}`, model: 'test-embed' });
  assert.deepEqual(await service.embed('weather query'), [0.6, 0.8]);
  assert.deepEqual(await service.embed('weather query'), [0.6, 0.8]);
  assert.equal(calls, 1);
  const index = new VectorSearch(path.join(DATA_DIR, 'semantic-test'), { embeddingService: service });
  await index.addDocumentsAsync([{ id: 'climate', fileId: 'climate', userId: 'u', text: 'Unrelated lexical vocabulary.' }]);
  const results = await index.searchAsync('weather query', { userId: 'u' });
  assert.equal(results[0].id, 'climate');
  assert.ok(results[0].semanticScore > 0.99);
  assert.equal(results.retrievalMode, 'hybrid');
});

test('stored embeddings from a different model are not compared', async () => {
  const service = { model: 'new-model', embed: async () => [1, 0] };
  const index = new VectorSearch(path.join(DATA_DIR, 'model-mismatch-test'), { embeddingService: service });
  index.addDocuments([{
    id: 'old-vector', fileId: 'old-vector', userId: 'u', text: 'matching lexical phrase',
    embedding: [1, 0], embeddingModel: 'old-model'
  }]);
  const results = await index.searchAsync('matching lexical phrase', { userId: 'u' });
  assert.equal(results[0].id, 'old-vector');
  assert.equal(results[0].semanticScore, 0);
});

test('failed embeddings preserve ingestion and lexical retrieval', async () => {
  const service = { embed: async () => { throw new Error('offline'); }, embedMany: async () => { throw new Error('offline'); } };
  const index = new VectorSearch(path.join(DATA_DIR, 'fallback-test'), { embeddingService: service });
  await index.addDocumentsAsync([{ id: 'fallback', userId: 'u', text: 'Offline violet aurora manual.' }]);
  assert.equal((await index.searchAsync('violet aurora', { userId: 'u' }))[0].id, 'fallback');
  index.addDocuments([{ id: 'dense', fileId: 'dense', userId: 'u', text: 'Dense aurora manual.', embedding: [1, 0] }]);
  const fallback = await index.searchAsync('aurora manual', { userId: 'u' });
  assert.equal(fallback.retrievalMode, 'lexical-fallback');
  assert.ok(fallback.length);
});

test('RAG replacement and deletion cannot cross user/project scopes with identical IDs', () => {
  const index = new VectorSearch(path.join(DATA_DIR, 'scope-test'));
  for (const [userId, projectId, text] of [['alice', 'one', 'violet Alice one'], ['bob', 'one', 'violet Bob one'], ['alice', 'two', 'violet Alice two']]) {
    index.addDocuments([{ id: 'same-chunk', fileId: 'same-file', userId, projectId, text }]);
  }
  assert.equal(index.readIndex().length, 3);
  const results = index.search('violet', { userId: 'alice', projectId: 'one' });
  assert.equal(results.length, 1); assert.match(results[0].text, /Alice one/);
  index.deleteFile('same-file', 'alice', 'one');
  assert.equal(index.readIndex().length, 2);
});

test('conversation summaries and ownership are isolated', () => {
  memoryManager.ensureConversation('private-chat', 'alice', 'one');
  memoryManager.insertSummary('private-chat', 'ALICE_PRIVATE_SENTINEL');
  assert.deepEqual(memoryManager.getConversation('private-chat', 'bob').summaries, []);
  assert.throws(() => memoryManager.getConversation('private-chat', 'alice', 'two'), /different project/);
  assert.throws(() => memoryManager.ensureConversation('private-chat', 'bob', 'one'), /different user/);
  assert.throws(() => memoryManager.ensureConversation('private-chat', 'alice', 'two'), /different project/);
});

test('failure of both retrieval methods and memory lookup does not crash ordinary chat', async t => {
  t.mock.method(memoryManager, 'getRelevantMemory', () => { throw new Error('unavailable'); });
  t.mock.method(memoryManager, 'getConversation', () => { throw new Error('unavailable'); });
  t.mock.method(vectorSearch, 'searchAsync', async () => { throw new Error('unavailable'); });
  t.mock.method(vectorSearch, 'search', () => { throw new Error('unavailable'); });
  const prepared = await prepareChatRequest({ model: 'ollama/test', hazy: { toolResults: [] }, messages: [{ role: 'user', content: 'Hello Hazy.' }] });
  assert.equal(prepared.analysis.memory.length, 0);
  assert.equal(prepared.analysis.ragContext.length, 0);
  assert.equal(prepared.providerBody.messages.at(-1).content, 'Hello Hazy.');
});

test('packing bounds large tool batches and preserves system policy', () => {
  const packed = buildContextPack({ model: 'ollama/test', options: { num_ctx: 1024 }, messages: [
    { role: 'system', content: 'Protect user secrets. '.repeat(400) },
    ...Array.from({ length: 40 }, () => ({ role: 'tool', contextSlot: 'tool', content: 'large result '.repeat(100) })),
    { role: 'user', content: 'Answer briefly.' }
  ] });
  assert.ok(countMessagesTokens(packed.messages) <= packed.stats.safeInputLimit);
  assert.equal(packed.messages[0].role, 'system');
  assert.match(packed.messages[0].content, /Never disclose secrets/);
  assert.equal(packed.messages.at(-1).content, 'Answer briefly.');
});
