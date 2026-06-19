'use strict';

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { summarizeConversation, clampText } = require("./conversationSummary");
const {
  extractMemoryCandidates,
  extractMemoryRemovals,
  extractAgentTrajectoryCandidates,
  SECRET_PATTERN,
  containsSecret,
  cleanValue,
  makeKey,
  normalizeMemoryType: sharedNormalizeMemoryType,
  AGENT_MEMORY_TYPES
} = require("./memoryExtractor");
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

function safeStringify(value, limit = 20_000) {
  try {
    return JSON.stringify(value).slice(0, limit);
  } catch {
    return JSON.stringify({ error: "analysis_not_serializable" });
  }
}

function isPlainObject(value) {
  return value && typeof value === "object" && !Array.isArray(value);
}

function clampConfidence(value, fallback = 0.5) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.max(0, Math.min(number, 1));
}

function isValidDate(value) {
  if (!value) return false;
  const time = Date.parse(value);
  return Number.isFinite(time);
}

function normalizeStatus(status) {
  return ["active", "disabled"].includes(status) ? status : "active";
}

function normalizeSensitivity(sensitivity) {
  return ["normal", "personal"].includes(sensitivity) ? sensitivity : "normal";
}

function normalizeMemoryType(type) {
  const cleaned = cleanValue(type || "explicit_fact", 60)
    .toLowerCase()
    .replace(/[^a-z0-9_:-]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return cleaned || "explicit_fact";
}

function safeIso(value, fallback = now()) {
  if (!value) return fallback;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? fallback : date.toISOString();
}

function tokenizeForSearch(value) {
  return cleanValue(value, 1000)
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((token) => token.length >= 3)
    .filter((token) => !new Set([
      "the", "and", "for", "that", "this", "with", "from", "you", "your",
      "about", "what", "when", "where", "how", "why", "are", "was", "were"
    ]).has(token));
}

function scoreMemoryForQuery(memory, queryTokens, conversationId) {
  let score = Number(memory.confidence || 0) * 10;
  if (memory.conversation_id === conversationId) score += 3;
  if (!queryTokens.length) return score;

  const haystack = `${memory.type} ${memory.key} ${memory.value}`.toLowerCase();
  for (const token of queryTokens) {
    if (haystack.includes(token)) score += 4;
  }
  return score;
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
      for (const [conversationId, conversation] of Object.entries(conversations || {})) {
        const userId = "default";
        this.ensureConversation(conversationId, userId);
        for (const turn of conversation.turns || []) {
          this.insertMessage({
            conversationId,
            userId,
            role: turn.role,
            content: turn.content,
            analysis: turn.analysis,
            createdAt: turn.ts ? safeIso(turn.ts) : now()
          });
        }
        for (const summary of conversation.summaries || []) {
          this.insertSummary(conversationId, summary);
        }
        for (const fact of conversation.projectFacts || []) {
          if (containsSecret(String(fact))) continue;
          this.upsertMemory({
            userId,
            conversationId,
            type: "project_fact",
            key: makeKey(String(fact)),
            value: String(fact),
            confidence: 0.75,
            source: "legacy_json"
          });
        }
      }

      for (const [userId, profile] of Object.entries(profiles || {})) {
        for (const [key, value] of Object.entries(profile.preferences || {})) {
          if (containsSecret(`${key} ${value}`)) continue;
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
        project_id = CASE
          WHEN excluded.project_id != '' THEN excluded.project_id
          ELSE conversations.project_id
        END,
        updated_at = excluded.updated_at
    `).run(conversationId, userId, projectId || "", timestamp, timestamp);
  }

  insertMessage({ conversationId, userId, role, content, analysis, createdAt = now() }) {
    const id = crypto.randomUUID();
    const safeRole = ["user", "assistant", "system", "tool"].includes(role) ? role : "user";
    this.db.prepare(`
      INSERT INTO messages(id, conversation_id, user_id, role, content, analysis_json, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      conversationId,
      userId,
      safeRole,
      String(content || "").slice(0, 20_000),
      analysis ? safeStringify(analysis, 20_000) : null,
      safeIso(createdAt)
    );
    return id;
  }

  insertSummary(conversationId, summary) {
    const safeSummary = clampText(summary, 1600);
    if (!safeSummary) return null;

    const latest = this.db.prepare(`
      SELECT summary FROM conversation_summaries
      WHERE conversation_id = ?
      ORDER BY created_at DESC, rowid DESC
      LIMIT 1
    `).get(conversationId);
    if (latest?.summary === safeSummary) return null;

    const id = crypto.randomUUID();
    this.db.prepare(`
      INSERT INTO conversation_summaries(id, conversation_id, summary, created_at)
      VALUES (?, ?, ?, ?)
    `).run(id, conversationId, safeSummary, now());

    const keepIds = this.db.prepare(`
      SELECT id FROM conversation_summaries
      WHERE conversation_id = ?
      ORDER BY created_at DESC, rowid DESC
      LIMIT 12
    `).all(conversationId).map((row) => row.id);
    if (keepIds.length) {
      const placeholders = keepIds.map(() => "?").join(",");
      this.db.prepare(`
        DELETE FROM conversation_summaries
        WHERE conversation_id = ? AND id NOT IN (${placeholders})
      `).run(conversationId, ...keepIds);
    }

    return id;
  }

  getConversation(conversationId = "default", userId = null) {
    const userClause = userId ? " AND user_id = ?" : "";
    const params = userId ? [conversationId, userId] : [conversationId];

    const turns = this.db.prepare(`
      SELECT role, content, analysis_json, created_at
      FROM messages
      WHERE conversation_id = ?${userClause}
      ORDER BY created_at ASC, rowid ASC
    `).all(...params).map((row) => ({
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

  saveConversationStates(conversations = {}, userId = "local-user", options = {}) {
    const timestamp = now();
    const pruneMissing = options.pruneMissing !== false;
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const keepIds = [];
      for (const [conversationId, state] of Object.entries(conversations || {})) {
        keepIds.push(conversationId);
        const createdAt = safeIso(state?.createdAt || Date.now());
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
          String(state?.title || "New Chat").slice(0, 200),
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
          safeStringify(state || {}, 500_000),
          createdAt,
          timestamp
        );
      }

      // Browser UI syncs send the complete conversation map, so missing IDs
      // are treated as deleted unless pruneMissing is explicitly false.
      if (pruneMissing) {
        if (keepIds.length) {
          const placeholders = keepIds.map(() => "?").join(",");
          this.db.prepare(`
            DELETE FROM conversation_states
            WHERE user_id = ? AND conversation_id NOT IN (${placeholders})
          `).run(userId, ...keepIds);
        } else {
          this.db.prepare("DELETE FROM conversation_states WHERE user_id = ?").run(userId);
        }
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
    this.db.exec("BEGIN IMMEDIATE");
    try {
      this.db.prepare("DELETE FROM conversation_states WHERE conversation_id = ? AND user_id = ?")
        .run(conversationId, userId);
      this.db.prepare("DELETE FROM conversations WHERE id = ? AND user_id = ?")
        .run(conversationId, userId);
      this.db.exec("COMMIT");
      return true;
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
  }

  listMemories({ userId = "default", projectId, status = "active", limit = 100, includeExpired = false } = {}) {
    const clauses = ["user_id = ?"];
    const params = [userId];
    if (projectId !== undefined) {
      clauses.push("project_id = ?");
      params.push(projectId || "");
    }
    if (status && status !== "all") {
      clauses.push("status = ?");
      params.push(normalizeStatus(status));
    }
    if (!includeExpired && status !== "all") {
      clauses.push("(expires_at IS NULL OR expires_at > ?)");
      params.push(now());
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
    const normalizedKey = makeKey(key || value).slice(0, 120);
    const normalizedValue = cleanValue(value, 2000);
    const safeType = normalizeMemoryType(type);
    if (!normalizedKey || !normalizedValue) {
      throw new Error("Memory key and value are required.");
    }
    if (containsSecret(`${normalizedKey} ${normalizedValue}`)) {
      throw new Error("Credentials and secrets cannot be stored as companion memory.");
    }

    const timestamp = now();
    const memoryId = id || crypto.randomUUID();
    const boundedConfidence = clampConfidence(confidence, 0.5);
    const safeSensitivity = normalizeSensitivity(sensitivity);
    const safeStatus = normalizeStatus(status);
    const safeExpiresAt = isValidDate(expiresAt) ? new Date(expiresAt).toISOString() : null;

    this.db.prepare(`
      INSERT INTO memories(
        id, user_id, project_id, conversation_id, type, key, value,
        confidence, sensitivity, source_message_id, status,
        created_at, updated_at, expires_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(user_id, project_id, type, key) DO UPDATE SET
        conversation_id = CASE
          WHEN excluded.conversation_id != '' THEN excluded.conversation_id
          ELSE memories.conversation_id
        END,
        value = CASE
          WHEN excluded.confidence >= memories.confidence OR memories.status = 'disabled'
          THEN excluded.value ELSE memories.value
        END,
        confidence = MAX(memories.confidence, excluded.confidence),
        sensitivity = CASE
          WHEN memories.sensitivity = 'personal' OR excluded.sensitivity = 'personal'
          THEN 'personal' ELSE excluded.sensitivity
        END,
        source_message_id = COALESCE(excluded.source_message_id, memories.source_message_id),
        status = excluded.status,
        updated_at = excluded.updated_at,
        expires_at = CASE
          WHEN excluded.confidence >= memories.confidence OR memories.status = 'disabled'
          THEN excluded.expires_at ELSE memories.expires_at
        END
    `).run(
      memoryId, userId, projectId || "", conversationId || "", safeType,
      normalizedKey, normalizedValue,
      boundedConfidence, safeSensitivity,
      sourceMessageId, safeStatus, timestamp, timestamp, safeExpiresAt
    );
    return this.db.prepare(`
      SELECT id, user_id AS userId, project_id AS projectId,
        conversation_id AS conversationId, type, key, value, confidence,
        sensitivity, status, created_at AS createdAt, updated_at AS updatedAt,
        last_used_at AS lastUsedAt, expires_at AS expiresAt
      FROM memories WHERE user_id = ? AND project_id = ? AND type = ? AND key = ?
    `).get(userId, projectId || "", safeType, normalizedKey);
  }

  setMemoryStatus(id, userId = "default", status = "active") {
    const safeStatus = normalizeStatus(status);
    const result = this.db.prepare(`
      UPDATE memories SET status = ?, updated_at = ?
      WHERE id = ? AND user_id = ?
    `).run(safeStatus, now(), id, userId);
    return result.changes > 0;
  }

  deleteMemory(id, userId = "default") {
    return this.db.prepare(
      "DELETE FROM memories WHERE id = ? AND user_id = ?"
    ).run(id, userId).changes > 0;
  }

  forgetMemories({ userId = "default", projectId = "", target = "" } = {}) {
    const cleaned = cleanValue(target, 300).toLowerCase();
    if (!cleaned) return 0;

    const timestamp = now();
    const wantsAll = /^(all|everything|all memories|my memories|what you know)$/i.test(cleaned);
    if (wantsAll) {
      return this.db.prepare(`
        UPDATE memories SET status = 'disabled', updated_at = ?
        WHERE user_id = ? AND status = 'active'
      `).run(timestamp, userId).changes;
    }

    const keyNeedle = `%${makeKey(cleaned)}%`;
    const textNeedle = `%${cleaned}%`;
    const loose = cleaned.replace(/\b(my|the|a|an)\b/g, "").replace(/\s+/g, " ").trim();
    const looseNeedle = `%${loose}%`;

    return this.db.prepare(`
      UPDATE memories SET status = 'disabled', updated_at = ?
      WHERE user_id = ?
        AND status = 'active'
        AND (project_id = '' OR project_id = ?)
        AND (
          LOWER(key) LIKE ?
          OR LOWER(value) LIKE ?
          OR LOWER(value) LIKE ?
        )
    `).run(timestamp, userId, projectId || "", keyNeedle, textNeedle, looseNeedle).changes;
  }

  getRelevantMemory({
    conversationId = "default",
    userId = "default",
    projectId = "",
    query = "",
    limit = 12
  } = {}) {
    const conversation = this.getConversation(conversationId, userId);
    const timestamp = now();
    const queryTokens = tokenizeForSearch(query || conversation.turns.at?.(-1)?.content || "");
    const memoryLimit = Math.max(1, Math.min(Number(limit) || 12, 24));

    const candidates = this.db.prepare(`
      SELECT id, conversation_id, type, key, value, confidence
      FROM memories
      WHERE user_id = ?
        AND status = 'active'
        AND (project_id = '' OR project_id = ?)
        AND (expires_at IS NULL OR expires_at > ?)
        AND (type NOT IN ('project_fact', 'agent_plan', 'agent_step', 'failed_attempt', 'artifact_ref', 'unresolved_question') OR conversation_id = ?)
      ORDER BY
        CASE WHEN conversation_id = ? THEN 0 ELSE 1 END,
        confidence DESC,
        updated_at DESC
      LIMIT 40
    `).all(userId, projectId || "", timestamp, conversationId, conversationId);

    const durable = candidates
      .map((memory) => ({
        ...memory,
        relevanceScore: scoreMemoryForQuery(memory, queryTokens, conversationId)
      }))
      .sort((a, b) => b.relevanceScore - a.relevanceScore)
      .slice(0, Math.min(8, memoryLimit));

    if (durable.length) {
      const update = this.db.prepare("UPDATE memories SET last_used_at = ? WHERE id = ?");
      for (const memory of durable) update.run(timestamp, memory.id);
    }

    const memories = durable.map((item) => ({
      id: item.id,
      type: item.type,
      summary: `${item.key}: ${item.value}`,
      confidence: item.confidence,
      relevanceScore: item.relevanceScore
    }));
    const conversationSummaries = conversation.summaries.slice(-2).map((summary) => ({
      type: "conversation_summary",
      summary: clampText(summary, 800)
    })).filter((item) => item.summary);
    const lastTurns = conversation.turns
      .filter((turn) => ["user", "assistant"].includes(turn.role))
      .slice(-6)
      .map((turn) => ({
        type: "recent_turn",
        summary: `${turn.role}: ${clampText(turn.content, 180)}`
      }))
      .filter((turn) => !/^(user|assistant):\s*$/i.test(turn.summary.trim()));
    return [...memories, ...conversationSummaries, ...lastTurns].slice(0, memoryLimit);
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
    this.db.exec("BEGIN IMMEDIATE");
    try {
      this.ensureConversation(conversationId, userId, projectId);
      const userMessageId = this.insertMessage({ conversationId, userId, role: "user", content: userMessage });
      this.insertMessage({
        conversationId,
        userId,
        role: "assistant",
        content: finalResponse,
        analysis
      });

      const removals = extractMemoryRemovals(userMessage);
      for (const removal of removals) {
        this.forgetMemories({ userId, projectId, target: removal.target });
      }

      if (!removals.length) {
        for (const candidate of extractMemoryCandidates(userMessage)) {
          try {
            this.upsertMemory({
              ...candidate,
              userId,
              projectId,
              conversationId,
              sourceMessageId: userMessageId
            });
          } catch (error) {
            if (!/secrets cannot be stored/i.test(error.message)) throw error;
          }
        }
        // Extended for Phase 3 agent-specific candidates (from user turn content; tool/plan trajectory handled in sync_turn too).
        // Guarded to avoid polluting normal chat memory counts (preserves exact getRelevant + packing math for tests and pre-Phase3 paths).
        if (/\b(?:agent|plan\.manage|trajectory|failed attempt|artifact ref|unresolved question)\b/i.test(userMessage)) {
          for (const candidate of extractAgentTrajectoryCandidates(userMessage, { source: 'recordTurn' })) {
            try {
              this.upsertMemory({
                ...candidate,
                userId,
                projectId,
                conversationId,
                sourceMessageId: userMessageId
              });
            } catch (error) {
              if (!/secrets cannot be stored/i.test(error.message)) throw error;
            }
          }
        }
      }

      if (isPlainObject(profileHints)) {
        for (const [key, value] of Object.entries(profileHints)) {
          if (containsSecret(`${key} ${value}`)) continue;
          this.upsertMemory({
            userId,
            projectId: "",
            conversationId,
            type: "preference",
            key,
            value: String(value),
            confidence: 0.7,
            sourceMessageId: userMessageId
          });
        }
      }

      const current = this.getConversation(conversationId, userId);
      if (current.turns.length > 40) {
        const keepRows = this.db.prepare(`
          SELECT id FROM messages
          WHERE conversation_id = ? AND user_id = ?
          ORDER BY created_at DESC, rowid DESC
          LIMIT 20
        `).all(conversationId, userId);
        const keepIds = keepRows.map((row) => row.id);
        const olderTurns = current.turns.slice(0, Math.max(0, current.turns.length - 20));
        const summary = summarizeConversation(olderTurns).summary;
        if (summary) this.insertSummary(conversationId, summary);

        if (keepIds.length) {
          const placeholders = keepIds.map(() => "?").join(",");
          this.db.prepare(`
            DELETE FROM messages
            WHERE conversation_id = ? AND user_id = ? AND id NOT IN (${placeholders})
          `).run(conversationId, userId, ...keepIds);
        }
      }

      this.db.exec("COMMIT");
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
  }

  // Phase 3 additions (smallest extension of existing MemoryManager as built-in MemoryProvider):
  // support new agent_* types (via DB+normalize already), conversation/project scoping (pre-existing),
  // confidence/salience, on_turn_start/prefetch/sync hooks, remember/search/forget surface for tools.
  // Salience/contradiction: handled in remember() by lowering conf on value conflict for high-conf entries.

  onTurnStart(turnInfo = {}) {
    // cadence hook (non-fatal, for future nudges like _turns_since_memory)
    return;
  }

  async prefetch(query = '', options = {}) {
    const { conversationId = 'default', userId = 'default', projectId = '', planText = '', goal = '' } = options || {};
    const effective = [goal, query, planText].filter(Boolean).join(' ').slice(0, 480);
    try {
      const rel = this.getRelevantMemory
        ? this.getRelevantMemory({ conversationId, userId, projectId, query: effective, limit: 8 })
        : [];
      const agentRows = this.db ? this.db.prepare(`
        SELECT type, key, value, confidence
        FROM memories
        WHERE user_id = ? AND status = 'active'
          AND (project_id = '' OR project_id = ?)
          AND conversation_id = ?
          AND type IN ('agent_plan','agent_step','failed_attempt','artifact_ref','unresolved_question')
        ORDER BY updated_at DESC, confidence DESC LIMIT 6
      `).all(userId, projectId || '', conversationId) : [];
      return [
        ...rel,
        ...agentRows.map(r => ({ type: r.type, key: r.key, value: r.value, confidence: r.confidence, summary: `${r.key}: ${r.value}` }))
      ];
    } catch {
      return [];
    }
  }

  async syncTurn(userContent = '', assistantContent = '', options = {}) {
    const { conversationId = 'default', userId = 'default', projectId = '', messages = null } = options || {};
    try {
      if (this.recordTurn) {
        this.recordTurn({ conversationId, userId, projectId, userMessage: String(userContent || '').slice(0, 4000), finalResponse: String(assistantContent || '').slice(0, 4000) });
      }
    } catch {}
    if (Array.isArray(messages)) {
      for (const m of messages) {
        try {
          if (m.role === 'tool' || m.role === 'assistant') {
            const cands = extractAgentTrajectoryCandidates(m.content || '', { source: 'mm_syncTurn', role: m.role });
            for (const cand of cands) {
              this.upsertMemory({
                userId, projectId, conversationId,
                type: cand.type, key: cand.key, value: cand.value, confidence: cand.confidence || 0.6
              });
            }
          }
        } catch {}
      }
    }
  }

  remember({ type = 'explicit_fact', key, value, confidence = 0.7, userId = 'default', conversationId = '', projectId = '' } = {}) {
    const conf = Number(confidence) || 0.7;
    const normalizedType = sharedNormalizeMemoryType ? sharedNormalizeMemoryType(type) : (type || 'explicit_fact').replace(/[^a-z0-9_:-]+/g, '_');
    try {
      // minimal salience/contradiction detection on upsert (high-conf differing value lowers new conf)
      const normKey = makeKey(key || value);
      const existing = this.db.prepare(
        "SELECT value, confidence FROM memories WHERE user_id = ? AND project_id = ? AND type = ? AND key = ? AND status = 'active'"
      ).get(userId, projectId || '', normalizedType, normKey);
      let finalConf = Math.max(0, Math.min(1, conf));
      if (existing && existing.value && value && String(existing.value) !== String(value) && Number(existing.confidence || 0) > 0.6 && finalConf > 0.6) {
        finalConf = Math.min(finalConf, 0.55);
      }
      return this.upsertMemory({
        userId, projectId, conversationId, type: normalizedType, key: normKey, value, confidence: finalConf
      });
    } catch (e) {
      return { error: e.message };
    }
  }

  searchMemories({ query = '', types = null, limit = 5, userId = 'default', conversationId = '', projectId = '' } = {}) {
    try {
      const tokens = (query || '').toLowerCase().split(/[^a-z0-9]+/).filter(t => t.length >= 3);
      let sql = `SELECT type, key, value, confidence, conversation_id AS conversationId FROM memories
        WHERE user_id = ? AND status = 'active' AND (project_id = '' OR project_id = ?)`;
      const params = [userId, projectId || ''];
      
      if (conversationId) {
        sql += ` AND (type NOT IN ('project_fact', 'agent_plan', 'agent_step', 'failed_attempt', 'artifact_ref', 'unresolved_question') OR conversation_id = ?)`;
        params.push(conversationId);
      }

      if (Array.isArray(types) && types.length) {
        const ph = types.map(() => '?').join(',');
        sql += ` AND type IN (${ph})`;
        params.push(...types);
      }
      sql += ` ORDER BY confidence DESC, updated_at DESC LIMIT ?`;
      params.push(Math.max(1, Math.min(20, Number(limit) || 5)));
      const rows = this.db.prepare(sql).all(...params);
      return rows.map(r => {
        let score = Number(r.confidence || 0) * 10;
        if (r.conversationId === conversationId) score += 3;
        const hay = `${r.type} ${r.key} ${r.value}`.toLowerCase();
        for (const tok of tokens) if (hay.includes(tok)) score += 4;
        return { ...r, relevanceScore: score };
      }).sort((a, b) => b.relevanceScore - a.relevanceScore);
    } catch {
      return [];
    }
  }
}

module.exports = { MemoryManager, normalizeMemoryType: sharedNormalizeMemoryType || require('./memoryExtractor').normalizeMemoryType };
