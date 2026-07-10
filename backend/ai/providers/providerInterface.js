'use strict';

/**
 * ProviderInterface defines the contract for any AI model provider.
 * All backend providers (e.g., Ollama, OpenAI, Anthropic, LMStudio) must implement this.
 */
class ProviderInterface {

  /**
   * Probes the provider for the metadata of a specific model.
   * @param {string} modelId - The model to probe (e.g., 'ollama/llama3.2').
   * @returns {Promise<Object>} An object defining the model's metadata (digest, version, etc).
   */
  async getMetadata(modelId) {
    throw new Error('Provider must implement getMetadata()');
  }

  /**
   * Executes a streaming inference request.
   * Must handle its own specific formatting and payload logic.
   * @param {Object} params
   * @param {string} params.modelId - The identifier of the model to use.
   * @param {Array} params.messages - Conversational payload.
   * @param {Array} [params.tools] - Available tools.
   * @param {string} [params.format] - Requested format (e.g., 'json').
   * @param {Function} [params.onEvent] - Callback for streaming rich events.
   *        Valid events:
   *        - { type: 'TEXT_DELTA', content: string }
   *        - { type: 'TOOL_CALL_STARTED', name: string }
   *        - { type: 'TOOL_ARGUMENT', chunk: string }
   *        - { type: 'TOOL_FINISHED' }
   *        - { type: 'WARNING', message: string }
   *        - { type: 'ERROR', error: Error }
   *        - { type: 'DONE', rawResponse: any }
   * @returns {Promise<{ text: string, content: string, toolCalls: Array }>} The parsed response.
   */
  async execute(params) {
    throw new Error('execute() must be implemented by Provider');
  }
}

module.exports = ProviderInterface;
