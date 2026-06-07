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

  save(run) {
    fs.mkdirSync(this.baseDir, { recursive: true });
    fs.mkdirSync(this.sourcesDir, { recursive: true });
    const record = {
      id: run.id || crypto.randomUUID(),
      createdAt: new Date().toISOString(),
      ...run
    };
    fs.appendFileSync(this.runsPath, `${JSON.stringify(record)}\n`, 'utf8');
    fs.writeFileSync(path.join(this.sourcesDir, `${record.id}.json`), JSON.stringify({
      id: record.id,
      userId: record.userId,
      chatId: record.chatId,
      citations: record.citations,
      selectedChunks: record.selectedChunks
    }, null, 2), 'utf8');
    return record;
  }

  getSources(runId, userId) {
    const safeId = String(runId || '').replace(/[^a-zA-Z0-9-]/g, '');
    const filePath = path.join(this.sourcesDir, `${safeId}.json`);
    if (!safeId || !fs.existsSync(filePath)) return null;
    const record = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    if (userId && record.userId !== userId) return null;
    return record;
  }
}

module.exports = { SearchRunStore };
