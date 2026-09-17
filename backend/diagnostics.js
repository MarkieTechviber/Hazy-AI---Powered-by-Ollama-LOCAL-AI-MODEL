'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { ROOT_DIR } = require('./config/runtimePaths');
const { loadConfig } = require('./config/runtimeConfig');
async function probe(url) {
  try { const response = await fetch(url, { signal: AbortSignal.timeout(2000) }); return response.ok ? await response.json() : null; }
  catch { return null; }
}
async function diagnostics() {
  const config = loadConfig();
  const base = config.providers.ollama.baseUrl.replace(/\/$/, '');
  const tts = new URL(process.env.KOKORO_URL || 'http://127.0.0.1:8880/v1/audio/speech');
  tts.pathname = '/health'; tts.search = ''; tts.hash = '';
  const [tags, speech] = await Promise.all([probe(`${base}/api/tags`), probe(tts)]);
  const names = Array.isArray(tags?.models) ? tags.models.map(model => model.name) : [];
  const model = config.defaults.textModel;
  const embeddingModel = process.env.HAZY_EMBEDDING_MODEL || 'embeddinggemma';
  const hasModel = name => names.some(item => item === name || item === `${name}:latest`);
  let browserAvailable = false;
  try { browserAvailable = fs.existsSync(require('playwright').chromium.executablePath()); } catch {}
  return {
    status: 'ok', runtime: 'node', node: process.versions.node,
    provider: model.includes('/') ? model.split('/')[0] : 'ollama', model,
    ollama: { available: Boolean(tags), modelCount: names.length, selectedModelAvailable: hasModel(model.replace(/^ollama\//, '')) },
    embeddings: { model: embeddingModel, installed: hasModel(embeddingModel), mode: hasModel(embeddingModel) ? 'hybrid when indexed' : 'lexical fallback' },
    frontend: { available: fs.existsSync(path.join(ROOT_DIR, 'frontend', 'index.html')) },
    tts: { available: speech?.status === 'ok', optional: true },
    browser: { available: browserAvailable, optional: true }
  };
}
module.exports = { diagnostics };
