const fs = require("fs");
const path = require("path");
const { summarizeConversation } = require("./conversationSummary");
const { UserProfileStore } = require("./userProfileStore");

class MemoryManager {
  constructor(baseDir) {
    this.baseDir = baseDir;
    this.filePath = path.join(baseDir, "conversation-memory.json");
    this.profileStore = new UserProfileStore(baseDir);
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

  getConversation(conversationId = "default") {
    const all = this.readAll();
    return all[conversationId] || { turns: [], summaries: [], projectFacts: [] };
  }

  getRelevantMemory({ conversationId = "default", userId = "default" } = {}) {
    const conversation = this.getConversation(conversationId);
    const profile = this.profileStore.getProfile(userId);
    const lastTurns = conversation.turns.slice(-6).map((turn) => ({
      type: "recent_turn",
      summary: `${turn.role}: ${turn.content.slice(0, 180)}`
    }));
    const projectFacts = (conversation.projectFacts || []).slice(-4).map((fact) => ({
      type: "project_fact",
      summary: fact
    }));

    const preferenceFacts = Object.entries(profile.preferences || {}).map(([key, value]) => ({
      type: "preference",
      summary: `${key}: ${value}`
    }));

    return [...preferenceFacts, ...projectFacts, ...lastTurns].slice(0, 10);
  }

  recordTurn({ conversationId = "default", userId = "default", userMessage, finalResponse, analysis, profileHints = {} }) {
    const all = this.readAll();
    const current = this.getConversation(conversationId);

    current.turns.push({ role: "user", content: userMessage, ts: Date.now() });
    current.turns.push({ role: "assistant", content: finalResponse, ts: Date.now(), analysis });

    if (current.turns.length > 40) {
      current.summaries.push(summarizeConversation(current.turns).summary);
      current.turns = current.turns.slice(-20);
    }

    all[conversationId] = current;
    this.writeAll(all);

    if (Object.keys(profileHints).length) {
      this.profileStore.updateProfile(userId, { preferences: profileHints });
    }
  }
}

module.exports = { MemoryManager };
