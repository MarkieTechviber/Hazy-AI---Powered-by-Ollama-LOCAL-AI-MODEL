'use strict';

const { validateJsonSchema } = require('../security/jsonSchemaValidator');

function normalizeToolResult(value, latencyMs) {
  if (value && typeof value === 'object' && Object.hasOwn(value, 'ok')) {
    return {
      ...value,
      metrics: { latencyMs, ...(value.metrics || {}) }
    };
  }
  if (value && typeof value === 'object' && Object.hasOwn(value, 'success')) {
    return value.success
      ? { ok: true, data: value, metrics: { latencyMs } }
      : {
          ok: false,
          error: {
            code: value.code || 'TOOL_FAILED',
            message: value.error || value.note || 'The tool did not return a useful result.'
          },
          data: value,
          metrics: { latencyMs }
        };
  }
  return { ok: true, data: value, metrics: { latencyMs } };
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
    return {
      status: 'blocked',
      error: { code, message, ...(details ? { details } : {}) }
    };
  }

  async validateAndMaybeRun({ ctx, toolCall, confirmed = false }) {
    const tool = this.registry.get(toolCall.name);
    if (!tool) return this.blocked(ctx, toolCall, 'UNKNOWN_TOOL', 'The requested tool does not exist.');
    if (!tool.allowedRoles.includes(ctx.role)) {
      return this.blocked(ctx, toolCall, 'ROLE_NOT_ALLOWED', 'Your account role cannot use this tool.');
    }

    const limit = this.rateLimiter.consume(`tool:${ctx.userId}`, { limit: 20, windowMs: 60_000 });
    if (!limit.allowed) {
      return this.blocked(ctx, toolCall, 'RATE_LIMITED', 'Too many tool calls. Please wait and try again.');
    }
    if (['low_write', 'medium_write', 'high_write', 'external_side_effect'].includes(tool.risk)) {
      const writeLimit = this.rateLimiter.consume(
        `write:${ctx.userId}`,
        { limit: 30, windowMs: 60 * 60_000 }
      );
      if (!writeLimit.allowed) {
        return this.blocked(ctx, toolCall, 'WRITE_RATE_LIMITED', 'Too many write actions. Please try again later.');
      }
    }
    if (['high_write', 'external_side_effect'].includes(tool.risk)) {
      const highRiskLimit = this.rateLimiter.consume(
        `high-risk:${ctx.userId}`,
        { limit: 10, windowMs: 24 * 60 * 60_000 }
      );
      if (!highRiskLimit.allowed) {
        return this.blocked(ctx, toolCall, 'HIGH_RISK_RATE_LIMITED', 'The daily high-risk action limit has been reached.');
      }
    }

    const parsed = validateJsonSchema(tool.schema, toolCall.arguments);
    if (!parsed.success) {
      return this.blocked(
        ctx,
        toolCall,
        'INVALID_ARGS',
        'The tool arguments were invalid.',
        parsed.errors
      );
    }

    if (tool.requiresConfirmation && !confirmed) {
      const confirmation = this.confirmations.create({
        ctx,
        tool,
        args: parsed.data,
        summary: typeof tool.confirmationSummary === 'function'
          ? tool.confirmationSummary(parsed.data, ctx)
          : `run ${tool.name}`
      });
      this.audit.log({
        requestId: ctx.requestId,
        userId: ctx.userId,
        chatId: ctx.chatId,
        toolName: tool.name,
        risk: tool.risk,
        args: parsed.data,
        status: 'confirmation_required',
        confirmationId: confirmation.id
      });
      return { status: 'confirmation_required', confirmation };
    }

    const started = Date.now();
    try {
      const rawResult = await this.executor.execute(tool.name, parsed.data, ctx);
      const result = normalizeToolResult(rawResult, Date.now() - started);
      this.audit.log({
        requestId: ctx.requestId,
        userId: ctx.userId,
        chatId: ctx.chatId,
        toolName: tool.name,
        risk: tool.risk,
        args: parsed.data,
        result,
        status: result.ok
          ? (confirmed ? 'executed_after_confirmation' : 'executed')
          : 'failed',
        errorCode: result.error?.code || null,
        latencyMs: result.metrics?.latencyMs
      });
      return { status: 'executed', result };
    } catch (error) {
      const result = {
        ok: false,
        error: {
          code: error.code === 'tool_timeout' ? 'TOOL_TIMEOUT' : 'TOOL_EXCEPTION',
          message: error.code === 'tool_timeout'
            ? 'The tool timed out while executing.'
            : 'The tool failed while executing.'
        },
        metrics: { latencyMs: Date.now() - started }
      };
      this.audit.log({
        requestId: ctx.requestId,
        userId: ctx.userId,
        chatId: ctx.chatId,
        toolName: tool.name,
        risk: tool.risk,
        args: parsed.data,
        result,
        status: 'failed',
        errorCode: result.error.code,
        latencyMs: result.metrics.latencyMs
      });
      return { status: 'executed', result };
    }
  }

  async resolveConfirmation({ ctx, confirmationId, message }) {
    const decision = this.confirmations.decide({
      id: confirmationId,
      ctx,
      message
    });
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
}

module.exports = { ToolGatekeeper, normalizeToolResult };
