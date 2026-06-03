const fs = require("fs");
const path = require("path");

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
    return JSON.parse(fs.readFileSync(this.filePath, "utf8"));
  }

  writeAll(data) {
    this.ensureFile();
    fs.writeFileSync(this.filePath, JSON.stringify(data, null, 2));
  }

  getProfile(userId = "default") {
    const all = this.readAll();
    return all[userId] || { userId, preferences: {}, projects: [], toneHistory: [] };
  }

  updateProfile(userId = "default", patch = {}) {
    const all = this.readAll();
    const current = this.getProfile(userId);
    all[userId] = {
      ...current,
      ...patch,
      preferences: { ...(current.preferences || {}), ...(patch.preferences || {}) }
    };
    this.writeAll(all);
    return all[userId];
  }
}

module.exports = { UserProfileStore };
