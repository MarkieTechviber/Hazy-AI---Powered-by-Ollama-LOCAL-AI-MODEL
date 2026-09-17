'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { CONFIG_DIR } = require('./runtimePaths');
function loadConfig() {
  let config = {};
  try { config = JSON.parse(fs.readFileSync(path.join(CONFIG_DIR, 'hazy-config.json'), 'utf8')); }
  catch (error) { if (error.code !== 'ENOENT') console.warn('[Config] Invalid local config; using defaults.'); }
  return {
    ...config,
    defaults: { ...config.defaults, textModel: process.env.HAZY_MODEL || config.defaults?.textModel || 'ollama/llama3.2:1b' },
    providers: { ...config.providers, ollama: {
      enabled: true, ...config.providers?.ollama,
      baseUrl: process.env.OLLAMA_URL || process.env.OLLAMA_HOST || config.providers?.ollama?.baseUrl || 'http://127.0.0.1:11434'
    } }
  };
}
module.exports = { loadConfig };
