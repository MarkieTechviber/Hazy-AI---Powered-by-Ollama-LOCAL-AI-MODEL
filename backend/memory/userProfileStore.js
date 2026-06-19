'use strict';

const fs = require("fs");
const path = require("path");
const { containsSecret } = require("./memoryExtractor");

function isPlainObject(value) {
  return value && typeof value === "object" && !Array.isArray(value);
}

function safeParseJson(raw, fallback = {}) {
  try {
    const parsed = JSON.parse(raw || "{}");
    return isPlainObject(parsed) ? parsed : fallback;
  } catch {
    return fallback;
  }
}

function jsonSafe(value, fallback = "") {
  try {
    JSON.stringify(value);
    return value;
  } catch {
    return fallback;
  }
}

function safeValueForSecretScan(value) {
  try {
    return typeof value === "string" ? value : JSON.stringify(value);
  } catch {
    return String(value || "");
  }
}

function uniqueArray(values = [], limit = 50) {
  const seen = new Set();
  const result = [];
  for (const value of values) {
    const item = typeof value === "string" ? value.trim() : jsonSafe(value, null);
    if (!item || containsSecret(safeValueForSecretScan(item))) continue;
    const key = JSON.stringify(item);
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(item);
    if (result.length >= limit) break;
  }
  return result;
}

function stripUnsafePreferences(preferences = {}) {
  const safe = {};
  if (!isPlainObject(preferences)) return safe;
  for (const [key, value] of Object.entries(preferences)) {
    const cleanKey = String(key || "").trim().slice(0, 120);
    if (!cleanKey) continue;
    if (containsSecret(`${cleanKey} ${safeValueForSecretScan(value)}`)) continue;
    safe[cleanKey] = jsonSafe(value, String(value || ""));
  }
  return safe;
}

function sanitizePatch(patch = {}) {
  const safe = {};
  if (!isPlainObject(patch)) return safe;
  for (const [key, value] of Object.entries(patch)) {
    if (["preferences", "projects", "toneHistory", "userId"].includes(key)) continue;
    if (containsSecret(`${key} ${safeValueForSecretScan(value)}`)) continue;
    safe[key] = jsonSafe(value, null);
  }
  return safe;
}

class UserProfileStore {
  constructor(baseDir) {
    this.baseDir = baseDir;
    this.filePath = path.join(baseDir, "user-profiles.json");
  }

  ensureFile() {
    if (!fs.existsSync(this.baseDir)) {
      fs.mkdirSync(this.baseDir, { recursive: true });
    }
    if (!fs.existsSync(this.filePath)) {
      fs.writeFileSync(this.filePath, JSON.stringify({}, null, 2));
    }
  }

  readAll() {
    this.ensureFile();
    const raw = fs.readFileSync(this.filePath, "utf8");
    const parsed = safeParseJson(raw, null);
    if (parsed) return parsed;

    const backupPath = `${this.filePath}.corrupt.${Date.now()}.bak`;
    fs.writeFileSync(backupPath, raw);
    fs.writeFileSync(this.filePath, JSON.stringify({}, null, 2));
    return {};
  }

  writeAll(data) {
    this.ensureFile();
    const safeData = isPlainObject(data) ? data : {};
    const tmpPath = `${this.filePath}.${process.pid}.${Date.now()}.tmp`;
    fs.writeFileSync(tmpPath, JSON.stringify(safeData, null, 2));
    fs.renameSync(tmpPath, this.filePath);
  }

  getProfile(userId = "default") {
    const all = this.readAll();
    const current = isPlainObject(all[userId]) ? all[userId] : {};

    // Important: normalize AFTER spreading current. The old version spread
    // current last, so invalid stored shapes could overwrite these defaults.
    return {
      ...current,
      userId,
      preferences: isPlainObject(current.preferences) ? stripUnsafePreferences(current.preferences) : {},
      projects: Array.isArray(current.projects) ? uniqueArray(current.projects, 100) : [],
      toneHistory: Array.isArray(current.toneHistory) ? uniqueArray(current.toneHistory, 100).slice(-50) : []
    };
  }

  updateProfile(userId = "default", patch = {}) {
    const all = this.readAll();
    const current = this.getProfile(userId);
    const safePatch = sanitizePatch(patch);

    all[userId] = {
      ...current,
      ...safePatch,
      userId,
      preferences: {
        ...(current.preferences || {}),
        ...stripUnsafePreferences(patch.preferences || {})
      },
      projects: uniqueArray([
        ...(Array.isArray(current.projects) ? current.projects : []),
        ...(Array.isArray(patch.projects) ? patch.projects : [])
      ], 100),
      toneHistory: uniqueArray([
        ...(Array.isArray(current.toneHistory) ? current.toneHistory : []),
        ...(Array.isArray(patch.toneHistory) ? patch.toneHistory : [])
      ], 100).slice(-50)
    };

    this.writeAll(all);
    return all[userId];
  }
}

module.exports = { UserProfileStore };
