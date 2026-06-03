class ToolExecutor {
  constructor(registry) {
    this.registry = registry;
  }

  async execute(name, args = {}) {
    const tool = this.registry.get(name);
    if (!tool) {
      throw new Error(`Unknown tool: ${name}`);
    }
    if (typeof tool.execute !== "function") {
      throw new Error(`Tool ${name} is not executable.`);
    }
    return tool.execute(args);
  }
}

module.exports = { ToolExecutor };
