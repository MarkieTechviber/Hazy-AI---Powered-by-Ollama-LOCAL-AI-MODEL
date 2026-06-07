'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { estimateTokens } = require('../ai/context/contextWindowManager');
const { validateCitations } = require('../rag/citations');

class UsageStatsStore {
  constructor(baseDir) {
    this.baseDir = baseDir;
    this.filePath = path.join(baseDir, 'usage-logs.jsonl');
  }

  ensureDirectory() {
    if (!fs.existsSync(this.baseDir)) fs.mkdirSync(this.baseDir, { recursive: true });
  }

  log(entry) {
    this.ensureDirectory();
    const record = {
      id: crypto.randomUUID(),
      createdAt: new Date().toISOString(),
      ...entry
    };
    fs.appendFileSync(this.filePath, `${JSON.stringify(record)}\n`, 'utf8');
    return record;
  }
}

function createResponseTelemetry(params) {
  const startedAt = Date.now();
  let output = '';
  let finalized = false;

  function observe(payload) {
    if (!payload) return;
    const text = Buffer.isBuffer(payload) ? payload.toString('utf8') : String(payload);
    for (const line of text.split(/\r?\n/)) {
      if (!line.trim()) continue;
      try {
        const parsed = JSON.parse(line);
        output += parsed.message?.content
          || parsed.response
          || parsed.choices?.[0]?.message?.content
          || '';
      } catch {
        output += text;
        break;
      }
    }
  }

  function finalize(extra = {}) {
    if (finalized) return null;
    finalized = true;
    const allowedChunkIds = params.allowedChunkIds || [];
    const citationCheck = validateCitations(output, allowedChunkIds);
    const contextStats = params.contextStats || {};
    return params.store.log({
      userId: params.userId || 'default',
      chatId: params.chatId || 'default',
      model: params.model,
      inputTokens: contextStats.afterTokens || contextStats.packedTokens || 0,
      outputTokens: estimateTokens(output),
      totalTokens: (contextStats.afterTokens || contextStats.packedTokens || 0) + estimateTokens(output),
      latencyMs: Date.now() - startedAt,
      retrievedChunks: allowedChunkIds.length,
      averageChunkScore: params.averageChunkScore || 0,
      invalidCitations: citationCheck.invalid.length,
      citationCheck,
      contextUtilizationRate: contextStats.utilization || 0,
      compressionRatio: contextStats.beforeTokens
        ? (contextStats.afterTokens || 0) / contextStats.beforeTokens
        : 1,
      ...extra
    });
  }

  return { observe, finalize, getOutput: () => output };
}

module.exports = {
  UsageStatsStore,
  createResponseTelemetry
};
