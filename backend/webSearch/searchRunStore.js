'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

class SearchRunStore {
  constructor(baseDir) {
    this.baseDir = baseDir;
    this.runsPath = path.join(baseDir, 'web-search-runs.jsonl');
    this.sourcesDir = path.join(baseDir, 'sources');
  }

  sanitizeRunId(runId) {
    return String(runId || '').replace(/[^a-zA-Z0-9-]/g, '');
  }

  save(run) {
    fs.mkdirSync(this.baseDir, { recursive: true });
    fs.mkdirSync(this.sourcesDir, { recursive: true });
    const record = {
      id: run.id || crypto.randomUUID(),
      createdAt: new Date().toISOString(),
      ...run
    };
    fs.appendFileSync(this.runsPath, `${JSON.stringify(record)}\n`, 'utf8');
    const sourcePanel = {
      id: record.id,
      createdAt: record.createdAt,
      userId: record.userId,
      chatId: record.chatId,
      messageId: record.messageId,
      decision: record.decision,
      queries: record.queries,
      citations: record.citations,
      selectedChunks: record.selectedChunks,
      sourcesFound: (record.results || []).map((result) => ({
        title: result.title,
        url: result.url,
        domain: result.domain,
        sourceName: result.sourceName,
        providerName: result.providerName || result.provider,
        publishedAt: result.publishedAt,
        rank: result.rank,
        sourceQualityScore: result.sourceQualityScore,
        qualitySignals: result.qualitySignals
      })),
      sourcesRead: record.fetchedPages || [],
      sourcesRejected: record.rejectedResults || [],
      fetchFailures: record.fetchErrors || [],
      providerErrors: record.providerErrors || [],
      suspiciousSources: record.suspiciousSources || [],
      warnings: record.warnings || [],
      metrics: record.metrics || {},
      confidence: record.confidence || record.metrics?.confidence || 'low'
    };
    fs.writeFileSync(path.join(this.sourcesDir, `${record.id}.json`), JSON.stringify(sourcePanel, null, 2), 'utf8');
    return record;
  }

  getSources(runId, userId) {
    const safeId = this.sanitizeRunId(runId);
    const filePath = path.join(this.sourcesDir, `${safeId}.json`);
    if (!safeId || !fs.existsSync(filePath)) return null;
    const record = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    if (userId && record.userId !== userId) return null;
    return record;
  }

  updateCitations(runId, userId, citations) {
    const safeId = this.sanitizeRunId(runId);
    const filePath = path.join(this.sourcesDir, `${safeId}.json`);
    if (!safeId || !fs.existsSync(filePath)) return false;
    try {
      const record = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      if (userId && record.userId !== userId) return false;
      record.citations = citations;
      fs.writeFileSync(filePath, JSON.stringify(record, null, 2), 'utf8');
      return true;
    } catch {
      return false;
    }
  }

  listRuns(userId, limit = 20) {
    if (!fs.existsSync(this.runsPath)) return [];
    const lines = fs.readFileSync(this.runsPath, 'utf8').split('\n').filter(Boolean);
    return lines.reverse().map((line) => {
      try {
        const run = JSON.parse(line);
        return {
          id: run.id,
          createdAt: run.createdAt,
          userId: run.userId,
          chatId: run.chatId,
          mode: run.decision?.mode,
          reason: run.decision?.reason,
          queryCount: run.queries?.length || 0,
          sourceCount: run.citations?.length || 0,
          confidence: run.confidence || run.metrics?.confidence || 'low',
          warnings: run.warnings || []
        };
      } catch { return null; }
    }).filter((run) => run && (!userId || run.userId === userId)).slice(0, limit);
  }
}

module.exports = { SearchRunStore };
