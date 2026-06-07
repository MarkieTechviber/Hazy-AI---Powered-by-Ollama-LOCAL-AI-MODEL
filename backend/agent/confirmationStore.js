'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

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
    this.load();
  }

  load() {
    if (!this.filePath || !fs.existsSync(this.filePath)) return;
    try {
      const records = JSON.parse(fs.readFileSync(this.filePath, 'utf8'));
      for (const record of Array.isArray(records) ? records : []) {
        if (record?.id) this.records.set(record.id, record);
      }
    } catch {
      this.records.clear();
    }
  }

  persist() {
    if (!this.filePath) return;
    fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
    const tempPath = `${this.filePath}.tmp`;
    fs.writeFileSync(tempPath, JSON.stringify(Array.from(this.records.values()), null, 2), 'utf8');
    fs.renameSync(tempPath, this.filePath);
  }

  create({ ctx, tool, args, summary, now = Date.now() }) {
    const target = slugConfirmationTarget(summary || `${tool.name} ${JSON.stringify(args)}`);
    const typedPhrase = tool.risk === 'high_write'
      ? `CONFIRM ${target}`
      : null;
    const confirmation = {
      id: crypto.randomUUID(),
      userId: ctx.userId,
      chatId: ctx.chatId,
      toolName: tool.name,
      args,
      risk: tool.risk,
      summary: summary || `Run ${tool.name}`,
      typedPhrase,
      expiresAt: new Date(now + this.ttlMs).toISOString(),
      status: 'pending',
      createdAt: new Date(now).toISOString()
    };
    this.records.set(confirmation.id, confirmation);
    this.persist();
    return { ...confirmation };
  }

  get(id, now = Date.now()) {
    const record = this.records.get(id);
    if (!record) return null;
    if (record.status === 'pending' && Date.parse(record.expiresAt) <= now) {
      record.status = 'expired';
      this.persist();
    }
    return { ...record };
  }

  findPending(ctx, now = Date.now()) {
    return Array.from(this.records.values())
      .map((record) => this.get(record.id, now))
      .find((record) =>
        record?.status === 'pending'
        && record.userId === ctx.userId
        && record.chatId === ctx.chatId
      ) || null;
  }

  decide({ id, ctx, message, now = Date.now() }) {
    const record = this.get(id, now);
    if (!record) return { status: 'not_found' };
    if (record.userId !== ctx.userId || record.chatId !== ctx.chatId) return { status: 'forbidden' };
    if (record.status !== 'pending') return { status: record.status, confirmation: record };

    const normalized = normalizeText(message);
    if (['cancel', 'no', 'reject', 'rejected'].includes(normalized)) {
      const stored = this.records.get(id);
      stored.status = 'rejected';
      this.persist();
      return { status: 'rejected', confirmation: { ...stored } };
    }

    const approved = record.risk === 'high_write'
      ? normalized === normalizeText(record.typedPhrase)
      : ['yes', 'confirm', 'approved', 'go ahead'].includes(normalized);
    if (!approved) {
      return {
        status: 'invalid_confirmation',
        confirmation: record
      };
    }

    const stored = this.records.get(id);
    stored.status = 'approved';
    this.persist();
    return { status: 'approved', confirmation: { ...stored } };
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
