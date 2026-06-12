'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

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
    this.plans = new Map(); // chatId -> { chatId, tasks: [...], updatedAt }
    this.load();
  }

  load() {
    if (!this.filePath || !fs.existsSync(this.filePath)) return;
    try {
      const data = JSON.parse(fs.readFileSync(this.filePath, 'utf8'));
      if (data && typeof data === 'object') {
        for (const [chatId, plan] of Object.entries(data)) {
          if (plan && Array.isArray(plan.tasks)) {
            this.plans.set(chatId, {
              chatId,
              tasks: plan.tasks.map((t) => ({
                id: t.id,
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
    } catch {
      this.plans.clear();
    }
  }

  persist() {
    if (!this.filePath) return;
    fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
    const obj = {};
    for (const [chatId, plan] of this.plans.entries()) {
      obj[chatId] = plan;
    }
    const tempPath = `${this.filePath}.tmp`;
    fs.writeFileSync(tempPath, JSON.stringify(obj, null, 2), 'utf8');
    fs.renameSync(tempPath, this.filePath);
  }

  getPlan(chatId) {
    const plan = this.plans.get(String(chatId || 'default'));
    if (!plan) return { chatId: String(chatId || 'default'), tasks: [], updatedAt: nowIso() };
    return JSON.parse(JSON.stringify(plan)); // deep clone for safety
  }

  setPlan(chatId, plan) {
    const cid = String(chatId || 'default');
    const safePlan = {
      chatId: cid,
      tasks: Array.isArray(plan?.tasks) ? plan.tasks.map((t) => ({
        id: t.id || crypto.randomUUID(),
        description: String(t.description || '').slice(0, 300),
        status: normalizeStatus(t.status),
        createdAt: t.createdAt || nowIso(),
        updatedAt: t.updatedAt || nowIso()
      })) : [],
      updatedAt: nowIso()
    };
    this.plans.set(cid, safePlan);
    this.persist();
    return this.getPlan(cid);
  }

  // High level mutations used by the tool
  list(chatId) {
    return this.getPlan(chatId);
  }

  add(chatId, description) {
    const plan = this.getPlan(chatId);
    const task = createTask(description);
    plan.tasks.push(task);
    return this.setPlan(chatId, plan);
  }

  update(chatId, taskId, updates = {}) {
    const plan = this.getPlan(chatId);
    const task = plan.tasks.find((t) => t.id === taskId);
    if (!task) {
      throw new Error(`Task ${taskId} not found in plan.`);
    }
    if (updates.description) {
      task.description = String(updates.description).trim().slice(0, 300);
    }
    if (updates.status) {
      task.status = normalizeStatus(updates.status);
    }
    task.updatedAt = nowIso();
    return this.setPlan(chatId, plan);
  }

  remove(chatId, taskId) {
    const plan = this.getPlan(chatId);
    const before = plan.tasks.length;
    plan.tasks = plan.tasks.filter((t) => t.id !== taskId);
    if (plan.tasks.length === before) {
      throw new Error(`Task ${taskId} not found.`);
    }
    return this.setPlan(chatId, plan);
  }

  clear(chatId) {
    return this.setPlan(chatId, { chatId, tasks: [] });
  }
}

function formatPlanForModel(plan) {
  const tasks = (plan.tasks || []);
  if (!tasks.length) return 'No tasks in current plan. Use plan.manage with action="add" to break down the goal.';
  const lines = tasks.map((t, idx) => {
    const status = t.status === 'done' ? '✓' : t.status === 'in_progress' ? '→' : t.status === 'blocked' ? '!' : '•';
    return `${idx + 1}. [${status} ${t.status}] ${t.description} (id: ${t.id})`;
  });
  return [
    `Current plan has ${tasks.length} task(s). Last updated: ${plan.updatedAt || 'unknown'}`,
    ...lines,
    'Use plan.manage to add/update/remove tasks. Keep the plan accurate and complete.'
  ].join('\n');
}

module.exports = {
  PlanStore,
  formatPlanForModel
};
