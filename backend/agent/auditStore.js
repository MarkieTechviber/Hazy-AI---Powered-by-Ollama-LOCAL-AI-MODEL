'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const SECRET_KEY_PATTERN = /(api[-_]?key|authorization|password|secret|token|cookie)/i;

function redact(value) {
  if (Array.isArray(value)) return value.map(redact);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [
        key,
        SECRET_KEY_PATTERN.test(key) ? '[REDACTED]' : redact(item)
      ])
    );
  }
  return value;
}

class AgentAuditStore {
  constructor(filePath = null) {
    this.filePath = filePath;
    this.entries = [];
  }

  log(entry) {
    const record = {
      id: crypto.randomUUID(),
      createdAt: new Date().toISOString(),
      ...redact(entry)
    };
    this.entries.push(record);
    if (this.filePath) {
      fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
      fs.appendFileSync(this.filePath, `${JSON.stringify(record)}\n`, 'utf8');
    }
    return record;
  }
}

module.exports = { AgentAuditStore, redact };
