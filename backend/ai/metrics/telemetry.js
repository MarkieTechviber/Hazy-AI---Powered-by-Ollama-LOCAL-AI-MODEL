'use strict';

const fs = require('fs');
const path = require('path');

const METRICS_DIR = path.join(__dirname, '..', '..', '..', 'cache', 'metrics');

/**
 * Ensures the metrics directory exists.
 */
function init() {
  if (!fs.existsSync(METRICS_DIR)) {
    fs.mkdirSync(METRICS_DIR, { recursive: true });
  }
}

/**
 * Logs a metric event.
 * @param {Object} data
 * @param {string} params.model
 * @param {string} params.strategy
 * @param {number} params.durationMs
 * @param {boolean} params.success
 * @param {string} [params.error]
 * @param {string} [params.provider]
 * @param {string} [params.modelDigest]
 * @param {number} [params.firstTokenLatency]
 * @param {number} [params.tokensPerSec]
 * @param {number} [params.capabilityDetectionTime]
 */
function logMetric(params) {
  try {
    init();
    const logFile = path.join(METRICS_DIR, 'telemetry.jsonl');
    const entry = JSON.stringify({ timestamp: new Date().toISOString(), ...params }) + '\n';
    fs.appendFileSync(logFile, entry, 'utf8');
  } catch (err) {
    console.error('[Telemetry] Failed to log metric:', err.message);
  }
}

module.exports = { logMetric };
