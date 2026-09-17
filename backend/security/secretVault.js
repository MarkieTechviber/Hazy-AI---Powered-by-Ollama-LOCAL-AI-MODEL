const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

function decodeConfiguredKey(value) {
  if (!value) return null;
  const trimmed = String(value).trim();
  if (/^[a-f0-9]{64}$/i.test(trimmed)) return Buffer.from(trimmed, "hex");
  const decoded = Buffer.from(trimmed, "base64");
  return decoded.length === 32 ? decoded : null;
}

class SecretVault {
  constructor(database, options = {}) {
    this.database = database;
    this.db = database.db;
    this.keyPath = options.keyPath || path.join(path.dirname(database.filePath), ".hazy-master-key");
    this.key = this.loadOrCreateKey();
  }

  loadOrCreateKey() {
    const configured = decodeConfiguredKey(process.env.HAZY_MASTER_KEY);
    if (configured) return configured;
    if (process.env.HAZY_MASTER_KEY) throw new Error("HAZY_MASTER_KEY must encode exactly 32 bytes.");

    if (fs.existsSync(this.keyPath)) {
      const stored = decodeConfiguredKey(fs.readFileSync(this.keyPath, "utf8"));
      if (!stored) throw new Error(`Invalid Hazy vault key at ${this.keyPath}`);
      return stored;
    }

    fs.mkdirSync(path.dirname(this.keyPath), { recursive: true });
    const key = crypto.randomBytes(32);
    try {
      fs.writeFileSync(this.keyPath, key.toString("base64"), { mode: 0o600, flag: 'wx' });
    } catch (error) {
      if (error.code !== 'EEXIST') throw error;
      const existing = decodeConfiguredKey(fs.readFileSync(this.keyPath, 'utf8'));
      if (!existing) throw new Error('Invalid existing vault key.');
      return existing;
    }
    try {
      fs.chmodSync(this.keyPath, 0o600);
    } catch {
      // Windows protects this file through the current user's filesystem account.
    }
    return key;
  }

  set(provider, secret) {
    const name = String(provider || "").trim().toLowerCase();
    const value = String(secret || "").trim();
    if (!name) throw new Error("Provider is required.");
    if (!value) {
      this.delete(name);
      return false;
    }

    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv("aes-256-gcm", this.key, iv);
    cipher.setAAD(Buffer.from(name));
    const ciphertext = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
    const authTag = cipher.getAuthTag();
    const timestamp = new Date().toISOString();
    this.db.prepare(`
      INSERT INTO provider_secrets(provider, ciphertext, iv, auth_tag, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(provider) DO UPDATE SET
        ciphertext = excluded.ciphertext,
        iv = excluded.iv,
        auth_tag = excluded.auth_tag,
        updated_at = excluded.updated_at
    `).run(
      name,
      ciphertext.toString("base64"),
      iv.toString("base64"),
      authTag.toString("base64"),
      timestamp,
      timestamp
    );
    return true;
  }

  get(provider) {
    const name = String(provider || "").trim().toLowerCase();
    const row = this.db.prepare(
      "SELECT ciphertext, iv, auth_tag FROM provider_secrets WHERE provider = ?"
    ).get(name);
    if (!row) return "";

    const decipher = crypto.createDecipheriv(
      "aes-256-gcm",
      this.key,
      Buffer.from(row.iv, "base64")
    );
    decipher.setAAD(Buffer.from(name));
    decipher.setAuthTag(Buffer.from(row.auth_tag, "base64"));
    return Buffer.concat([
      decipher.update(Buffer.from(row.ciphertext, "base64")),
      decipher.final()
    ]).toString("utf8");
  }

  has(provider) {
    return Boolean(this.db.prepare(
      "SELECT 1 AS present FROM provider_secrets WHERE provider = ?"
    ).get(String(provider || "").trim().toLowerCase()));
  }

  delete(provider) {
    return this.db.prepare(
      "DELETE FROM provider_secrets WHERE provider = ?"
    ).run(String(provider || "").trim().toLowerCase()).changes > 0;
  }
}

module.exports = { SecretVault };
