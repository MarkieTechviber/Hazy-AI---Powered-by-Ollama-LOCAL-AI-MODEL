'use strict';

const { validateJsonSchema } = require('../security/jsonSchemaValidator');

const MAX_RESULT_BYTES = 512 * 1024; // FIX: 512 KB cap — original had no result size limit (OOM vector)

function toolsetEnabled(tool, ctx = {}) {
  const enabled = Array.isArray(ctx.enabledToolsets) && ctx.enabledToolsets.length ? ctx.enabledToolsets : null;
  const disabled = Array.isArray(ctx.disabledToolsets) ? ctx.disabledToolsets : [];
  if (disabled.includes(tool.toolset)) return false;
  if (enabled && !enabled.includes(tool.toolset) && !enabled.includes('full_local') && tool.toolset !== 'safe_default') return false;
  return true;
}

// FIX: sanitize rate-limiter keys — original interpolated ctx.userId directly;
// if userId contained ':' it could collide with other key namespaces.
function safeRateLimitKey(namespace, userId) {
  const safe = String(userId || 'anon').replace(/[^a-zA-Z0-9_.-]/g, '_').slice(0, 64);
  return `${namespace}:${safe}`;
}

// FIX: result size guard — truncates oversized payloads rather than passing them to the model.
function truncateIfNeeded(value) {
  const s = JSON.stringify(value);
  if (s.length <= MAX_RESULT_BYTES) return value;
  console.warn(`[ToolGatekeeper] result truncated (${s.length} bytes > ${MAX_RESULT_BYTES})`);
  return {
    __truncated: true,
    byteLength: s.length,
    preview: s.slice(0, 2048) + '…[truncated]'
  };
}

function normalizeToolResult(value, latencyMs) {
  let normalized;
  if (value && typeof value === 'object' && Object.hasOwn(value, 'ok')) {
    normalized = { ...value, metrics: { latencyMs, ...(value.metrics || {}) } };
  } else if (value && typeof value === 'object' && Object.hasOwn(value, 'success')) {
    normalized = value.success
      ? { ok: true, data: value, metrics: { latencyMs } }
      : {
          ok: false,
          error: { code: value.code || 'TOOL_FAILED', message: value.error || value.note || 'The tool did not return a useful result.' },
          data: value,
          metrics: { latencyMs }
        };
  } else {
    normalized = { ok: true, data: value, metrics: { latencyMs } };
  }

  // FIX: apply size cap to data field only (never truncate error shapes)
  if (normalized.ok && normalized.data != null) {
    normalized.data = truncateIfNeeded(normalized.data);
  }

  return normalized;
}

class ToolGatekeeper {
  constructor({ registry, executor, confirmations, audit, rateLimiter }) {
    this.registry = registry;
    this.executor = executor;
    this.confirmations = confirmations;
    this.audit = audit;
    this.rateLimiter = rateLimiter;
  }

  blocked(ctx, toolCall, code, message, details = null) {
    this.audit.log({
      requestId: ctx.requestId,
      userId: ctx.userId,
      chatId: ctx.chatId,
      toolName: toolCall.name,
      args: toolCall.arguments,
      status: 'blocked',
      errorCode: code
    });
    return { status: 'blocked', error: { code, message, ...(details ? { details } : {}) } };
  }

  async validateAndMaybeRun({ ctx, toolCall, confirmed = false }) {
    const tool = this.registry.get(toolCall.name);
    // FIX: don't expose "tool does not exist" vs "toolset disabled" — same message prevents enumeration
    if (!tool) return this.blocked(ctx, toolCall, 'TOOL_UNAVAILABLE', 'The requested tool is not available.');
    if (!toolsetEnabled(tool, ctx)) {
      return this.blocked(ctx, toolCall, 'TOOL_UNAVAILABLE', 'The requested tool is not available.');
    }
    if (!tool.allowedRoles.includes(ctx.role)) {
      return this.blocked(ctx, toolCall, 'ROLE_NOT_ALLOWED', 'Your account role cannot use this tool.');
    }

    // FIX: sanitized rate-limit keys prevent namespace collisions
    const limit = this.rateLimiter.consume(safeRateLimitKey('tool', ctx.userId), { limit: 20, windowMs: 60_000 });
    if (!limit.allowed) {
      return this.blocked(ctx, toolCall, 'RATE_LIMITED', 'Too many tool calls. Please wait and try again.');
    }

    if (['low_write', 'medium_write', 'high_write', 'external_side_effect', 'device_control'].includes(tool.risk)) {
      const writeLimit = this.rateLimiter.consume(
        safeRateLimitKey('write', ctx.userId),
        { limit: 30, windowMs: 60 * 60_000 }
      );
      if (!writeLimit.allowed) {
        return this.blocked(ctx, toolCall, 'WRITE_RATE_LIMITED', 'Too many write actions. Please try again later.');
      }
    }

    if (['high_write', 'external_side_effect', 'device_control'].includes(tool.risk)) {
      const highRiskLimit = this.rateLimiter.consume(
        safeRateLimitKey('high-risk', ctx.userId),
        { limit: 10, windowMs: 24 * 60 * 60_000 }
      );
      if (!highRiskLimit.allowed) {
        return this.blocked(ctx, toolCall, 'HIGH_RISK_RATE_LIMITED', 'The daily high-risk action limit has been reached.');
      }
    }

    const parsed = validateJsonSchema(tool.schema, toolCall.arguments);
    if (!parsed.success) {
      return this.blocked(ctx, toolCall, 'INVALID_ARGS', 'The tool arguments were invalid.', parsed.errors);
    }

    // Guardrail hook (runs after validation, before confirm/execute)
    if (typeof tool.guardrail === 'function') {
      try {
        const guardDecision = tool.guardrail(parsed.data, ctx);
        if (guardDecision && guardDecision.synthetic) {
          const result = {
            ok: true,
            data: {
              synthetic: true,
              reason: guardDecision.reason || 'denied by guardrail',
              suggestion: guardDecision.suggestion || null,
              ...(guardDecision.data || {})
            },
            metrics: { latencyMs: 0 }
          };
          this.audit.log({
            requestId: ctx.requestId, userId: ctx.userId, chatId: ctx.chatId,
            toolName: tool.name, risk: tool.risk, args: parsed.data,
            result, status: 'synthetic_guardrail', latencyMs: 0
          });
          return { status: 'executed', result };
        }
      } catch (e) {
        // non-fatal; fall through to normal execute
        return this.blocked(ctx, toolCall, 'GUARDRAIL_FAILED', 'Tool safety validation failed.');
      }
    }

    if (tool.requiresConfirmation && !confirmed) {
      const confirmation = this.confirmations.create({
        ctx, tool, args: parsed.data,
        summary: typeof tool.confirmationSummary === 'function'
          ? tool.confirmationSummary(parsed.data, ctx)
          : `run ${tool.name}`
      });
      this.audit.log({
        requestId: ctx.requestId, userId: ctx.userId, chatId: ctx.chatId,
        toolName: tool.name, risk: tool.risk, args: parsed.data,
        status: 'confirmation_required', confirmationId: confirmation.id
      });
      return { status: 'confirmation_required', confirmation };
    }

    const started = Date.now();
    try {
      const executionContext = confirmed ? { ...ctx, confirmationApproved: true } : ctx;
      const rawResult = await this.executor.execute(tool.name, parsed.data, executionContext);
      const result = normalizeToolResult(rawResult, Date.now() - started);
      this.audit.log({
        requestId: ctx.requestId, userId: ctx.userId, chatId: ctx.chatId,
        toolName: tool.name, risk: tool.risk, args: parsed.data,
        result, status: result.ok ? (confirmed ? 'executed_after_confirmation' : 'executed') : 'failed',
        errorCode: result.error?.code || null, latencyMs: result.metrics?.latencyMs
      });
      return { status: 'executed', result };
    } catch (error) {
      const result = {
        ok: false,
        error: {
          code: error.code === 'tool_timeout' ? 'TOOL_TIMEOUT' : 'TOOL_EXCEPTION',
          message: error.code === 'tool_timeout' ? 'The tool timed out while executing.' : 'The tool failed while executing.'
        },
        metrics: { latencyMs: Date.now() - started }
      };
      this.audit.log({
        requestId: ctx.requestId, userId: ctx.userId, chatId: ctx.chatId,
        toolName: tool.name, risk: tool.risk, args: parsed.data,
        result, status: 'failed', errorCode: result.error.code, latencyMs: result.metrics.latencyMs
      });
      return { status: 'executed', result };
    }
  }

  async resolveConfirmation({ ctx, confirmationId, message }) {
    const decision = this.confirmations.decide({ id: confirmationId, ctx, message });
    if (decision.status !== 'approved') return decision;
    return this.validateAndMaybeRun({
      ctx,
      confirmed: true,
      toolCall: {
        id: `confirmation:${confirmationId}`,
        name: decision.confirmation.toolName,
        arguments: decision.confirmation.args
      }
    });
  }

  // FIX: validateAndRunBatch — original fell back to sequential on ANY parallel error, masking real failures.
  // Now: parallel errors on individual calls propagate per-result; only infrastructure errors fall back.
  async validateAndRunBatch(toolCalls = [], ctx = {}) {
    if (!Array.isArray(toolCalls) || toolCalls.length === 0) return [];

    const allSafeForParallel = toolCalls.every((tc) => {
      const t = this.registry.get(tc && tc.name);
      if (!t) return false;
      if (!toolsetEnabled(t, ctx)) return false;
      if (Array.isArray(t.allowedRoles) && !t.allowedRoles.includes(ctx.role)) return false;
      return t.risk === 'read' && t.requiresConfirmation !== true;
    });

    if (allSafeForParallel && toolCalls.length > 1) {
      // FIX: use allSettled so one failing tool doesn't cancel the others; re-wrap rejections as blocked results.
      const settled = await Promise.allSettled(
        toolCalls.map((tc) => this.validateAndMaybeRun({ ctx, toolCall: tc }))
      );
      return settled.map((s, i) => {
        if (s.status === 'fulfilled') return s.value;
        // Unexpected throw from validateAndMaybeRun itself (should not happen, but be safe)
        console.warn('[ToolGatekeeper] parallel batch item threw:', s.reason?.message || s.reason);
        return this.blocked(ctx, toolCalls[i], 'BATCH_ITEM_FAILED', 'Tool call failed during parallel batch execution.');
      });
    }

    // Sequential path: writes, mixed, or single calls
    const out = [];
    for (const tc of toolCalls) {
      out.push(await this.validateAndMaybeRun({ ctx, toolCall: tc }));
    }
    return out;
  }
}

module.exports = { ToolGatekeeper, normalizeToolResult, toolsetEnabled };
