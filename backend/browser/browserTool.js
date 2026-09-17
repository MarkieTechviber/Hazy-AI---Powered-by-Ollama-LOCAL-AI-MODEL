'use strict';

const path = require('path');
const { BrowserRunStore } = require('./browserRunStore');
const { BrowserEventStreamer } = require('./browserEventStreamer');
const { BrowserSessionManager } = require('./browserSessionManager');
const { BrowserObserver } = require('./browserObserver');
const { BrowserActions } = require('./browserActions');

const BROWSER_TOOL_NAMES = Object.freeze([
  'browser.open',
  'browser.navigate',
  'browser.observe',
  'browser.click',
  'browser.type',
  'browser.select',
  'browser.scroll',
  'browser.extract',
  'browser.screenshot',
  'browser.wait',
  'browser.back',
  'browser.close',
  'browser.ask_user'
]);

function createBrowserSystem({ baseDir = path.join(require('../config/runtimePaths').DATA_DIR, 'browser') } = {}) {
  const store = new BrowserRunStore(baseDir);
  const streamer = new BrowserEventStreamer();
  const sessionManager = new BrowserSessionManager({ store, streamer });
  const observer = new BrowserObserver({ store });
  const actions = new BrowserActions({ sessionManager, observer, store, streamer });
  return { store, streamer, sessionManager, observer, actions };
}

const defaultBrowserSystem = createBrowserSystem();

function browserToolSchema(toolName) {
  const action = toolName.replace(/^browser\./, '');
  const baseProperties = {
    sessionId: { type: 'string', maxLength: 120 },
    screenshot: { type: 'boolean' },
    // Confirmation is carried in trusted gatekeeper context, never model args.
  };
  const urlProperties = {
    ...baseProperties,
    url: { type: 'string', minLength: 8, maxLength: 2048 },
    waitUntil: { type: 'string', enum: ['load', 'domcontentloaded', 'networkidle', 'commit'] },
    timeoutMs: { type: 'integer', minimum: 100, maximum: 45000 }
  };
  const selectorProperties = {
    ...baseProperties,
    selector: { type: 'string', maxLength: 500 },
    text: { type: 'string', maxLength: 500 },
    label: { type: 'string', maxLength: 500 }
  };

  if (['open', 'navigate'].includes(action)) {
    return { type: 'object', properties: urlProperties, required: ['url'], additionalProperties: false };
  }
  if (action === 'type') {
    return {
      type: 'object',
      properties: {
        ...selectorProperties,
        value: { type: 'string', maxLength: 5000 }
      },
      required: ['value'],
      additionalProperties: false
    };
  }
  if (['click'].includes(action)) {
    return { type: 'object', properties: selectorProperties, required: [], additionalProperties: false };
  }
  if (action === 'select') {
    return {
      type: 'object',
      properties: {
        ...selectorProperties,
        value: { type: 'string', maxLength: 500 },
        index: { type: 'integer', minimum: 0, maximum: 500 }
      },
      required: ['selector'],
      additionalProperties: false
    };
  }
  if (action === 'scroll') {
    return {
      type: 'object',
      properties: {
        ...baseProperties,
        x: { type: 'integer', minimum: -5000, maximum: 5000 },
        y: { type: 'integer', minimum: -5000, maximum: 5000 },
        pixels: { type: 'integer', minimum: -5000, maximum: 5000 }
      },
      additionalProperties: false
    };
  }
  if (action === 'extract') {
    return {
      type: 'object',
      properties: {
        ...baseProperties,
        selector: { type: 'string', maxLength: 500 },
        maxLength: { type: 'integer', minimum: 100, maximum: 20000 }
      },
      additionalProperties: false
    };
  }
  if (action === 'screenshot') {
    return { type: 'object', properties: { ...baseProperties, fullPage: { type: 'boolean' } }, additionalProperties: false };
  }
  if (action === 'wait') {
    return {
      type: 'object',
      properties: {
        ...baseProperties,
        selector: { type: 'string', maxLength: 500 },
        ms: { type: 'integer', minimum: 100, maximum: 30000 },
        timeoutMs: { type: 'integer', minimum: 100, maximum: 30000 }
      },
      additionalProperties: false
    };
  }
  if (action === 'ask_user') {
    return {
      type: 'object',
      properties: {
        question: { type: 'string', minLength: 2, maxLength: 500 },
        choices: { type: 'array', items: { type: 'string', maxLength: 80 }, maxItems: 4 }
      },
      required: ['question'],
      additionalProperties: false
    };
  }
  return { type: 'object', properties: baseProperties, additionalProperties: false };
}

function registerBrowserTools(registry, browserSystem = defaultBrowserSystem) {
  for (const name of BROWSER_TOOL_NAMES) {
    const action = name.replace(/^browser\./, '');
    registry.register({
      name,
      description: `Browser automation tool for ${action}. Browser automation interacts with webpages; web search is for reading information.`,
      risk: ['click', 'type', 'select', 'close'].includes(action) ? 'low_write' : 'read',
      toolset: 'browser',
      requiresConfirmation: ['click', 'type', 'select'].includes(action),
      allowedRoles: ['admin', 'cashier', 'user'],
      schema: browserToolSchema(name),
      execute: (args, ctx) => browserSystem.actions.execute(name, args, ctx)
    });
  }
}

module.exports = {
  BROWSER_TOOL_NAMES,
  browserToolSchema,
  createBrowserSystem,
  defaultBrowserSystem,
  registerBrowserTools
};
