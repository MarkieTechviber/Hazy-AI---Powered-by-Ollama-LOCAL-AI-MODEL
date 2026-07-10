'use strict';

/**
 * ExecutionContext explicitly tracks all dependencies and state for a single AI invocation.
 * This ensures cleaner APIs and simpler dependency injection.
 */
class ExecutionContext {
  /**
   * @param {Object} params
   * @param {Object} params.provider - The Provider instance (e.g., OllamaProvider).
   * @param {string} params.modelId - The requested model ID.
   * @param {Array} params.messages - Conversational history payload.
   * @param {Object} params.telemetry - Telemetry tracker specific to this run.
   * @param {Function} [params.onEvent] - Callback for streaming events.
   * @param {AbortSignal} [params.signal] - Abort controller signal for cancellation.
   */
  constructor({ provider, modelId, messages, context = {}, telemetry = {}, onEvent, signal }) {
    this.provider = provider;
    this.modelId = modelId;
    this.messages = messages;
    this.context = context || {};
    this.telemetry = telemetry;
    this.onEvent = onEvent;
    
    // Default to an un-aborted signal if none provided
    this.signal = signal || new AbortController().signal;

    // Runtime state tracking
    this.retryCount = 0;
    this.fallbackCount = 0;
  }

  /**
   * Check if the context has been cancelled by the user/system.
   * @returns {boolean}
   */
  get isCancelled() {
    return this.signal.aborted;
  }

  /**
   * Emits an event to the frontend if an event handler is attached.
   * @param {string} type - Event type (e.g., TEXT_DELTA, TOOL_CALL_STARTED)
   * @param {Object} payload - Additional event data
   */
  emit(type, payload = {}) {
    if (this.onEvent) {
      this.onEvent({ type, ...payload });
    }
  }
}

module.exports = ExecutionContext;
