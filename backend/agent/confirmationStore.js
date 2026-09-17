'use strict';

const crypto = require('crypto');
const fsp = require('fs').promises;
const fs = require('fs');
const path = require('path');

const MAX_PENDING_PER_USER = 3; // FIX: DoS guard — original had no per-user cap
const CLEANUP_INTERVAL_MS = 60_000;

function normalizeText(value) {
  return String(value || '').trim().replace(/\s+/g, ' ').toLowerCase();
}

function slugConfirmationTarget(summary) {
  return String(summary || 'ACTION')
    .replace(/[^a-z0-9 ]/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toUpperCase()
    .slice(0, 80) || 'ACTION';
}

class PendingConfirmationStore {
  constructor({ ttlMs = 5 * 60 * 1000, filePath = null } = {}) {
    this.ttlMs = ttlMs;
    this.filePath = filePath;
    this.records = new Map();
    // FIX: O(1) pending lookup — original findPending() did O(n) scan + .find() + .get() per call.
    // Index: `${userId}:${chatId}` -> Set<id>
    this._pendingIndex = new Map();
    this.load();

    // FIX: periodic cleanup of expired/resolved records so Map doesn't grow forever.
    this._cleanupTimer = null;
    if (typeof setInterval !== 'undefined') {
      this._cleanupTimer = setInterval(() => this._cleanup(), CLEANUP_INTERVAL_MS);
      if (this._cleanupTimer.unref) this._cleanupTimer.unref(); // don't keep process alive
    }
  }

  // ── Index helpers ────────────────────────────────────────────────────────────
  _indexKey(userId, chatId) {
    return JSON.stringify([String(userId), String(chatId)]);
  }

  _indexAdd(record) {
    if (record.status !== 'pending') return;
    const k = this._indexKey(record.userId, record.chatId);
    if (!this._pendingIndex.has(k)) this._pendingIndex.set(k, new Set());
    this._pendingIndex.get(k).add(record.id);
  }

  _indexRemove(record) {
    const k = this._indexKey(record.userId, record.chatId);
    const s = this._pendingIndex.get(k);
    if (s) {
      s.delete(record.id);
      if (s.size === 0) this._pendingIndex.delete(k);
    }
  }

  // ── Cleanup ──────────────────────────────────────────────────────────────────
  _cleanup(now = Date.now()) {
    let changed = false;
    for (const [id, record] of this.records.entries()) {
      if (record.status === 'pending' && Date.parse(record.expiresAt) <= now) {
        record.status = 'expired';
        this._indexRemove(record);
        changed = true;
      } else if (record.status !== 'pending') {
        // Remove resolved records older than 2× TTL
        const age = now - Date.parse(record.createdAt);
        if (age > this.ttlMs * 2) {
          this.records.delete(id);
          changed = true;
        }
      }
    }
    if (changed) this._persistAsync();
  }

  // ── Persistence ──────────────────────────────────────────────────────────────
  load() {
    if (!this.filePath || !fs.existsSync(this.filePath)) return;
    try {
      const records = JSON.parse(fs.readFileSync(this.filePath, 'utf8'));
      for (const record of Array.isArray(records) ? records : []) {
        if (record?.id) {
          this.records.set(record.id, record);
          this._indexAdd(record);
        }
      }
    } catch {
      this.records.clear();
      this._pendingIndex.clear();
    }
  }

  // FIX: async persist — original persist() used writeFileSync which blocked the event loop.
  _persistAsync() { this._persistNow(); }

  _persistNow() {
    if (!this.filePath) return;
    const payload = JSON.stringify(Array.from(this.records.values()), null, 2);
    const dir = path.dirname(this.filePath);
    const tmp = `${this.filePath}.${process.pid}.tmp`;
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(tmp, payload, { encoding: 'utf8', mode: 0o600 });
    fs.renameSync(tmp, this.filePath);
  }

  // ── Public API ───────────────────────────────────────────────────────────────
  create({ ctx, tool, args, summary, now = Date.now() }) {
    // FIX: per-user pending cap — original would let a user accumulate unlimited pending confirmations.
    this._cleanup(now);
    const k = this._indexKey(ctx.userId, ctx.chatId);
    const existing = this._pendingIndex.get(k);
    if (existing && existing.size >= MAX_PENDING_PER_USER) {
      throw new Error('Too many pending confirmations. Resolve or cancel existing ones first.');
    }

    const target = slugConfirmationTarget(summary || `${tool.name} ${JSON.stringify(args)}`);
    const typedPhrase = tool.risk === 'high_write' ? `CONFIRM ${target}` : null;
    const confirmation = {
      id: crypto.randomUUID(),
      userId: ctx.userId,
      chatId: ctx.chatId,
      toolName: tool.name,
      args: structuredClone(args),
      risk: tool.risk,
      summary: summary || `Run ${tool.name}`,
      typedPhrase,
      expiresAt: new Date(now + this.ttlMs).toISOString(),
      status: 'pending',
      createdAt: new Date(now).toISOString()
    };
    this.records.set(confirmation.id, confirmation);
    this._indexAdd(confirmation);
    // A confirmation must survive a process restart before it is returned to
    // the caller. Async persistence created a window where approval state was
    // lost or a second process could not see the pending action.
    this._persistNow();
    return structuredClone(confirmation);
  }

  get(id, now = Date.now()) {
    const record = this.records.get(id);
    if (!record) return null;
    if (record.status === 'pending' && Date.parse(record.expiresAt) <= now) {
      this._indexRemove(record);
      record.status = 'expired';
      this._persistNow();
    }
    return structuredClone(record);
  }

  // FIX: O(1) — original was O(n) map over all records + find
  findPending(ctx, now = Date.now()) {
    const k = this._indexKey(ctx.userId, ctx.chatId);
    const ids = this._pendingIndex.get(k);
    if (!ids || ids.size === 0) return null;
    for (const id of ids) {
      const record = this.get(id, now);
      if (record?.status === 'pending') return record;
    }
    return null;
  }

  decide({ id, ctx, message, now = Date.now() }) {
    const record = this.get(id, now);
    if (!record) return { status: 'not_found' };
    if (record.userId !== ctx.userId || record.chatId !== ctx.chatId) return { status: 'forbidden' };
    if (record.status !== 'pending') return { status: record.status === 'approved' ? 'already_resolved' : record.status, confirmation: record };

    const normalized = normalizeText(message);
    const stored = this.records.get(id);

    if (['cancel', 'no', 'reject', 'rejected'].includes(normalized)) {
      stored.status = 'rejected';
      this._indexRemove(stored);
      this._persistNow();
      return { status: 'rejected', confirmation: { ...stored } };
    }

    const approved = record.risk === 'high_write'
      ? normalized === normalizeText(record.typedPhrase)
      : ['yes', 'confirm', 'approved', 'go ahead'].includes(normalized);

    if (!approved) return { status: 'invalid_confirmation', confirmation: record };

    stored.status = 'approved';
    this._indexRemove(stored);
    this._persistNow();
    return { status: 'approved', confirmation: { ...stored } };
  }

  destroy() {
    if (this._cleanupTimer) clearInterval(this._cleanupTimer);
  }
}

function buildConfirmationMessage(confirmation) {
  const lines = [
    `I can ${confirmation.summary}, but this action requires your confirmation.`,
    ''
  ];
  if (confirmation.typedPhrase) {
    lines.push('Please reply exactly:', confirmation.typedPhrase);
  } else {
    lines.push('Reply "confirm" to continue, or "cancel" to stop.');
  }
  lines.push('', `This confirmation expires at ${confirmation.expiresAt}.`);
  return lines.join('\n');
}

module.exports = {
  PendingConfirmationStore,
  buildConfirmationMessage,
  normalizeText,
  slugConfirmationTarget
};
