'use strict';

const path = require('path');
const { publicFetch } = require('../security/publicNetwork');

class BrowserSessionManager {
  constructor({ store, streamer, staleMs = 15 * 60_000 } = {}) {
    this.store = store;
    this.streamer = streamer;
    this.staleMs = staleMs;
    this.sessions = new Map();
  }

  async loadPlaywright() {
    try {
      return require('playwright');
    } catch (error) {
      const missing = new Error('Browser automation needs Playwright. Install it in backend with: npm install playwright');
      missing.code = 'BROWSER_ENGINE_MISSING';
      missing.cause = error;
      throw missing;
    }
  }

  async startSession(ctx = {}, options = {}) {
    await this.closeStaleSessions();
    if (this.sessions.size >= 4) throw new Error('Browser session limit reached; close an existing session.');
    const reusable = this.getReusableSession(ctx);
    if (reusable) {
      reusable.updatedAt = new Date().toISOString();
      reusable.status = reusable.paused ? 'paused' : 'active';
      return reusable;
    }

    const { chromium } = await this.loadPlaywright();
    const browser = await chromium.launch({
      headless: options.headless !== false,
      args: ['--disable-dev-shm-usage']
    });
    const context = await browser.newContext({
      viewport: options.viewport || { width: 1365, height: 768 },
      userAgent: 'HazyBrowserAutomation/1.0',
      serviceWorkers: 'block',
      acceptDownloads: false
    });
    await context.route('**/*', async route => {
      try {
        const request = route.request();
        const headers = { ...request.headers(), 'accept-encoding': 'identity' };
        delete headers.host;
        const response = await publicFetch(request.url(), {
          method: request.method(), headers, body: request.postDataBuffer() || undefined,
          maxBytes: 8 * 1024 * 1024,
          signal: AbortSignal.timeout(10000),
          allowLocalhost: process.env.HAZY_BROWSER_ALLOW_PRIVATE_NETWORK === '1'
        });
        const responseHeaders = Object.fromEntries(response.headers);
        delete responseHeaders['transfer-encoding'];
        await route.fulfill({ status: response.status, headers: responseHeaders, body: Buffer.from(await response.arrayBuffer()) });
      } catch { await route.abort('blockedbyclient').catch(() => {}); }
    });
    if (context.routeWebSocket) await context.routeWebSocket('**/*', socket => socket.close());
    const page = await context.newPage();
    const session = {
      id: this.store?.makeId?.('browser-session') || `browser-session-${Date.now()}`,
      userId: ctx.userId || 'local-user',
      chatId: ctx.chatId || 'default',
      browser,
      context,
      page,
      status: 'active',
      paused: false,
      cancelled: false,
      currentUrl: 'about:blank',
      currentTitle: '',
      lastObservation: null,
      screenshotPath: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    this.sessions.set(session.id, session);
    this.recordSession(session, 'browser.session.started');
    return session;
  }

  getReusableSession(ctx = {}) {
    const userId = ctx.userId || 'local-user';
    const chatId = ctx.chatId || 'default';
    for (const session of this.sessions.values()) {
      if (session.userId === userId
        && session.chatId === chatId
        && !session.cancelled
        && session.status !== 'closed'
        && Date.now() - new Date(session.updatedAt || session.createdAt).getTime() <= this.staleMs) {
        return session;
      }
    }
    return null;
  }

  getSession(sessionId, ctx = {}) {
    const session = sessionId ? this.sessions.get(sessionId) : this.getReusableSession(ctx);
    if (!session) return null;
    if (ctx.userId && session.userId !== ctx.userId) return null;
    if (ctx.chatId && session.chatId !== ctx.chatId) return null;
    return session;
  }

  async ensureSession(ctx = {}, options = {}) {
    const existing = options.sessionId ? this.getSession(options.sessionId, ctx) : this.getReusableSession(ctx);
    if (existing) return existing;
    return this.startSession(ctx, options);
  }

  async refreshState(session) {
    if (!session?.page || session.status === 'closed') return session;
    try {
      session.currentUrl = session.page.url();
      session.currentTitle = await session.page.title().catch(() => '');
    } catch {}
    session.updatedAt = new Date().toISOString();
    this.recordSession(session, 'browser.session.updated');
    return session;
  }

  async pause(sessionId, ctx = {}) {
    const session = this.getSession(sessionId, ctx);
    if (!session) return null;
    session.paused = true;
    session.status = 'paused';
    session.updatedAt = new Date().toISOString();
    this.recordSession(session, 'browser.session.paused');
    return session;
  }

  async resume(sessionId, ctx = {}) {
    const session = this.getSession(sessionId, ctx);
    if (!session) return null;
    session.paused = false;
    session.status = 'active';
    session.updatedAt = new Date().toISOString();
    this.recordSession(session, 'browser.session.resumed');
    return session;
  }

  async cancel(sessionId, ctx = {}) {
    const session = this.getSession(sessionId, ctx);
    if (!session) return null;
    session.cancelled = true;
    session.status = 'cancelled';
    session.updatedAt = new Date().toISOString();
    this.recordSession(session, 'browser.session.cancelled');
    return session;
  }

  async close(sessionId, ctx = {}) {
    const session = this.getSession(sessionId, ctx);
    if (!session) return null;
    session.status = 'closed';
    session.updatedAt = new Date().toISOString();
    try { await session.context?.close?.(); } catch {}
    try { await session.browser?.close?.(); } catch {}
    this.sessions.delete(session.id);
    this.recordSession(session, 'browser.session.closed');
    return session;
  }

  async closeStaleSessions() {
    const now = Date.now();
    for (const session of Array.from(this.sessions.values())) {
      const age = now - new Date(session.updatedAt || session.createdAt).getTime();
      if (age > this.staleMs) {
        await this.close(session.id, { userId: session.userId }).catch(() => {});
      }
    }
  }

  async assertRunnable(session) {
    if (!session) {
      const error = new Error('No browser session is available.');
      error.code = 'NO_BROWSER_SESSION';
      throw error;
    }
    if (session.cancelled || session.status === 'cancelled') {
      const error = new Error('The browser run was cancelled.');
      error.code = 'BROWSER_CANCELLED';
      throw error;
    }
    if (session.paused || session.status === 'paused') {
      const error = new Error('The browser run is paused.');
      error.code = 'BROWSER_PAUSED';
      throw error;
    }
    if (session.status === 'closed') {
      const error = new Error('The browser session is closed.');
      error.code = 'BROWSER_CLOSED';
      throw error;
    }
  }

  recordSession(session, type) {
    const publicSession = this.publicSession(session);
    this.store?.saveSession?.(publicSession);
    this.streamer?.publish?.(type, publicSession);
  }

  publicSession(session) {
    if (!session) return null;
    return {
      id: session.id,
      userId: session.userId,
      chatId: session.chatId,
      status: session.status,
      paused: session.paused,
      cancelled: session.cancelled,
      currentUrl: session.currentUrl,
      currentTitle: session.currentTitle,
      lastObservation: session.lastObservation,
      screenshotPath: session.screenshotPath ? path.normalize(session.screenshotPath) : null,
      createdAt: session.createdAt,
      updatedAt: session.updatedAt
    };
  }

  listSessions(userId = 'local-user') {
    return Array.from(this.sessions.values())
      .filter((session) => !userId || session.userId === userId)
      .map((session) => this.publicSession(session));
  }
}

module.exports = { BrowserSessionManager };
