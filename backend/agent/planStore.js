'use strict';

const crypto = require('crypto');
const fsp = require('fs').promises;
const fs = require('fs');
const path = require('path');

const MAX_TASKS_PER_PLAN = 50;   // FIX: original had no limit — model could add thousands of tasks
const MAX_PLANS_STORED = 200;    // FIX: original Map grew without bound across conversations
const PLAN_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000; // evict plans older than 7 days

function nowIso() {
  return new Date().toISOString();
}

function normalizeStatus(status) {
  const allowed = ['todo', 'in_progress', 'done', 'blocked'];
  return allowed.includes(status) ? status : 'todo';
}

function createTask(description) {
  const cleaned = String(description || '').trim().slice(0, 300);
  if (!cleaned) throw new Error('Task description is required.');
  return {
    id: crypto.randomUUID(),
    description: cleaned,
    status: 'todo',
    createdAt: nowIso(),
    updatedAt: nowIso()
  };
}

class PlanStore {
  constructor({ filePath = null } = {}) {
    this.filePath = filePath;
    this.plans = new Map();
    // FIX: _persistQueue — original persist() used writeFileSync, blocking the event loop on every task mutation.
    this._persistQueue = Promise.resolve();
    this._load();
  }

  // FIX: _load is non-throwing — original constructor could propagate exceptions from load().
  _load() {
    if (!this.filePath) return;
    try {
      if (!fs.existsSync(this.filePath)) return;
      const data = JSON.parse(fs.readFileSync(this.filePath, 'utf8'));
      if (data && typeof data === 'object') {
        for (const [chatId, plan] of Object.entries(data)) {
          if (plan && Array.isArray(plan.tasks)) {
            this.plans.set(chatId, {
              chatId,
              tasks: plan.tasks.slice(0, MAX_TASKS_PER_PLAN).map((t) => ({
                id: t.id || crypto.randomUUID(),
                description: String(t.description || '').slice(0, 300),
                status: normalizeStatus(t.status),
                createdAt: t.createdAt || nowIso(),
                updatedAt: t.updatedAt || nowIso()
              })),
              updatedAt: plan.updatedAt || nowIso()
            });
          }
        }
      }
    } catch (e) {
      console.warn('[PlanStore] load failed (non-fatal):', e?.message || e);
      this.plans.clear();
    }
  }

  // FIX: async persist with tmp-rename atomicity — original was sync.
  _persistAsync() {
    if (!this.filePath) return;
    this._persistQueue = this._persistQueue
      .then(async () => {
        const dir = path.dirname(this.filePath);
        await fsp.mkdir(dir, { recursive: true });
        const obj = {};
        for (const [chatId, plan] of this.plans.entries()) {
          obj[chatId] = plan;
        }
        const tmp = `${this.filePath}.tmp`;
        await fsp.writeFile(tmp, JSON.stringify(obj, null, 2), 'utf8');
        await fsp.rename(tmp, this.filePath);
      })
      .catch((e) => console.warn('[PlanStore] persist failed (non-fatal):', e?.message || e));
  }

  // FIX: evict oldest plans when store is over MAX_PLANS_STORED or plans are stale.
  _evictIfNeeded() {
    const now = Date.now();
    // First pass: remove age-expired plans
    for (const [chatId, plan] of this.plans.entries()) {
      const age = now - Date.parse(plan.updatedAt);
      if (age > PLAN_MAX_AGE_MS) this.plans.delete(chatId);
    }
    // Second pass: if still over cap, evict LRU by updatedAt
    if (this.plans.size > MAX_PLANS_STORED) {
      const sorted = [...this.plans.entries()].sort(
        ([, a], [, b]) => Date.parse(a.updatedAt) - Date.parse(b.updatedAt)
      );
      const toDelete = sorted.slice(0, this.plans.size - MAX_PLANS_STORED);
      for (const [chatId] of toDelete) this.plans.delete(chatId);
    }
  }

  getPlan(chatId) {
    const plan = this.plans.get(String(chatId || 'default'));
    if (!plan) return { chatId: String(chatId || 'default'), tasks: [], updatedAt: nowIso() };
    return JSON.parse(JSON.stringify(plan));
  }

  setPlan(chatId, plan) {
    const cid = String(chatId || 'default');
    const tasks = Array.isArray(plan?.tasks) ? plan.tasks : [];

    // FIX: enforce task cap on every write path
    if (tasks.length > MAX_TASKS_PER_PLAN) {
      throw new Error(`Plan cannot exceed ${MAX_TASKS_PER_PLAN} tasks. Remove done/blocked tasks first.`);
    }

    const safePlan = {
      chatId: cid,
      tasks: tasks.map((t) => ({
        id: t.id || crypto.randomUUID(),
        description: String(t.description || '').slice(0, 300),
        status: normalizeStatus(t.status),
        createdAt: t.createdAt || nowIso(),
        updatedAt: t.updatedAt || nowIso()
      })),
      updatedAt: nowIso()
    };
    this.plans.set(cid, safePlan);
    this._evictIfNeeded();
    this._persistAsync();
    return this.getPlan(cid);
  }

  list(chatId) { return this.getPlan(chatId); }

  add(chatId, description) {
    const plan = this.getPlan(chatId);
    // FIX: check cap before add, not just on setPlan — gives a cleaner error path
    if (plan.tasks.length >= MAX_TASKS_PER_PLAN) {
      throw new Error(`Plan is full (${MAX_TASKS_PER_PLAN} tasks). Mark tasks done or remove them first.`);
    }
    plan.tasks.push(createTask(description));
    return this.setPlan(chatId, plan);
  }

  update(chatId, taskId, updates = {}) {
    const plan = this.getPlan(chatId);
    const task = plan.tasks.find((t) => t.id === taskId);
    if (!task) throw new Error(`Task ${taskId} not found in plan.`);
    if (updates.description) task.description = String(updates.description).trim().slice(0, 300);
    if (updates.status) task.status = normalizeStatus(updates.status);
    task.updatedAt = nowIso();
    return this.setPlan(chatId, plan);
  }

  remove(chatId, taskId) {
    const plan = this.getPlan(chatId);
    const before = plan.tasks.length;
    plan.tasks = plan.tasks.filter((t) => t.id !== taskId);
    if (plan.tasks.length === before) throw new Error(`Task ${taskId} not found.`);
    return this.setPlan(chatId, plan);
  }

  clear(chatId) {
    return this.setPlan(chatId, { chatId, tasks: [] });
  }

  async flush() {
    await this._persistQueue;
  }
}

function formatPlanForModel(plan) {
  const tasks = plan.tasks || [];
  if (!tasks.length) return 'No tasks in current plan. Use plan.manage with action="add" to break down the goal.';
  const lines = tasks.map((t, idx) => {
    const icon = t.status === 'done' ? '✓' : t.status === 'in_progress' ? '→' : t.status === 'blocked' ? '!' : '•';
    return `${idx + 1}. [${icon} ${t.status}] ${t.description} (id: ${t.id})`;
  });
  return [
    `Current plan has ${tasks.length} task(s). Last updated: ${plan.updatedAt || 'unknown'}`,
    ...lines,
    'Use plan.manage to add/update/remove tasks. Keep the plan accurate and complete.'
  ].join('\n');
}

module.exports = { PlanStore, formatPlanForModel };
