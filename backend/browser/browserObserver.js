'use strict';

const fs = require('fs');
const { detectPageWarnings } = require('./browserSafety');

function trimText(text = '', max = 1400) {
  return String(text || '').replace(/\s+/g, ' ').trim().slice(0, max);
}

async function collectElements(page, selector, mapper, limit = 30) {
  return page.$$eval(selector, (nodes, source) => nodes.slice(0, source.limit).map((node, index) => {
    const rect = node.getBoundingClientRect();
    const label = (node.innerText || node.value || node.getAttribute('aria-label') || node.getAttribute('title') || node.name || node.id || '').trim();
    return {
      index,
      tag: node.tagName.toLowerCase(),
      text: label.slice(0, 160),
      selectorHint: node.id ? `#${node.id}` : (node.name ? `${node.tagName.toLowerCase()}[name="${node.name}"]` : null),
      role: node.getAttribute('role') || null,
      type: node.getAttribute('type') || null,
      href: node.getAttribute('href') || null,
      visible: rect.width > 0 && rect.height > 0
    };
  }), { limit, mapper }).catch(() => []);
}

class BrowserObserver {
  constructor({ store } = {}) {
    this.store = store;
  }

  async observe(session, options = {}) {
    const page = session.page;
    const includeScreenshot = options.screenshot === true || options.includeScreenshot === true;
    const [
      title,
      visibleTextSummary,
      interactiveElements,
      formsDetected,
      buttonsDetected,
      linksDetected,
      modalsOrDialogs
    ] = await Promise.all([
      page.title().catch(() => ''),
      page.locator('body').innerText({ timeout: 1500 }).then((text) => trimText(text)).catch(() => ''),
      collectElements(page, 'a, button, input, textarea, select, [role="button"], [role="link"], [contenteditable="true"]', null, 50),
      page.$$eval('form', (forms) => forms.slice(0, 20).map((form, index) => ({
        index,
        action: form.getAttribute('action') || '',
        method: form.getAttribute('method') || 'get',
        text: (form.innerText || '').replace(/\s+/g, ' ').trim().slice(0, 220),
        fieldCount: form.querySelectorAll('input, textarea, select, button').length
      }))).catch(() => []),
      collectElements(page, 'button, input[type="button"], input[type="submit"], [role="button"]', null, 40),
      collectElements(page, 'a[href], [role="link"]', null, 40),
      page.$$eval('[role="dialog"], dialog, [aria-modal="true"], .modal, .dialog', (nodes) => nodes.slice(0, 10).map((node, index) => ({
        index,
        text: (node.innerText || node.getAttribute('aria-label') || '').replace(/\s+/g, ' ').trim().slice(0, 300),
        visible: Boolean(node.offsetWidth || node.offsetHeight || node.getClientRects().length)
      }))).catch(() => [])
    ]);

    let screenshotPath = session.screenshotPath || null;
    if (includeScreenshot && this.store) {
      screenshotPath = this.store.screenshotPath(session.id);
      await page.screenshot({ path: screenshotPath, fullPage: false }).catch(() => null);
      if (!fs.existsSync(screenshotPath)) screenshotPath = null;
    }

    const observation = {
      sessionId: session.id,
      currentUrl: page.url(),
      pageTitle: title,
      visibleTextSummary,
      interactiveElements: interactiveElements.filter((item) => item.visible),
      formsDetected,
      buttonsDetected: buttonsDetected.filter((item) => item.visible),
      linksDetected: linksDetected.filter((item) => item.visible),
      modalsOrDialogs: modalsOrDialogs.filter((item) => item.visible),
      screenshotPath,
      safetyWarnings: [],
      observedAt: new Date().toISOString()
    };
    observation.safetyWarnings = detectPageWarnings(observation);

    session.currentUrl = observation.currentUrl;
    session.currentTitle = observation.pageTitle;
    session.lastObservation = observation;
    session.screenshotPath = screenshotPath;
    session.updatedAt = observation.observedAt;
    return observation;
  }

  async extract(session, selector = 'body', options = {}) {
    const text = await session.page.locator(selector).innerText({ timeout: options.timeoutMs || 3000 });
    return {
      selector,
      text: trimText(text, options.maxLength || 5000),
      url: session.page.url(),
      title: await session.page.title().catch(() => '')
    };
  }
}

module.exports = { BrowserObserver };
