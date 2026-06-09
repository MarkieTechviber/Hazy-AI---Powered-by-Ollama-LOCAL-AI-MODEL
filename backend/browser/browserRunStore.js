'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { redactObject } = require('./browserSafety');

class BrowserRunStore {
  constructor(baseDir) {
    this.baseDir = baseDir;
    this.sessionsPath = path.join(baseDir, 'browser-sessions.jsonl');
    this.eventsPath = path.join(baseDir, 'browser-events.jsonl');
    this.screenshotsDir = path.join(baseDir, 'screenshots');
  }

  ensureDirs() {
    fs.mkdirSync(this.baseDir, { recursive: true });
    fs.mkdirSync(this.screenshotsDir, { recursive: true });
  }

  makeId(prefix = 'browser') {
    return `${prefix}-${crypto.randomUUID()}`;
  }

  appendJsonl(filePath, record) {
    this.ensureDirs();
    fs.appendFileSync(filePath, `${JSON.stringify(record)}\n`, 'utf8');
  }

  saveSession(session) {
    const record = redactObject({
      id: session.id,
      userId: session.userId,
      chatId: session.chatId,
      status: session.status,
      currentUrl: session.currentUrl,
      currentTitle: session.currentTitle,
      screenshotPath: session.screenshotPath,
      createdAt: session.createdAt,
      updatedAt: session.updatedAt || new Date().toISOString()
    });
    this.appendJsonl(this.sessionsPath, record);
    return record;
  }

  saveEvent(event) {
    const record = redactObject({
      id: event.id || this.makeId('event'),
      createdAt: event.createdAt || new Date().toISOString(),
      ...event
    });
    this.appendJsonl(this.eventsPath, record);
    return record;
  }

  listEvents({ userId = 'local-user', sessionId = null, limit = 100 } = {}) {
    if (!fs.existsSync(this.eventsPath)) return [];
    const lines = fs.readFileSync(this.eventsPath, 'utf8').split('\n').filter(Boolean);
    return lines.reverse().map((line) => {
      try { return JSON.parse(line); } catch { return null; }
    }).filter((event) => event
      && (!userId || event.userId === userId)
      && (!sessionId || event.sessionId === sessionId)
    ).slice(0, Math.max(1, Math.min(limit, 500)));
  }

  listSessions(userId = 'local-user', limit = 30) {
    if (!fs.existsSync(this.sessionsPath)) return [];
    const byId = new Map();
    const lines = fs.readFileSync(this.sessionsPath, 'utf8').split('\n').filter(Boolean);
    for (const line of lines) {
      try {
        const session = JSON.parse(line);
        if (!userId || session.userId === userId) byId.set(session.id, session);
      } catch {}
    }
    return Array.from(byId.values())
      .sort((a, b) => new Date(b.updatedAt || b.createdAt) - new Date(a.updatedAt || a.createdAt))
      .slice(0, Math.max(1, Math.min(limit, 100)));
  }

  screenshotPath(sessionId) {
    this.ensureDirs();
    return path.join(this.screenshotsDir, `${String(sessionId).replace(/[^a-zA-Z0-9-]/g, '')}.png`);
  }
}

module.exports = { BrowserRunStore };
