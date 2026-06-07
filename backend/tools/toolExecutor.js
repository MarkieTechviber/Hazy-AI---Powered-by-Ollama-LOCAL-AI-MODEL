class ToolExecutor {
  constructor(registry, options = {}) {
    this.registry = registry;
    this.timeoutMs = options.timeoutMs || 10000;
    this.retries = options.retries || 0;
  }

  normalizeError(error, name, code = 'tool_execution_failed') {
    const normalized = new Error(`Tool ${name} failed: ${error?.message || String(error)}`);
    normalized.code = error?.code || code;
    normalized.tool = name;
    normalized.cause = error;
    return normalized;
  }

  withTimeout(promise, name) {
    let timer;
    const timeout = new Promise((_, reject) => {
      timer = setTimeout(() => {
        const error = new Error(`Tool ${name} timed out after ${this.timeoutMs}ms.`);
        error.code = 'tool_timeout';
        reject(error);
      }, this.timeoutMs);
    });

    return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
  }

  async execute(name, args = {}, ctx = {}) {
    const tool = this.registry.get(name);
    if (!tool) {
      const error = new Error(`Unknown tool: ${name}`);
      error.code = 'unknown_tool';
      error.tool = name;
      throw error;
    }
    if (typeof tool.execute !== "function") {
      const error = new Error(`Tool ${name} is not executable.`);
      error.code = 'tool_not_executable';
      error.tool = name;
      throw error;
    }

    let lastError;
    for (let attempt = 0; attempt <= this.retries; attempt += 1) {
      try {
        return await this.withTimeout(
          Promise.resolve().then(() => tool.execute(args, ctx)),
          name
        );
      } catch (error) {
        lastError = error;
      }
    }

    throw this.normalizeError(lastError, name);
  }
}

module.exports = { ToolExecutor };
