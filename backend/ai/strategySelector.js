'use strict';

const toolCallingStrategy = require('./strategies/toolCallingStrategy');
const jsonModeStrategy = require('./strategies/jsonModeStrategy');
const plainTextStrategy = require('./strategies/plainTextStrategy');

const ALL_STRATEGIES = [
  toolCallingStrategy,
  jsonModeStrategy,
  plainTextStrategy
];

/**
 * Selects the best strategy based on detected model capabilities.
 * @param {Object} capabilities 
 * @returns {Array<Object>} Sorted list of compatible strategies (highest score first)
 */
function getStrategiesForCapabilities(capabilities) {
  const compatible = ALL_STRATEGIES.filter(strategy => strategy.canRun(capabilities));

  // Sort descending by score
  return compatible.sort((a, b) => b.score - a.score);
}

module.exports = { getStrategiesForCapabilities, ALL_STRATEGIES };
