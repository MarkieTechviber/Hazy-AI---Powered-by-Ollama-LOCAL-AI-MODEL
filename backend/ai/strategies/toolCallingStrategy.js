'use strict';

const { validateToolCalls } = require('../validators/toolValidator');
const { normalizeResponse } = require('../normalizers/responseNormalizer');
const { logMetric } = require('../metrics/telemetry');

/**
 * Strategy that uses OpenAI-compatible tool calling to extract structured data.
 * Score: 100 (Primary/Best Strategy)
 */
class ToolCallingStrategy {
  constructor() {
    this.name = 'tool_calling';
    this.score = 100;
  }

  canRun(capabilities) {
    return capabilities.supportsTools === true;
  }

  getTools(registry) {
    if (!registry) return [];
    return Array.from(registry.tools.values()).map(t => t.getSchema());
  }

  async execute(ctx) {
    const startTime = Date.now();
    let rawText = '';
    let success = false;
    let errorMsg = null;
    let toolCallsRaw = [];
    let normalizedPayload = { content: '', files: [], commands: [] };

    try {
      const response = await ctx.provider.executeStream({ 
        modelId: ctx.modelId,
        payload: {
          messages: ctx.messages, 
          ...ctx.context,
          tools: this.getTools(ctx.toolRegistry)
        },
        onEvent: (event) => ctx.emit(event.type, event),
        signal: ctx.signal
      });

      const toolCalls = response.toolCalls || [];
      if (toolCalls.length === 0) {
        // Model chose not to call a tool, fallback to normal text extraction
        normalizedPayload.content = response.text || '';
        // If we want, we could throw and let the runtime fallback, but let's just return the text
      } else {
        // 2. Validate Tool Calls
        const validation = validateToolCalls(toolCalls);
        if (!validation.valid) {
          throw new Error(`Invalid tool call schema: ${validation.errors.join(', ')}`);
        }

        // 3. Extract data from the tool call
        const writeCall = toolCalls.find(c => c.name === 'write_files');
        if (writeCall) {
          normalizedPayload = {
            content: writeCall.arguments.content || response.text || '',
            files: writeCall.arguments.files || [],
            commands: writeCall.arguments.commands || []
          };
        }
      }

      success = true;
    } catch (err) {
      errorMsg = err.message;
      throw err;
    } finally {
      logMetric({
        model: ctx.modelId,
        strategy: this.name,
        durationMs: Date.now() - startTime,
        success,
        error: errorMsg
      });
    }

    // 4. Normalize
    return normalizeResponse({
      ...normalizedPayload,
      metadata: {
        model: ctx.modelId,
        strategy: this.name,
        durationMs: Date.now() - startTime
      }
    });
  }
}

module.exports = new ToolCallingStrategy();
