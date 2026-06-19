'use strict';

const fs = require('fs');
const path = require('path');

const TOOL_RISKS = Object.freeze([
  'read',
  'low_write',
  'medium_write',
  'high_write',
  'external_side_effect',
  'device_control'
]);

const DEFAULT_ROLES = Object.freeze(['admin', 'cashier', 'user']);

function cloneValue(value) {
  if (Array.isArray(value)) return value.map(cloneValue);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, cloneValue(item)])
    );
  }
  return value;
}

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.freeze(value);
  Object.values(value).forEach(deepFreeze);
  return value;
}

function normalizeTool(tool) {
  const risk = TOOL_RISKS.includes(tool.risk) ? tool.risk : 'read';
  const allowedRoles = Array.isArray(tool.allowedRoles) && tool.allowedRoles.length
    ? [...new Set(tool.allowedRoles.filter((role) => DEFAULT_ROLES.includes(role)))]
    : [...DEFAULT_ROLES];

  if (!allowedRoles.length) {
    throw new Error(`Tool ${tool.name} must allow at least one valid role.`);
  }

  return {
    ...tool,
    description: tool.description || '',
    risk,
    toolset: tool.toolset || 'safe_default',
    rateLimit: tool.rateLimit || null,
    audit: tool.audit === false ? false : true,
    requiresConfirmation: tool.requiresConfirmation === true
      || ['medium_write', 'high_write', 'external_side_effect', 'device_control'].includes(risk),
    allowedRoles,
    schema: cloneValue(tool.schema || {
      type: 'object',
      properties: {},
      additionalProperties: false
    })
  };
}

class ToolRegistry {
  constructor() {
    this.tools = new Map();
  }

  snapshot(tool) {
    if (!tool) return undefined;
    return deepFreeze({
      ...tool,
      allowedRoles: [...(tool.allowedRoles || [])],
      schema: cloneValue(tool.schema || {})
    });
  }

  register(tool) {
    if (!tool?.name) {
      throw new Error("Tool must have a name.");
    }
    if (this.tools.has(tool.name)) {
      console.warn(`[ToolRegistry] Replacing existing tool: ${tool.name}`);
    }
    this.tools.set(tool.name, this.snapshot(normalizeTool(tool)));
  }

  // Return convention (for Phase4 tools + plan/memory): explicit {ok: true, data: ...} or {ok:false, error:{code,message}}.
  // Legacy (web/calc) may return raw; gatekeeper normalizeToolResult + executor handle both for compatibility.

  list(ctx = null) {
    return Array.from(this.tools.values())
      .filter((tool) => !ctx?.role || tool.allowedRoles.includes(ctx.role))
      .map((tool) => ({
      name: tool.name,
      description: tool.description || "",
      risk: tool.risk,
      toolset: tool.toolset,
      requiresConfirmation: tool.requiresConfirmation,
      schema: cloneValue(tool.schema || {})
    }));
  }

  get(name) {
    return this.snapshot(this.tools.get(name));
  }

  getModelTools(ctx = null) {
    return this.list(ctx).map((tool) => ({
      type: 'function',
      name: tool.name,
      description: tool.description,
      parameters: {
        ...cloneValue(tool.schema),
        additionalProperties: tool.schema?.additionalProperties === true
      },
      strict: true
    }));
  }

  discover(toolsDir) {
    // import-side-effect via register() export for zero-dep reliability (per Phase4 self-registering design; no central list).
    // Trust boundary: tools/ is source-controlled; gatekeeper (rate/role/schema/confirm/audit + synthetic) protects execution.
    // Side-effect require of .js modules is the mechanism (any planted .js would be RCE on load, but writes go to artifacts/ not tools/, per guard fixes).
    // AST-based discovery placeholder; current impl uses import-side-effect via register() export for zero-dep reliability. Future: acorn walk on top-level CallExpression.
    if (!toolsDir) return;
    let entries;
    try {
      entries = fs.readdirSync(toolsDir);
    } catch (e) {
      console.warn('[ToolRegistry] discover failed to read dir:', e && e.message ? e.message : e);
      return;
    }
    for (const entry of entries) {
      if (!entry.endsWith('.js')) continue;
      if (['toolExecutor.js', 'toolRegistry.js', 'toolRouter.js'].includes(entry)) continue;
      // additional skips for non-tool modules (dot, tests, etc) to reduce surface
      if (entry.startsWith('.') || entry.includes('.test') || entry.includes('node_modules')) continue;
      const full = path.join(toolsDir, entry);
      try {
        const mod = require(full);
        if (typeof mod.register === 'function') {
          mod.register(this);
        } else if (mod && mod.toolDef) {
          this.register(mod.toolDef);
        }
      } catch (e) {
        console.warn(`[ToolRegistry] discover skip ${entry}:`, e && e.message ? e.message : e);
      }
    }
  }

  discoverAST(toolsDir) {
    // See discover() for full impl + AST placeholder comment.
    return this.discover(toolsDir);
  }
}

module.exports = {
  ToolRegistry,
  TOOL_RISKS,
  DEFAULT_ROLES,
  cloneValue,
  deepFreeze
};
