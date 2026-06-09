/**
 * HAZY WEB LOGIC INTEGRATION — Structured ToolCall-style Renderer
 * ================================================================
 * PR: pr-1-add-structured-toolcall-renderer-chat-transcript
 *
 * This is the clean root-level source for the renderer (placed directly
 * under the Hazy AI project root as requested).
 *
 * The *runtime* copy that gets loaded by the browser lives at
 * frontend/hazy-web-logic-integration.js (to be served by the static
 * frontend dir and follow the established hazy-*-integration.js loading
 * pattern). Both files are kept in sync for this PR.
 *
 * See the frontend/ copy for the exact loaded version + full comments.
 * The implementation below is identical.
 */

(function hazyWebLogicIntegration() {
  'use strict';

  // ── CONFIG: single source of truth, top of this integration code ──────────
  const HAZY_WEB_LOGIC_CONFIG = {
    enableStructuredCards: true,
    enableLivePreviews: true,
    cardTypes: {
      tool: { kind: 'tool', icon: '🔧', label: 'Tool invocation', cssClass: 'hazy-tool-card' },
      citation: { kind: 'citation', icon: '📚', label: 'Citation / Source', cssClass: 'hazy-citation-card' }
    },
    statuses: { running: 'running', done: 'done', error: 'error' },
    selectors: {
      cardsContainer: '.hazy-structured-cards',
      card: '.hazy-structured-card',
      header: '.hazy-card-header',
      body: '.hazy-card-body',
      statusBadge: '.hazy-card-status',
      elapsed: '.hazy-card-elapsed'
    },
    eventTypes: { start: 'start', progress: 'progress', complete: 'complete' },
    timing: { updateIntervalMs: 1000 }
  };

  window.HAZY_WEB_LOGIC_CONFIG = HAZY_WEB_LOGIC_CONFIG;

  function getCardTypeMeta(kind) {
    const types = HAZY_WEB_LOGIC_CONFIG.cardTypes || {};
    for (const typeKey in types) { const t = types[typeKey]; if (t && t.kind === kind) return t; }
    return { kind: kind, icon: '📎', label: 'Action', cssClass: 'hazy-generic-card' };
  }

  function getStatusIcon(status) {
    const s = HAZY_WEB_LOGIC_CONFIG.statuses || {};
    if (status === s.running) return '⏳';
    if (status === s.done) return '✅';
    if (status === s.error) return '⚠️';
    return '•';
  }

  function escapeHtmlSafe(str) {
    if (typeof escapeHtml === 'function') return escapeHtml(str);
    if (typeof str !== 'string') return '';
    return str.replace(/[&<>"']/g, function (c) { return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]; });
  }

  function renderStructuredCardHTML(entry) {
    if (!entry || !entry.kind) return '';
    const cfg = HAZY_WEB_LOGIC_CONFIG;
    const meta = getCardTypeMeta(entry.kind);
    const status = entry.status || cfg.statuses.done;
    const isError = (status === cfg.statuses.error);
    const isRunning = (status === cfg.statuses.running);
    const startedAt = Number(entry.startedAt) || Date.now();
    const completedAt = entry.completedAt ? Number(entry.completedAt) : null;
    const elapsedMs = completedAt ? (completedAt - startedAt) : (Date.now() - startedAt);
    const elapsed = (elapsedMs / 1000).toFixed(1) + 's';
    const icon = meta.icon;
    const name = escapeHtmlSafe(entry.name || meta.label);
    const context = entry.context ? escapeHtmlSafe(entry.context) : '';
    const preview = (cfg.enableLivePreviews && entry.preview) ? escapeHtmlSafe(entry.preview) : '';
    const summary = entry.summary ? escapeHtmlSafe(entry.summary) : '';
    const errText = entry.error ? escapeHtmlSafe(entry.error) : '';
    const openAttr = isError ? ' open' : '';
    let body = '';
    if (context) body += `<div class="hazy-card-context-full"><strong>Context / Args:</strong> <code>${context}</code></div>`;
    if (isRunning && preview) body += `<div class="hazy-card-preview"><span class="hazy-preview-caret">▹</span><em>streaming preview</em><br>${preview}</div>`;
    if (summary) body += `<div class="hazy-card-summary"><strong>Result / Summary:</strong><br>${summary}</div>`;
    if (errText) body += `<div class="hazy-card-error"><strong>Error:</strong><br>${errText}</div>`;
    if (!body.trim()) body = `<div class="hazy-card-empty">(no additional payload)</div>`;
    return `
<details class="hazy-structured-card ${meta.cssClass || ''}" data-kind="${meta.kind}" data-id="${escapeHtmlSafe(entry.id || entry.tool_id || entry.cite_id || '')}" data-status="${status}"${openAttr}>
  <summary class="hazy-card-header"><span class="hazy-card-icon">${icon}</span><span class="hazy-card-name">${name}</span>${context ? `<span class="hazy-card-context">${context}</span>` : ''}<span class="hazy-card-elapsed" data-started-at="${startedAt}">${elapsed}</span><span class="hazy-card-status" data-status="${status}">${getStatusIcon(status)}</span></summary>
  <div class="hazy-card-body">${body}<div class="hazy-card-timing">started ${new Date(startedAt).toLocaleTimeString()} · elapsed ${elapsed}</div></div>
</details>`.trim();
  }

  function renderStructuredCardsHTML(entries) {
    const cfg = HAZY_WEB_LOGIC_CONFIG;
    if (!cfg.enableStructuredCards || !Array.isArray(entries) || entries.length === 0) return '';
    const cardsHtml = entries.map(function (e) { return renderStructuredCardHTML(e); }).join('');
    return `<div class="hazy-structured-cards" data-hazy-web-logic="1">${cardsHtml}</div>`;
  }

  function simulateMessageWithCitationAndTool() {
    const cfg = window.HAZY_WEB_LOGIC_CONFIG || HAZY_WEB_LOGIC_CONFIG;
    if (!cfg || !cfg.cardTypes) { console.error('[HazyWebLogic] CONFIG missing'); return false; }
    const citeType = cfg.cardTypes.citation || Object.values(cfg.cardTypes)[0];
    const toolType = cfg.cardTypes.tool || Object.values(cfg.cardTypes)[1] || citeType;
    const done = cfg.statuses.done;
    const errStatus = cfg.statuses.error;
    const sample = [
      { kind: citeType.kind, id: 'selfcite-001', cite_id: '1', name: 'Hazy AI Local Research Source', context: 'https://example.test/hazy/citations', summary: 'Confirms that structured renderers keep research inside the transcript as permanent readable elements.', status: done, startedAt: Date.now() - 1450, completedAt: Date.now() - 20 },
      { kind: toolType.kind, id: 'selft-err-002', tool_id: 'webSearchTool', name: 'web_search', context: 'q: "structured toolcall renderer citations hazy"', preview: 'fetching top results...', error: 'Simulated provider timeout (auto-expanded as per spec)', status: errStatus, startedAt: Date.now() - 920, completedAt: Date.now() - 50 }
    ];
    try {
      const cardsContainerHtml = renderStructuredCardsHTML(sample);
      if (typeof cardsContainerHtml !== 'string' || cardsContainerHtml.length < 50) throw new Error('renderer produced no/empty html');
      const transcriptLike = document.createElement('div');
      transcriptLike.className = 'message-content';
      transcriptLike.innerHTML = '<p>Assistant reply text with research embedded.</p><p>More normal content.</p>';
      const before = transcriptLike.innerHTML;
      transcriptLike.insertAdjacentHTML('beforeend', cardsContainerHtml);
      const foundCards = transcriptLike.querySelectorAll('.hazy-structured-card, details[data-kind]');
      if (foundCards.length < 2) throw new Error('attached cards count unexpected: ' + foundCards.length);
      const hasAutoOpen = !!transcriptLike.querySelector('details[open]');
      if (!hasAutoOpen) console.warn('[HazyWebLogic] simulate: no auto-open details found (non-fatal)');
      if (!transcriptLike.innerHTML.includes('Assistant reply text with research embedded')) throw new Error('existing chat content was overwritten');
      if (transcriptLike.innerHTML === before) throw new Error('no insertion happened');
      console.log('%c[HazyWebLogic] Self-test PASSED — citation + tool (error) cards produced via CONFIG, attached cleanly inside transcript-like node, existing message content preserved, no exceptions.', 'color:#2a7');
      return true;
    } catch (err) { console.error('[HazyWebLogic] Self-test FAILED:', err); return false; }
  }

  window.renderHazyStructuredCardsHTML = renderStructuredCardsHTML;
  window.renderHazyStructuredCardHTML = renderStructuredCardHTML;
  window.simulateMessageWithCitationAndTool = simulateMessageWithCitationAndTool;
  window.HazyWebLogic = { CONFIG: HAZY_WEB_LOGIC_CONFIG, renderCardsHTML: renderStructuredCardsHTML, renderCardHTML: renderStructuredCardHTML, simulate: simulateMessageWithCitationAndTool };

  try { simulateMessageWithCitationAndTool(); } catch (e) { console.warn('[HazyWebLogic] auto-test issue (non-blocking)', e); }
  console.log('[HazyWebLogic] Root-level clean renderer present (see frontend/ copy for runtime load).');
})();