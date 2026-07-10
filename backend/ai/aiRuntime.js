'use strict';

const { detectCapabilities } = require('./capabilityDetector');
const { getStrategiesForCapabilities } = require('./strategySelector');
const permissionLayer = require('./permissions/permissionLayer');
const { PermanentError, TransientError } = require('./errors');

/**
 * AI Runtime (v2) Orchestrator.
 * Responsible for capability detection, strategy selection, and running inference.
 */
class AIRuntime {
  
  /**
   * @param {Object} deps
   * @param {Object} deps.toolRegistry
   * @param {Object} deps.permissionLayer
   * @param {Object} deps.strategySelector
   * @param {Object} deps.capabilityDetector
   * @param {Object} deps.toolExecutionScheduler
   */
  constructor(deps = {}) {
    this.toolRegistry = deps.toolRegistry;
    this.permissionLayer = deps.permissionLayer;
    this.strategySelector = deps.strategySelector;
    this.capabilityDetector = deps.capabilityDetector;
    this.toolExecutionScheduler = deps.toolExecutionScheduler;
  }

  /**
   * Main entry point for generating code or structured data.
   * @param {ExecutionContext} ctx - Execution context
   * @returns {Promise<Object>} Normalized Response
   */
  async executeInference(ctx) {
    const startTime = Date.now();
    const emitState = (state) => {
      ctx.emit('STATE_CHANGE', { state });
    };

    emitState('Idle');

    // 1. Detect capabilities
    emitState('Preparing');
    const capabilities = await this.capabilityDetector.detectCapabilities(ctx.modelId, ctx.provider);

    // 2. Rank strategies
    emitState('Selecting Strategy');
    const strategies = this.strategySelector.getStrategiesForCapabilities(capabilities);

    // 3. Execute with fallback & retry
    let lastError = null;
    let fallbackCount = 0;

    for (const strategy of strategies) {
      let retryCount = 0;
      const maxRetries = 2; // 3 total attempts per strategy

      while (retryCount <= maxRetries) {
        try {
          console.log(`[AIRuntime] Attempting strategy: ${strategy.name} (Attempt ${retryCount + 1})`);
          ctx.retryCount = retryCount;
          ctx.fallbackCount = fallbackCount;

          emitState('Sending Request');
          // (Streaming, Parsing, and Validating occur inside the strategy execution)
          const result = await strategy.execute(ctx);
          
          // 4. Permission Enforcer
          emitState('Executing Tools');
          const finalPayload = this.permissionLayer.enforce(result);

          // Telemetry
          const duration = Date.now() - startTime;
          console.log(`[AIRuntime] ${strategy.name} succeeded in ${duration}ms`);
          emitState('Completed');

          // If there are tool calls inside the payload that need execution, we can schedule them
          if (finalPayload.toolCalls && finalPayload.toolCalls.length > 0 && this.toolExecutionScheduler) {
             emitState('Executing Tools via Scheduler');
             try {
               const toolResults = await this.toolExecutionScheduler.schedule(finalPayload.toolCalls);
               finalPayload.toolResults = toolResults;
             } catch (err) {
               console.warn(`[AIRuntime] Tool execution failed: ${err.message}`);
               finalPayload.toolError = err.message;
             }
          }

          return finalPayload;
        } catch (err) {
          console.warn(`[AIRuntime] Strategy ${strategy.name} failed (Attempt ${retryCount + 1}):`, err.message);
          lastError = err;
          
          if (err instanceof PermanentError) {
            console.warn(`[AIRuntime] Aborting retry due to PermanentError: ${err.message}`);
            break; // Break the while-loop for this strategy
          }
          
          retryCount++;
        }
      }
      
      fallbackCount++;
      // Move to the next strategy in the sorted fallback list
    }

    throw new Error(`All strategies failed. Last error: ${lastError?.message}`);
  }

}

module.exports = AIRuntime;
