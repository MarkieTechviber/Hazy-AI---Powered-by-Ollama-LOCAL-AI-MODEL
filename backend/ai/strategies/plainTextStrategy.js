'use strict';

const { parseFilesFromText } = require('../parsers/regexParser');
const { normalizeResponse } = require('../normalizers/responseNormalizer');
const { logMetric } = require('../metrics/telemetry');

/**
 * Strategy that handles raw text output from the model, extracting code using regex delimiters.
 * Score: 20 (Fallback strategy)
 */
class PlainTextStrategy {
  constructor() {
    this.name = 'plain_text';
    this.score = 20;
  }

  canRun(capabilities) {
    return true; // Plain text fallback is always supported
  }

  /**
   * Executes the strategy.
   * @param {Object} params
   * @param {string} params.modelId
   * @param {Object} ctx
   * @param {string} ctx.modelId
   * @param {Array} ctx.messages
   * @param {Object} ctx.context
   * @param {Object} ctx.provider
   * @param {Function} [ctx.onEvent]
   * @returns {Promise<Object>} Normalized response
   */
  async execute(ctx) {
    const startTime = Date.now();
    let rawText = '';
    let success = false;
    let errorMsg = null;

    const payload = {
      modelId: ctx.modelId,
      payload: { messages: ctx.messages, ...ctx.context },
      onEvent: (event) => ctx.emit(event.type, event),
      signal: ctx.signal
    };

    try {
      // 1. Fetch raw response from the provider (provider-agnostic)
      const response = await ctx.provider.executeStream(payload);
      rawText = response.text || response.content || '';
      success = true;
    } catch (err) {
      errorMsg = err.message;
      throw err;
    } finally {
      // Log telemetry
      logMetric({
        model: ctx.modelId,
        strategy: this.name,
        durationMs: Date.now() - startTime,
        success,
        error: errorMsg
      });
    }

    // 2. Parse out files using Regex
    const files = parseFilesFromText(rawText);

    // 3. Normalize the final payload
    return normalizeResponse({
      content: rawText,
      files,
      metadata: {
        model: ctx.modelId,
        strategy: this.name,
        durationMs: Date.now() - startTime
      }
    });
  }
}

module.exports = new PlainTextStrategy();
