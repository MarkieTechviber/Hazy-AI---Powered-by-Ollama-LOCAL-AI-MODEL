'use strict';

const crypto = require('crypto');
const fs = require('fs');
const fsp = fs.promises;
const path = require('path');

const SECRET_KEY_PATTERN = /(api[-_]?key|authorization|password|secret|token|cookie)/i;
const PRIVATE_PAYLOAD_KEY_PATTERN = /^(content|code|input|message|prompt|query|text|value)$/i;
const MAX_IN_MEMORY = 1000;
const DEFAULT_MAX_FILE_BYTES = 10 * 1024 * 1024; // 10 MB before rotation

// FIX: circular-reference-safe redact (original could throw on circular objects)
function redact(value, _seen = new WeakSet()) {
  if (Array.isArray(value)) {
    if (_seen.has(value)) return '[Circular]';
    _seen.add(value);
    return value.map(v => redact(v, _seen));
  }
  if (value && typeof value === 'object') {
    if (_seen.has(value)) return '[Circular]';
    _seen.add(value);
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => {
        if (SECRET_KEY_PATTERN.test(key)) return [key, '[REDACTED]'];
        if (PRIVATE_PAYLOAD_KEY_PATTERN.test(key) && typeof item === 'string') {
          return [key, `[REDACTED:${Buffer.byteLength(item, 'utf8')} bytes]`];
        }
        return [key, redact(item, _seen)];
      })
    );
  }
  return value;
}

class AgentAuditStore {
  // FIX 1: async write queue — original used appendFileSync which blocked the event loop on every log call.
  // FIX 2: log rotation — original grew the JSONL file indefinitely; now rotates at maxFileSizeBytes.
  // FIX 3: in-memory cap — original entries[] grew without bound.
  constructor(filePath = null, { maxFileSizeBytes = DEFAULT_MAX_FILE_BYTES } = {}) {
    this.filePath = filePath;
    this.maxFileSizeBytes = maxFileSizeBytes;
    this.entries = [];
    // Serial async queue: each write waits for the previous, preventing interleaved lines.
    this._writeQueue = Promise.resolve();
  }

  log(entry) {
    const record = {
      id: crypto.randomUUID(),
      createdAt: new Date().toISOString(),
      ...Object.fromEntries(['requestId', 'toolName', 'risk', 'status', 'errorCode', 'latencyMs', 'confirmationId'].filter(key => entry[key] != null).map(key => [key, entry[key]]))
    };

    // Cap in-memory ring buffer
    this.entries.push(record);
    if (this.entries.length > MAX_IN_MEMORY) this.entries.shift();

    if (this.filePath) {
      // Chain onto the serial queue; swallow errors so a disk failure never breaks the agent loop
      this._writeQueue = this._writeQueue
        .then(() => this._appendAsync(record))
        .catch((e) => console.warn('[AuditStore] async write failed (non-fatal):', e?.message || e));
    }

    return record;
  }

  async _appendAsync(record) {
    await fsp.mkdir(path.dirname(this.filePath), { recursive: true });

    // Rotate if file exceeds size limit
    try {
      const stat = await fsp.stat(this.filePath);
      if (stat.size >= this.maxFileSizeBytes) {
        const rotated = `${this.filePath}.previous`;
        await fsp.rm(rotated, { force: true });
        await fsp.rename(this.filePath, rotated);
      }
    } catch {
      // File doesn't exist yet — that's fine
    }

    await fsp.appendFile(this.filePath, `${JSON.stringify(record)}\n`, 'utf8');
  }

  // Convenience: flush the write queue before process exit or tests
  async flush() {
    await this._writeQueue;
  }
}

module.exports = { AgentAuditStore, redact };
