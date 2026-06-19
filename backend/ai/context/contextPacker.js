'use strict';

/**
 * contextPacker.js
 * A thin facade that re‑exports the main packer from contextWindowManager.
 * Kept for backward compatibility.  All new logic lives in contextWindowManager.
 */

const {
  buildContextPack,
  applyContextWindow,
  DEFAULT_SLOT_RATIOS,
  estimateTokens,
  truncateToTokens,
  normalizeMemory,
  normalizeChunks,
  splitMessages,
  createSlotBudgets,
  allocateSlotTokens,
  selectChunksByDensity,
  selectToolsProportionally,
  selectRecentMessages
} = require('./contextWindowManager');

module.exports = {
  buildContextPack,
  applyContextWindow,
  DEFAULT_SLOT_RATIOS,
  estimateTokens,
  truncateToTokens,
  normalizeMemory,
  normalizeChunks,
  splitMessages,
  createSlotBudgets,
  allocateSlotTokens,
  selectChunksByDensity,
  selectToolsProportionally,
  selectRecentMessages
};