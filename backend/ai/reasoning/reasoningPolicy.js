/**
 * reasoningPolicy.js
 * RAW DATA LOGIC for HAZY reasoning behavior.
 *
 * This file contains NO hardcoded if-else chains for deciding reasoning level.
 * All behavior is driven by data tables below.
 *
 * Goal: Make reasoning controllable and less aggressive on build/code tasks
 * without editing core logic every time.
 */

const REASONING_POLICY = {
  // Base reasoning level by task type
  taskTypeDefaults: {
    math: 'structured',
    symbolic: 'structured',
    commonsense: 'light',
    coding: 'light',           // Changed from 'structured' - less aggressive on coding
    general: 'light'
  },

  // Reasoning level by mode
  modeDefaults: {
    chat: 'light',
    code: 'light',
    build: 'light'             // Changed from 'structured' - this was causing heavy reasoning on build tasks
  },

  // Complexity overrides
  complexityOverrides: {
    simple: 'direct',
    multi_step: 'light',
    complex: 'structured'
  },

  // Risk level escalation
  riskEscalation: {
    low: null,
    medium: 'structured',
    high: 'high_caution'
  },

  // Budget tokens by reasoning level
  budgetByLevel: {
    direct: 0,
    light: 512,
    structured: 1536,
    agentic: 3072,           // Reduced from 4096 to prevent token waste
    high_caution: 3072
  },

  // Effort level mapping
  effortByLevel: {
    direct: 'none',
    light: 'low',
    structured: 'medium',
    agentic: 'high',
    high_caution: 'high'
  },

  // When to force lighter reasoning even if task looks complex
  forceLightConditions: {
    // These task types should rarely go above 'light' unless high risk
    preferLight: ['coding', 'general'],
    // In build mode, prefer lighter reasoning to actually produce output
    buildModeLight: true
  }
};

/**
 * getRecommendedReasoningLevel
 * Pure data-driven decision. No hardcoded if-else chains in controller.
 */
function getRecommendedReasoningLevel({ taskType, mode, complexity, riskLevel, isHighRisk }) {
  let level = REASONING_POLICY.taskTypeDefaults[taskType] || 'light';

  // Mode override
  if (REASONING_POLICY.modeDefaults[mode]) {
    level = REASONING_POLICY.modeDefaults[mode];
  }

  // Complexity override (can increase level)
  if (REASONING_POLICY.complexityOverrides[complexity]) {
    const complexityLevel = REASONING_POLICY.complexityOverrides[complexity];
    // Only upgrade if complexity level is higher than current
    const levelOrder = ['direct', 'light', 'structured', 'agentic', 'high_caution'];
    if (levelOrder.indexOf(complexityLevel) > levelOrder.indexOf(level)) {
      level = complexityLevel;
    }
  }

  // Risk escalation
  if (isHighRisk && REASONING_POLICY.riskEscalation[riskLevel]) {
    level = REASONING_POLICY.riskEscalation[riskLevel];
  }

  // Special rule: In build mode, never go above 'structured' (prevents agentic waste)
  if (mode === 'build' && level === 'agentic') {
    level = 'structured';
  }

  // Force lighter reasoning for coding/general tasks unless high risk
  if (REASONING_POLICY.forceLightConditions.preferLight.includes(taskType) && !isHighRisk) {
    if (level === 'agentic' || level === 'high_caution') {
      level = 'structured';
    }
  }

  return level;
}

function getBudgetForLevel(level) {
  return REASONING_POLICY.budgetByLevel[level] || 512;
}

function getEffortForLevel(level) {
  return REASONING_POLICY.effortByLevel[level] || 'low';
}

module.exports = {
  REASONING_POLICY,
  getRecommendedReasoningLevel,
  getBudgetForLevel,
  getEffortForLevel
};
