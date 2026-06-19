'use strict';

const fs = require('fs');
const { classifyUrl, requiresConfirmation } = require('./browserSafety');

function normalizeSelector(args = {}) {
  return args.selector || args.text || args.label || args.name || '';
}

async function clickByTextOrSelector(page, selector) {
  if (!selector) throw new Error('A selector or visible text is required.');
  if (/^[#.[]|^(button|a|input|textarea|select|form|div|span|main|section)\b/i.test(selector)) {
    await page.locator(selector).first().click({ timeout: 5000 });
    return;
  }
  await page.getByText(selector, { exact: false }).first().click({ timeout: 5000 });
}

async function typeByTextOrSelector(page, selector, value) {
  if (!selector) throw new Error('A selector, label, or placeholder is required.');
  const candidates = [
    () => page.locator(selector).first(),
    () => page.getByLabel(selector).first(),
    () => page.getByPlaceholder(selector).first()
  ];
  let lastError;
  for (const makeLocator of candidates) {
    try {
      const locator = makeLocator();
      await locator.fill(String(value ?? ''), { timeout: 3000 });
      return;
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError || new Error('Could not find a fillable element.');
}

class BrowserActions {
  constructor({ sessionManager, observer, store, streamer } = {}) {
    this.sessionManager = sessionManager;
    this.observer = observer;
    this.store = store;
    this.streamer = streamer;
  }

  async execute(actionName, args = {}, ctx = {}) {
    const action = actionName.replace(/^browser\./, '');
    const userId = ctx.userId || args.userId || 'local-user';
    const chatId = ctx.chatId || args.chatId || 'default';
    const actionId = this.store?.makeId?.('browser-action') || `browser-action-${Date.now()}`;
    const eventBase = { id: actionId, userId, chatId, action, sessionId: args.sessionId || null };
    this.record('browser.action.started', { ...eventBase, args });

    let session = null;
    try {
      if (['open', 'navigate'].includes(action)) {
        const safety = classifyUrl(args.url, args.safety || {});
        if (!safety.allowed) return this.blocked(eventBase, safety);
      }

      session = await this.sessionManager.ensureSession({ userId, chatId }, {
        sessionId: args.sessionId,
        headless: args.headless,
        viewport: args.viewport
      });
      eventBase.sessionId = session.id;

      if (action !== 'open') await this.sessionManager.assertRunnable(session);

      const pageState = session.lastObservation || {};
      const confirmation = requiresConfirmation({
        type: action,
        selector: normalizeSelector(args),
        text: args.text || args.value || args.url || ''
      }, pageState);
      if (confirmation.required && args.confirmed !== true) {
        const result = {
          ok: false,
          status: 'confirmation_required',
          confirmation: {
            code: confirmation.code,
            message: confirmation.message,
            action,
            selector: normalizeSelector(args),
            sessionId: session.id
          }
        };
        this.record('browser.action.confirmation_required', { ...eventBase, result });
        return result;
      }

      const actionResult = await this.runAction(action, args, session);
      await this.sessionManager.refreshState(session);
      const observation = await this.observer.observe(session, { screenshot: args.screenshot !== false });
      const result = {
        ok: true,
        status: 'done',
        action,
        session: this.sessionManager.publicSession(session),
        actionResult,
        observation
      };
      this.record('browser.observation', { ...eventBase, observation });
      this.record('browser.action.done', { ...eventBase, result });
      return result;
    } catch (error) {
      const result = {
        ok: false,
        status: 'error',
        error: {
          code: error.code || 'BROWSER_ACTION_FAILED',
          message: error.message || 'Browser action failed.'
        },
        session: session ? this.sessionManager.publicSession(session) : null
      };
      this.record('browser.action.done', { ...eventBase, result });
      return result;
    }
  }

  async runAction(action, args, session) {
    const page = session.page;
    switch (action) {
      case 'open':
      case 'navigate': {
        const safety = classifyUrl(args.url, args.safety || {});
        await page.goto(safety.url, {
          waitUntil: args.waitUntil || 'domcontentloaded',
          timeout: Math.min(Number(args.timeoutMs) || 15_000, 45_000)
        });
        return { url: page.url() };
      }
      case 'observe':
        return { observed: true };
      case 'click':
        await clickByTextOrSelector(page, normalizeSelector(args));
        return { clicked: normalizeSelector(args) };
      case 'type':
        await typeByTextOrSelector(page, normalizeSelector(args), args.value ?? args.text ?? '');
        return { typed: true, selector: normalizeSelector(args), redacted: true };
      case 'select': {
        const selector = normalizeSelector(args);
        await page.locator(selector).first().selectOption(args.value || args.label || args.index, { timeout: 5000 });
        return { selected: true, selector };
      }
      case 'scroll': {
        const x = Number(args.x || 0);
        const y = Number(args.y || args.pixels || 600);
        await page.mouse.wheel(x, y);
        return { scrolled: { x, y } };
      }
      case 'extract':
        return this.observer.extract(session, args.selector || 'body', args);
      case 'screenshot': {
        const screenshotPath = this.store.screenshotPath(session.id);
        await page.screenshot({ path: screenshotPath, fullPage: args.fullPage === true });
        session.screenshotPath = fs.existsSync(screenshotPath) ? screenshotPath : null;
        return { screenshotPath: session.screenshotPath };
      }
      case 'wait': {
        if (args.selector) {
          await page.locator(args.selector).first().waitFor({ timeout: Math.min(Number(args.timeoutMs) || 5000, 30_000) });
        } else {
          await page.waitForTimeout(Math.min(Number(args.timeoutMs) || Number(args.ms) || 1000, 30_000));
        }
        return { waited: true };
      }
      case 'back':
        await page.goBack({ waitUntil: 'domcontentloaded', timeout: 10_000 }).catch(() => null);
        return { url: page.url() };
      case 'close':
        await this.sessionManager.close(session.id, { userId: session.userId });
        return { closed: true };
      case 'ask_user':
        return {
          question: args.question || 'Browser automation needs your confirmation.',
          choices: args.choices || ['Approve', 'Deny']
        };
      default: {
        const error = new Error(`Unsupported browser action: ${action}`);
        error.code = 'UNSUPPORTED_BROWSER_ACTION';
        throw error;
      }
    }
  }

  blocked(eventBase, safety) {
    const result = {
      ok: false,
      status: 'blocked',
      error: {
        code: safety.code,
        message: safety.message
      }
    };
    this.record('browser.action.blocked', { ...eventBase, result });
    return result;
  }

  record(type, payload) {
    const record = this.store?.saveEvent?.({ type, ...payload });
    this.streamer?.publish?.(type, record || payload);
  }
}

module.exports = { BrowserActions };
