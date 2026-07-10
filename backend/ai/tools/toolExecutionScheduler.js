'use strict';

/**
 * ToolExecutionScheduler
 * Queues and executes tool calls sequentially.
 */
class ToolExecutionScheduler {
  constructor(registry, permissionLayer) {
    this.registry = registry;
    this.permissionLayer = permissionLayer;
    this.queue = [];
    this.isExecuting = false;
  }

  /**
   * Schedule one or more tool calls.
   * @param {Array} toolCalls - Array of objects like { name, arguments, id }
   * @returns {Promise<Array>} Results of the executed tools
   */
  async schedule(toolCalls) {
    if (!Array.isArray(toolCalls) || toolCalls.length === 0) return [];
    
    return new Promise((resolve, reject) => {
      this.queue.push({
        toolCalls,
        resolve,
        reject
      });
      
      this._processQueue();
    });
  }

  async _processQueue() {
    if (this.isExecuting || this.queue.length === 0) return;
    
    this.isExecuting = true;
    const task = this.queue.shift();
    
    try {
      const results = [];
      for (const call of task.toolCalls) {
        const tool = this.registry.getTool(call.name);
        if (!tool) {
          results.push({ id: call.id, error: `Tool not found: ${call.name}` });
          continue;
        }

        // Validate
        if (typeof tool.validate === 'function') {
          tool.validate(call.arguments);
        }

        // Execute
        const result = await tool.execute(call.arguments);
        results.push({ id: call.id, result });
      }
      
      task.resolve(results);
    } catch (err) {
      task.reject(err);
    } finally {
      this.isExecuting = false;
      // Process next item in queue
      this._processQueue();
    }
  }
}

module.exports = ToolExecutionScheduler;
