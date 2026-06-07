const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { summarizeConversation } = require("./conversationSummary");
const { extractMemoryCandidates, SECRET_PATTERN } = require("./memoryExtractor");
const { HazyDatabase } = require("../storage/hazyDatabase");

function now() {
  return new Date().toISOString();
}

function parseJson(value, fallback = null) {
  try {
    return value ? JSON.parse(value) : fallback;
  } catch {
    return fallback;
  }
}

class MemoryManager {
  constructor(baseDir, options = {}) {
    this.baseDir = baseDir;
    this.database = options.database || new HazyDatabase(
      options.databasePath || path.join(baseDir, "hazy.db")
    );
    this.db = this.database.db;
    this.migrateLegacyJson();
  }

  migrateLegacyJson() {
    const marker = this.db.prepare(
      "SELECT version FROM schema_migrations WHERE version = 100"
    ).get();
    if (marker) return;

    const conversationPath = path.join(this.baseDir, "conversation-memory.json");
    const profilePath = path.join(this.baseDir, "user-profiles.json");
    const conversations = fs.existsSync(conversationPath)
      ? parseJson(fs.readFileSync(conversationPath, "utf8"), {})
      : {};
    const profiles = fs.existsSync(profilePath)
      ? parseJson(fs.readFileSync(profilePath, "utf8"), {})
      : {};

    this.db.exec("BEGIN IMMEDIATE");
    try {
      for (const [conversationId, conversation] of Object.entries(conversations)) {
        const userId = "default";
        this.ensureConversation(conversationId, userId);
        for (const turn of conversation.turns || []) {
          this.insertMessage({
            conversationId,
            userId,
            role: turn.role,
            content: turn.content,
            analysis: turn.analysis,
            createdAt: turn.ts ? new Date(turn.ts).toISOString() : now()
          });
        }
        for (const summary of conversation.summaries || []) {
          this.insertSummary(conversationId, summary);
        }
        for (const fact of conversation.projectFacts || []) {
          if (SECRET_PATTERN.test(String(fact))) continue;
          this.upsertMemory({
            userId,
            conversationId,
            type: "project_fact",
            key: String(fact).slice(0, 80),
            value: String(fact),
            confidence: 0.75,
            source: "legacy_json"
          });
        }
      }

      for (const [userId, profile] of Object.entries(profiles)) {
        for (const [key, value] of Object.entries(profile.preferences || {})) {
          if (SECRET_PATTERN.test(`${key} ${value}`)) continue;
          this.upsertMemory({
            userId,
            type: "preference",
            key,
            value: String(value),
            confidence: 0.9,
            source: "legacy_json"
          });
        }
      }

      this.db.prepare(
        "INSERT INTO schema_migrations(version, applied_at) VALUES (100, ?)"
      ).run(now());
      this.db.exec("COMMIT");
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
  }

  ensureConversation(conversationId, userId = "default", projectId = "") {
    const timestamp = now();
    this.db.prepare(`
      INSERT INTO conversations(id, user_id, project_id, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        user_id = excluded.user_id,
        project_id = excluded.project_id,
        updated_at = excluded.updated_at
    `).run(conversationId, userId, projectId || "", timestamp, timestamp);
  }

  insertMessage({ conversationId, userId, role, content, analysis, createdAt = now() }) {
    this.db.prepare(`
      INSERT INTO messages(id, conversation_id, user_id, role, content, analysis_json, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      crypto.randomUUID(),
      conversationId,
      userId,
      role,
      String(content || ""),
      analysis ? JSON.stringify(analysis) : null,
      createdAt
    );
  }

  insertSummary(conversationId, summary) {
    this.db.prepare(`
      INSERT INTO conversation_summaries(id, conversation_id, summary, created_at)
      VALUES (?, ?, ?, ?)
    `).run(crypto.randomUUID(), conversationId, String(summary), now());
  }

  getConversation(conversationId = "default") {
    const turns = this.db.prepare(`
      SELECT role, content, analysis_json, created_at
      FROM messages
      WHERE conversation_id = ?
      ORDER BY created_at ASC, rowid ASC
    `).all(conversationId).map((row) => ({
      role: row.role,
      content: row.content,
      ts: Date.parse(row.created_at),
      ...(row.analysis_json ? { analysis: parseJson(row.analysis_json, {}) } : {})
    }));
    const summaries = this.db.prepare(`
      SELECT summary FROM conversation_summaries
      WHERE conversation_id = ?
      ORDER BY created_at ASC, rowid ASC
    `).all(conversationId).map((row) => row.summary);
    const projectFacts = this.db.prepare(`
      SELECT value FROM memories
      WHERE conversation_id = ? AND type = 'project_fact' AND status = 'active'
      ORDER BY updated_at ASC
    `).all(conversationId).map((row) => row.value);
    return { turns, summaries, projectFacts };
  }

  listConversationStates(userId = "local-user") {
    return this.db.prepare(`
      SELECT conversation_id AS conversationId, state_json AS stateJson
      FROM conversation_states
      WHERE user_id = ?
      ORDER BY updated_at DESC
    `).all(userId).reduce((states, row) => {
      const state = parseJson(row.stateJson, null);
      if (state) states[row.conversationId] = state;
      return states;
    }, {});
  }

  saveConversationStates(conversations = {}, userId = "local-user") {
    const timestamp = now();
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const keepIds = [];
      for (const [conversationId, state] of Object.entries(conversations || {})) {
        keepIds.push(conversationId);
        const createdAt = new Date(state.createdAt || Date.now()).toISOString();
        this.db.prepare(`
          INSERT INTO conversations(id, user_id, project_id, title, created_at, updated_at)
          VALUES (?, ?, '', ?, ?, ?)
          ON CONFLICT(id) DO UPDATE SET
            user_id = excluded.user_id,
            title = excluded.title,
            updated_at = excluded.updated_at
        `).run(
          conversationId,
          userId,
          String(state.title || "New Chat").slice(0, 200),
          createdAt,
          timestamp
        );
        this.db.prepare(`
          INSERT INTO conversation_states(
            conversation_id, user_id, state_json, created_at, updated_at
          )
          VALUES (?, ?, ?, ?, ?)
          ON CONFLICT(conversation_id) DO UPDATE SET
            user_id = excluded.user_id,
            state_json = excluded.state_json,
            updated_at = excluded.updated_at
        `).run(
          conversationId,
          userId,
          JSON.stringify(state),
          createdAt,
          timestamp
        );
      }

      if (keepIds.length) {
        const placeholders = keepIds.map(() => "?").join(",");
        this.db.prepare(`
          DELETE FROM conversations
          WHERE user_id = ? AND id NOT IN (${placeholders})
        `).run(userId, ...keepIds);
      } else {
        this.db.prepare("DELETE FROM conversations WHERE user_id = ?").run(userId);
      }
      this.db.exec("COMMIT");
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
  }

  deleteConversationState(conversationId, userId = "local-user") {
    const existing = this.db.prepare(
      "SELECT 1 AS present FROM conversations WHERE id = ? AND user_id = ?"
    ).get(conversationId, userId);
    if (!existing) return false;
    this.db.prepare("DELETE FROM conversations WHERE id = ? AND user_id = ?")
      .run(conversationId, userId);
    return true;
  }

  listMemories({ userId = "default", projectId, status = "active", limit = 100 } = {}) {
    const clauses = ["user_id = ?"];
    const params = [userId];
    if (projectId !== undefined) {
      clauses.push("project_id = ?");
      params.push(projectId || "");
    }
    if (status && status !== "all") {
      clauses.push("status = ?");
      params.push(status);
    }
    params.push(Math.max(1, Math.min(Number(limit) || 100, 500)));
    return this.db.prepare(`
      SELECT id, user_id AS userId, project_id AS projectId,
        conversation_id AS conversationId, type, key, value, confidence,
        sensitivity, status, created_at AS createdAt, updated_at AS updatedAt,
        last_used_at AS lastUsedAt, expires_at AS expiresAt
      FROM memories
      WHERE ${clauses.join(" AND ")}
      ORDER BY confidence DESC, updated_at DESC
      LIMIT ?
    `).all(...params);
  }

  upsertMemory({
    id,
    userId = "default",
    projectId = "",
    conversationId = "",
    type = "explicit_fact",
    key,
    value,
    confidence = 1,
    sensitivity = "normal",
    sourceMessageId = null,
    status = "active",
    expiresAt = null
  }) {
    if (!key || !String(value || "").trim()) {
      throw new Error("Memory key and value are required.");
    }
    if (SECRET_PATTERN.test(`${key} ${value}`)) {
      throw new Error("Credentials and secrets cannot be stored as companion memory.");
    }
    const timestamp = now();
    const memoryId = id || crypto.randomUUID();
    this.db.prepare(`
      INSERT INTO memories(
        id, user_id, project_id, conversation_id, type, key, value,
        confidence, sensitivity, source_message_id, status,
        created_at, updated_at, expires_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(user_id, project_id, type, key) DO UPDATE SET
        conversation_id = excluded.conversation_id,
        value = excluded.value,
        confidence = excluded.confidence,
        sensitivity = excluded.sensitivity,
        source_message_id = excluded.source_message_id,
        status = excluded.status,
        updated_at = excluded.updated_at,
        expires_at = excluded.expires_at
    `).run(
      memoryId, userId, projectId || "", conversationId || "", type,
      String(key).slice(0, 120), String(value).trim().slice(0, 2000),
      Math.max(0, Math.min(Number(confidence) || 0, 1)), sensitivity,
      sourceMessageId, status, timestamp, timestamp, expiresAt
    );
    return this.db.prepare(`
      SELECT id, user_id AS userId, project_id AS projectId,
        conversation_id AS conversationId, type, key, value, confidence,
        sensitivity, status, created_at AS createdAt, updated_at AS updatedAt,
        last_used_at AS lastUsedAt, expires_at AS expiresAt
      FROM memories WHERE user_id = ? AND project_id = ? AND type = ? AND key = ?
    `).get(userId, projectId || "", type, String(key).slice(0, 120));
  }

  setMemoryStatus(id, userId = "default", status = "active") {
    if (!["active", "disabled"].includes(status)) {
      throw new Error("Memory status must be active or disabled.");
    }
    const result = this.db.prepare(`
      UPDATE memories SET status = ?, updated_at = ?
      WHERE id = ? AND user_id = ?
    `).run(status, now(), id, userId);
    return result.changes > 0;
  }

  deleteMemory(id, userId = "default") {
    return this.db.prepare(
      "DELETE FROM memories WHERE id = ? AND user_id = ?"
    ).run(id, userId).changes > 0;
  }

  getRelevantMemory({
    conversationId = "default",
    userId = "default",
    projectId = ""
  } = {}) {
    const conversation = this.getConversation(conversationId);
    const durable = this.db.prepare(`
      SELECT id, type, key, value, confidence
      FROM memories
      WHERE user_id = ?
        AND status = 'active'
        AND (project_id = '' OR project_id = ?)
        AND (expires_at IS NULL OR expires_at > ?)
      ORDER BY
        CASE WHEN conversation_id = ? THEN 0 ELSE 1 END,
        confidence DESC,
        updated_at DESC
      LIMIT 8
    `).all(userId, projectId || "", now(), conversationId);

    if (durable.length) {
      const timestamp = now();
      const update = this.db.prepare("UPDATE memories SET last_used_at = ? WHERE id = ?");
      for (const memory of durable) update.run(timestamp, memory.id);
    }

    const memories = durable.map((item) => ({
      id: item.id,
      type: item.type,
      summary: `${item.key}: ${item.value}`,
      confidence: item.confidence
    }));
    const conversationSummaries = conversation.summaries.slice(-2).map((summary) => ({
      type: "conversation_summary",
      summary
    }));
    const lastTurns = conversation.turns.slice(-6).map((turn) => ({
      type: "recent_turn",
      summary: `${turn.role}: ${turn.content.slice(0, 180)}`
    }));
    return [...memories, ...conversationSummaries, ...lastTurns].slice(0, 12);
  }

  recordTurn({
    conversationId = "default",
    userId = "default",
    projectId = "",
    userMessage,
    finalResponse,
    analysis,
    profileHints = {}
  }) {
    this.ensureConversation(conversationId, userId, projectId);
    this.insertMessage({ conversationId, userId, role: "user", content: userMessage });
    this.insertMessage({
      conversationId,
      userId,
      role: "assistant",
      content: finalResponse,
      analysis
    });

    for (const candidate of extractMemoryCandidates(userMessage)) {
      this.upsertMemory({
        ...candidate,
        userId,
        projectId,
        conversationId
      });
    }
    for (const [key, value] of Object.entries(profileHints)) {
      this.upsertMemory({
        userId,
        projectId: "",
        conversationId,
        type: "preference",
        key,
        value: String(value),
        confidence: 0.7
      });
    }

    const current = this.getConversation(conversationId);
    if (current.turns.length > 40) {
      this.insertSummary(conversationId, summarizeConversation(current.turns).summary);
      const keepIds = this.db.prepare(`
        SELECT id FROM messages
        WHERE conversation_id = ?
        ORDER BY created_at DESC, rowid DESC
        LIMIT 20
      `).all(conversationId).map((row) => row.id);
      if (keepIds.length) {
        const placeholders = keepIds.map(() => "?").join(",");
        this.db.prepare(`
          DELETE FROM messages
          WHERE conversation_id = ? AND id NOT IN (${placeholders})
        `).run(conversationId, ...keepIds);
      }
    }
  }
}

module.exports = { MemoryManager };
