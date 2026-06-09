'use strict';

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
}

module.exports = {
  ToolRegistry,
  TOOL_RISKS,
  DEFAULT_ROLES,
  cloneValue,
  deepFreeze
};
