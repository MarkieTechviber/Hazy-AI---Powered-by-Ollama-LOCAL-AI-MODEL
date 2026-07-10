'use strict';

const fs = require('fs');
const path = require('path');
const ToolInterface = require('./toolInterface');

class ToolRegistry {
  constructor() {
    this.tools = new Map();
    this.loadPlugins();
  }

  loadPlugins() {
    const toolsDir = __dirname;
    const items = fs.readdirSync(toolsDir, { withFileTypes: true });

    for (const item of items) {
      if (item.isDirectory()) {
        const pluginDir = path.join(toolsDir, item.name);
        const manifestPath = path.join(pluginDir, 'manifest.json');
        let toolLoaded = false;

        // Try loading via manifest.json
        if (fs.existsSync(manifestPath)) {
          try {
            const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
            if (manifest.entrypoint) {
              const ToolClass = require(path.join(pluginDir, manifest.entrypoint));
              if (ToolClass && ToolClass.prototype) {
                const toolInstance = new ToolClass();
                // Inject manifest metadata if available
                if (manifest.schema) toolInstance._schema = manifest.schema;
                if (manifest.description) toolInstance._description = manifest.description;
                if (manifest.name) toolInstance._name = manifest.name;
                
                // Override getters on instance if we injected data
                if (toolInstance._schema) toolInstance.getSchema = function() { return this._schema; };

                this.register(toolInstance);
                console.log(`[ToolRegistry] Successfully loaded plugin via manifest: ${toolInstance.name || manifest.name}`);
                toolLoaded = true;
              }
            }
          } catch (err) {
            console.error(`[ToolRegistry] Failed to load plugin manifest in ${pluginDir}:`, err);
          }
        }

        // Fallback to legacy loading if no manifest or loading failed
        if (!toolLoaded) {
          const files = fs.readdirSync(pluginDir).filter(f => f.endsWith('.js'));
          for (const file of files) {
            try {
              const ToolClass = require(path.join(pluginDir, file));
              // Basic sanity check to ensure it extends ToolInterface
              if (ToolClass && ToolClass.prototype && typeof ToolClass.prototype.getSchema === 'function') {
                const toolInstance = new ToolClass();
                this.register(toolInstance);
                console.log(`[ToolRegistry] Successfully loaded legacy plugin: ${toolInstance.name}`);
              }
            } catch (err) {
              console.error(`[ToolRegistry] Failed to load plugin file ${file} in ${pluginDir}:`, err);
            }
          }
        }
      }
    }
  }

  register(toolInstance) {
    this.tools.set(toolInstance.name, toolInstance);
  }

  /**
   * Returns all tools formatted as JSON Schemas for Provider APIs.
   */
  getAllTools() {
    const schemas = [];
    for (const tool of this.tools.values()) {
      schemas.push({
        type: 'function',
        function: {
          name: tool.name || tool._name,
          description: tool.description || tool._description,
          parameters: typeof tool.getSchema === 'function' ? tool.getSchema() : (tool.schema || tool._schema)
        }
      });
    }
    return schemas;
  }

  getTool(name) {
    return this.tools.get(name);
  }
}

module.exports = new ToolRegistry();
