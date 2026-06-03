class ToolRegistry {
  constructor() {
    this.tools = new Map();
  }

  register(tool) {
    if (!tool?.name) {
      throw new Error("Tool must have a name.");
    }
    this.tools.set(tool.name, tool);
  }

  list() {
    return Array.from(this.tools.values()).map((tool) => ({
      name: tool.name,
      description: tool.description || "",
      schema: tool.schema || {}
    }));
  }

  get(name) {
    return this.tools.get(name);
  }
}

module.exports = { ToolRegistry };
