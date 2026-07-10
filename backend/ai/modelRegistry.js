'use strict';

const fs = require('fs');
const path = require('path');

const REGISTRY_DIR = path.join(__dirname, '..', '..', '..', 'cache', 'ai-runtime');
const REGISTRY_FILE = path.join(REGISTRY_DIR, 'modelRegistry.json');

/**
 * Initializes the model registry cache directory.
 */
function init() {
  if (!fs.existsSync(REGISTRY_DIR)) {
    fs.mkdirSync(REGISTRY_DIR, { recursive: true });
  }
  if (!fs.existsSync(REGISTRY_FILE)) {
    fs.writeFileSync(REGISTRY_FILE, JSON.stringify({}), 'utf8');
  }
}

/**
 * Loads the current registry from disk.
 * @returns {Object}
 */
function loadRegistry() {
  try {
    init();
    return JSON.parse(fs.readFileSync(REGISTRY_FILE, 'utf8'));
  } catch (err) {
    console.error('[ModelRegistry] Failed to load:', err.message);
    return {};
  }
}

/**
 * Saves the registry back to disk.
 * @param {Object} data 
 */
function saveRegistry(data) {
  try {
    init();
    fs.writeFileSync(REGISTRY_FILE, JSON.stringify(data, null, 2), 'utf8');
  } catch (err) {
    console.error('[ModelRegistry] Failed to save:', err.message);
  }
}

/**
 * Gets capabilities for a specific model.
 * Invalidate if digest mismatch or if older than 30 days.
 * @param {string} modelId 
 * @param {string} currentDigest - Current digest from the provider
 * @returns {Object|null}
 */
function getModelCapabilities(modelId, currentDigest) {
  const registry = loadRegistry();
  const entry = registry[modelId];

  if (!entry) return null;

  // Validate version
  if (entry.version !== 1) return null;

  // Validate digest if provided
  if (currentDigest && entry.digest !== currentDigest) {
    return null; // Model was updated (e.g., new quant)
  }

  // Validate expiration (30 days)
  if (entry.detectedAt) {
    const ageMs = Date.now() - new Date(entry.detectedAt).getTime();
    if (ageMs > 30 * 24 * 60 * 60 * 1000) {
      return null;
    }
  }

  return entry.capabilities;
}

/**
 * Sets capabilities for a specific model.
 * @param {string} modelId 
 * @param {Object} capabilities 
 * @param {string} digest - Optional digest of the model
 */
function setModelCapabilities(modelId, capabilities, digest = '') {
  const registry = loadRegistry();
  registry[modelId] = {
    version: 1,
    digest,
    detectedAt: new Date().toISOString(),
    capabilities
  };
  saveRegistry(registry);
}

module.exports = { getModelCapabilities, setModelCapabilities };
