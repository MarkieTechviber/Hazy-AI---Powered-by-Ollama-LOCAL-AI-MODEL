'use strict';

const { parseJsonFromText } = require('../parsers/jsonParser');
const { validateJsonResponse } = require('../validators/jsonValidator');
const { normalizeResponse } = require('../normalizers/responseNormalizer');
const { logMetric } = require('../metrics/telemetry');

/**
 * Strategy that forces JSON mode and expects a structured JSON object.
 * Score: 80
 */
class JsonModeStrategy {
  constructor() {
    this.name = 'json_mode';
    this.score = 80;
  }

  canRun(capabilities) {
    return capabilities.supportsJson === true;
  }

  getSystemInstruction() {
    return `You must respond ONLY with a valid JSON object matching this schema:
{
  "content": "Any explanatory text or markdown",
  "files": [
    { "filename": "example.js", "code": "console.log('hello');", "language": "javascript" }
  ],
  "commands": ["npm install"]
}
Do not include any code fences or text outside the JSON object.`;
  }

  injectSystemInstruction(messages) {
    return [
      ...messages,
      { role: 'system', content: this.getSystemInstruction() }
    ];
  }

  async execute(ctx) {
    const startTime = Date.now();
    let rawText = '';
    let success = false;
    let errorMsg = null;
    let parsedData = null;

    // 1. Inject schema instruction
    const modifiedMessages = this.injectSystemInstruction(ctx.messages);

    try {
      // 2. Fetch with JSON mode
      const response = await ctx.provider.executeStream({ 
        modelId: ctx.modelId,
        payload: {
          messages: modifiedMessages, 
          ...ctx.context,
          options: { ...ctx.context?.options, format: 'json' }
        },
        onEvent: (event) => ctx.emit(event.type, event),
        signal: ctx.signal
      });

      rawText = response.text || response.content || '';
      
      // 3. Parse JSON
      parsedData = parseJsonFromText(rawText);
      if (!parsedData) {
        throw new Error('Failed to parse model output as JSON.');
      }

      // 4. Validate Schema
      const validation = validateJsonResponse(parsedData);
      if (!validation.valid) {
        const { PermanentError } = require('../errors');
        throw new PermanentError(`Invalid JSON schema: ${validation.errors.join(', ')}`);
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

    // 5. Normalize
    return normalizeResponse({
      ...parsedData,
      metadata: {
        model: ctx.modelId,
        strategy: this.name,
        durationMs: Date.now() - startTime
      }
    });
  }
}

module.exports = new JsonModeStrategy();
