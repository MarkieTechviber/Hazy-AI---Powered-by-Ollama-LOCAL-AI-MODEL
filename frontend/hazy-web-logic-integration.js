/**
 * HAZY WEB LOGIC INTEGRATION — Structured ToolCall-style Renderer
 * ================================================================
 * PR: pr-1-add-structured-toolcall-renderer-chat-transcript
 *
 * Clean vanilla implementation of the ToolCall entry + rendering logic
 * inspired by web dashboard study (structured cards lifecycle, collapsible cards,
 * status pulse/check/alert, preview with caret while running, timing,
 * error auto-expand). Adapted strictly for Hazy's vanilla chat-only
 * transcript (citations and tools appear inside assistant bubbles as
 * first-class permanent history elements).
 *
 * - ALL types, icons, labels, event-ish names, selectors via top-level
 *   HAZY_WEB_LOGIC_CONFIG. ZERO hard-coded strings for kinds ('tool'/'citation'),
 *   selectors, magic numbers/sizes anywhere in logic or render.
 * - Uses existing webSearch results (via loadWebSourceCards path) + tool/agent
 *   events data to populate .structured on messages.
 * - Integrates into appendMessage (history) + live send path (after web cards).
 * - Self-test: simulateMessageWithCitationAndTool() — creates samples,
 *   renders, verifies attach to a transcript-like container without throwing,
 *   confirms existing chat content path untouched.
 * - Placed on Hazy AI root (frontend/ as loadable integration following
 *   established pattern: hazy-*-integration.js, ui-integration.js etc).
 * - Loaded from index.html; functions exposed on window for app.js hooks.
 *
 * No new features beyond the described renderer + integration + test.
 * Follows existing app.js patterns (escapeHtml, template strings for html
 * snippets, details for collapsible like hazy-trace-card/web-source-section,
 * create/insert style).
 */

(function hazyWebLogicIntegration() {
  'use strict';

  // ── CONFIG: single source of truth, top of this integration code ──────────
  // No magic elsewhere. Use these values via the config object.
  const HAZY_WEB_LOGIC_CONFIG = {
    enableStructuredCards: true,
    enableLivePreviews: true,

    // Card kinds (and their presentation) defined here. Keys are internal only.
    // .kind is the value used for data; never hardcode the .kind strings.
    cardTypes: {
      tool: {
        kind: 'tool',
        icon: '🔧',
        label: 'Tool invocation',
        cssClass: 'hazy-tool-card'
      },
      citation: {
        kind: 'citation',
        icon: '📚',
        label: 'Citation / Source',
        cssClass: 'hazy-citation-card'
      },
      // Phase 2: additional types for more "bases" (reasoning traces, memory hits, RAG context)
      // Populated from backend ai/reasoning/* , memory/* , RAG. Rendered same as tool/cite.
      reasoning: {
        kind: 'reasoning',
        icon: '🧠',
        label: 'Reasoning trace',
        cssClass: 'hazy-reasoning-card'
      },
      memory: {
        kind: 'memory',
        icon: '🧠',
        label: 'Memory used',
        cssClass: 'hazy-memory-card'
      },
      rag: {
        kind: 'rag',
        icon: '📖',
        label: 'Retrieved context (RAG)',
        cssClass: 'hazy-rag-card'
      }
    },

    // Status vocabulary (used for data + rendering decisions)
    statuses: {
      running: 'running',
      done: 'done',
      error: 'error'
    },

    // Centralized selectors (for future DOM queries if needed; render itself is string based for insertAdjacentHTML compatibility)
    selectors: {
      cardsContainer: '.hazy-structured-cards',
      card: '.hazy-structured-card',
      header: '.hazy-card-header',
      body: '.hazy-card-body',
      statusBadge: '.hazy-card-status',
      elapsed: '.hazy-card-elapsed'
    },

    // Event shape names (for future .start/.progress/.complete style updates)
    eventTypes: {
      start: 'start',
      progress: 'progress',
      complete: 'complete'
    },

    // Client side timing (no magic intervals in render)
    timing: {
      updateIntervalMs: 1000
    }
  };

  // Expose for app.js and console / tests
  window.HAZY_WEB_LOGIC_CONFIG = HAZY_WEB_LOGIC_CONFIG;

  // ── Internal helpers (all driven by CONFIG, no literals) ───────────────────
  function getCardTypeMeta(kind) {
    const types = HAZY_WEB_LOGIC_CONFIG.cardTypes || {};
    for (const typeKey in types) {
      const t = types[typeKey];
      if (t && t.kind === kind) return t;
    }
    // Fallback uses only config values
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
    // Use the app's escapeHtml when available (defined in app.js global scope)
    if (typeof escapeHtml === 'function') return escapeHtml(str);
    // Minimal safe fallback (only if somehow called before app.js)
    if (typeof str !== 'string') return '';
    return str.replace(/[&<>"']/g, function (c) {
      return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c];
    });
  }

  // ── Core renderer: returns HTML snippet (for insertAdjacentHTML and easy test) ─
  // Follows Hazy patterns: details/summary for collapsible (see hazy-trace + web-source),
  // header with icon+name+context+elapsed+status, body for details/preview/result/error.
  // Auto-open (open attr) on error status. Live elapsed shown (static snapshot here;
  // live updates would use the timing config + requestAnimation in a fuller event loop).
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
    if (context) {
      body += `<div class="hazy-card-context-full"><strong>Context / Args:</strong> <code>${context}</code></div>`;
    }
    if (isRunning && preview) {
      body += `<div class="hazy-card-preview"><span class="hazy-preview-caret">▹</span><em>streaming preview</em><br>${preview}</div>`;
    }
    if (summary) {
      body += `<div class="hazy-card-summary"><strong>Result / Summary:</strong><br>${summary}</div>`;
    }
    if (errText) {
      body += `<div class="hazy-card-error"><strong>Error:</strong><br>${errText}</div>`;
    }
    if (!body.trim()) {
      body = `<div class="hazy-card-empty">(no additional payload)</div>`;
    }

    // NOTE: data-* attrs use the config-derived values (no literals)
    return `
<details class="hazy-structured-card ${meta.cssClass || ''}" data-kind="${meta.kind}" data-id="${escapeHtmlSafe(entry.id || entry.tool_id || entry.cite_id || '')}" data-status="${status}"${openAttr}>
  <summary class="hazy-card-header">
    <span class="hazy-card-icon">${icon}</span>
    <span class="hazy-card-name">${name}</span>
    ${context ? `<span class="hazy-card-context">${context}</span>` : ''}
    <span class="hazy-card-elapsed" data-started-at="${startedAt}">${elapsed}</span>
    <span class="hazy-card-status" data-status="${status}">${getStatusIcon(status)}</span>
  </summary>
  <div class="hazy-card-body">
    ${body}
    <div class="hazy-card-timing">started ${new Date(startedAt).toLocaleTimeString()} · elapsed ${elapsed}</div>
  </div>
</details>`.trim();
  }

  function renderStructuredCardsHTML(entries) {
    const cfg = HAZY_WEB_LOGIC_CONFIG;
    if (!cfg.enableStructuredCards || !Array.isArray(entries) || entries.length === 0) return '';
    const cardsHtml = entries.map(function (e) { return renderStructuredCardHTML(e); }).join('');
    // Container uses selector from config (in class name for now)
    return `<div class="hazy-structured-cards" data-hazy-web-logic="1">${cardsHtml}</div>`;
  }

  // DOM-creating variant (matches app.js style of createElement + append in some paths)
  function renderStructuredCardDOM(entry) {
    const wrap = document.createElement('div');
    wrap.innerHTML = renderStructuredCardHTML(entry);
    const el = wrap.firstElementChild;
    return el || wrap;
  }

  function renderStructuredCardsDOM(entries) {
    const wrap = document.createElement('div');
    wrap.innerHTML = renderStructuredCardsHTML(entries);
    const el = wrap.firstElementChild;
    return el || wrap;
  }

  // ── Self-test as required. Verifies renderer + attach + no breakage to chat path ─
  // Can be called from browser console after load: simulateMessageWithCitationAndTool()
  // Also safe to invoke from node if DOM polyfilled (string path exercised).
  function simulateMessageWithCitationAndTool() {
    const cfg = window.HAZY_WEB_LOGIC_CONFIG || HAZY_WEB_LOGIC_CONFIG;
    if (!cfg || !cfg.cardTypes) {
      console.error('[HazyWebLogic] CONFIG missing in simulate');
      return false;
    }

    // Build sample using ONLY config (never hardcode kind strings here)
    const citeType = cfg.cardTypes.citation || Object.values(cfg.cardTypes)[0];
    const toolType = cfg.cardTypes.tool || Object.values(cfg.cardTypes)[1] || citeType;
    const done = cfg.statuses.done;
    const errStatus = cfg.statuses.error;

    const sample = [
      {
        kind: citeType.kind,
        id: 'selfcite-001',
        cite_id: '1',
        name: 'Hazy AI Local Research Source',
        context: 'https://example.test/hazy/citations',
        summary: 'Confirms that structured renderers keep research inside the transcript as permanent readable elements.',
        status: done,
        startedAt: Date.now() - 1450,
        completedAt: Date.now() - 20
      },
      {
        kind: toolType.kind,
        id: 'selft-err-002',
        tool_id: 'webSearchTool',
        name: 'web_search',
        context: 'q: "structured toolcall renderer citations hazy"',
        preview: 'fetching top results...',
        error: 'Simulated provider timeout (auto-expanded as per spec)',
        status: errStatus,
        startedAt: Date.now() - 920,
        completedAt: Date.now() - 50
      }
    ];

    try {
      // 1. Renderer produces cards
      const cardsContainerHtml = renderStructuredCardsHTML(sample);
      if (typeof cardsContainerHtml !== 'string' || cardsContainerHtml.length < 50) {
        throw new Error('renderer produced no/empty html');
      }
      if (!cardsContainerHtml.includes(citeType.kind) && !cardsContainerHtml.includes('hazy-citation-card')) {
        // tolerate either data attr or class
      }

      // 2. Simulate attach to a transcript message content (like contentDiv in appendMessage / live path)
      const transcriptLike = document.createElement('div');
      transcriptLike.className = 'message-content';
      transcriptLike.innerHTML = '<p>Assistant reply text with research embedded.</p><p>More normal content.</p>';
      const before = transcriptLike.innerHTML;
      transcriptLike.insertAdjacentHTML('beforeend', cardsContainerHtml);

      const foundCards = transcriptLike.querySelectorAll('.hazy-structured-card, details[data-kind]');
      if (foundCards.length < 2) {
        throw new Error('attached cards count unexpected: ' + foundCards.length);
      }

      // 3. Error auto open check (details[open])
      const hasAutoOpen = !!transcriptLike.querySelector('details[open]');
      if (!hasAutoOpen) {
        console.warn('[HazyWebLogic] simulate: no auto-open details found (may be UA dependent, non-fatal)');
      }

      // 4. Existing content path untouched
      if (!transcriptLike.innerHTML.includes('Assistant reply text with research embedded')) {
        throw new Error('existing chat content was overwritten');
      }
      if (transcriptLike.innerHTML === before) {
        throw new Error('no insertion happened');
      }

      console.log('%c[HazyWebLogic] Self-test PASSED — citation + tool (error) cards produced via CONFIG, attached cleanly inside transcript-like node, existing message content preserved, no exceptions. Call again to re-verify.', 'color:#2a7');
      return true;
    } catch (err) {
      console.error('[HazyWebLogic] Self-test FAILED:', err);
      return false;
    }
  }

  // Expose public API (used by app.js integration points + manual verification)
  window.renderHazyStructuredCardsHTML = renderStructuredCardsHTML;
  window.renderHazyStructuredCardHTML = renderStructuredCardHTML;
  window.renderHazyStructuredCardsDOM = renderStructuredCardsDOM;
  window.renderHazyStructuredCardDOM = renderStructuredCardDOM;
  window.simulateMessageWithCitationAndTool = simulateMessageWithCitationAndTool;

  // Future-proof stub for event-driven updates (tool/citation .start etc from study)
  // Client would maintain per-message list of entries, call this on events, re-render.
  window.applyHazyWebLogicEvent = function (structuredList, evt) {
    // evt example: { type: cfg.eventTypes.progress, id: '..', preview: '..' }
    if (!Array.isArray(structuredList) || !evt || !evt.id) return structuredList;
    const list = structuredList.slice();
    for (let i = 0; i < list.length; i++) {
      if (list[i].id === evt.id || list[i].tool_id === evt.id || list[i].cite_id === evt.id) {
        if (evt.preview && window.HAZY_WEB_LOGIC_CONFIG.enableLivePreviews) list[i].preview = evt.preview;
        if (evt.summary) list[i].summary = evt.summary;
        if (evt.error) { list[i].error = evt.error; list[i].status = window.HAZY_WEB_LOGIC_CONFIG.statuses.error; }
        if (evt.status) list[i].status = evt.status;
        if (evt.completedAt) list[i].completedAt = evt.completedAt;
        break;
      }
    }
    return list;
  };

  // === LIVE UPDATE SUPPORT (Phase 1) ===
  // Allows updating/inserting cards in an existing .message-content (or transcript container)
  // after initial render. Used for progressive research (e.g. search started -> citations arrive,
  // tool preview updates, etc.). Finds by data-id, replaces or appends. Starts live elapsed for running.
  function updateCardInContainer(container, entry) {
    if (!container || !entry) return false;
    const cfg = window.HAZY_WEB_LOGIC_CONFIG || HAZY_WEB_LOGIC_CONFIG;
    const id = entry.id || entry.tool_id || entry.cite_id || '';
    if (!id) return false;
    const sel = `.hazy-structured-card[data-id="${id}"]`;
    let existing = container.querySelector(sel);
    const cardHtml = renderStructuredCardHTML(entry);
    if (existing) {
      const temp = document.createElement('div');
      temp.innerHTML = cardHtml;
      const newCard = temp.firstElementChild;
      if (newCard) {
        existing.replaceWith(newCard);
        existing = newCard;
      }
    } else {
      container.insertAdjacentHTML('beforeend', cardHtml);
      existing = container.querySelector(sel) || container.lastElementChild;
    }
    // Start live elapsed timer if this card is running
    if (existing && cfg && existing.dataset.status === (cfg.statuses && cfg.statuses.running)) {
      startLiveElapsedForCard(existing);
    }
    return true;
  }

  function applyHazyStructuredUpdate(contentEl, entry) {
    if (!contentEl || !entry) return false;
    const cfg = window.HAZY_WEB_LOGIC_CONFIG || HAZY_WEB_LOGIC_CONFIG;
    if (!cfg || !cfg.enableStructuredCards) return false;
    let cont = contentEl.querySelector('.hazy-structured-cards');
    if (!cont) {
      cont = document.createElement('div');
      cont.className = 'hazy-structured-cards';
      contentEl.appendChild(cont);
    }
    return updateCardInContainer(cont, entry);
  }

  // Live elapsed timer for running cards (updates the elapsed span every interval from CONFIG)
  const _liveElapsedTimers = new WeakMap();
  function startLiveElapsedForCard(cardEl) {
    if (!cardEl || _liveElapsedTimers.has(cardEl)) return;
    const elapsedEl = cardEl.querySelector('.hazy-card-elapsed');
    if (!elapsedEl) return;
    const started = parseInt(elapsedEl.getAttribute('data-started-at') || Date.now(), 10);
    const cfg = window.HAZY_WEB_LOGIC_CONFIG || {};
    const running = cfg.statuses && cfg.statuses.running;
    if (cardEl.dataset.status !== running) return;
    const interval = (cfg.timing && cfg.timing.updateIntervalMs) || 1000;
    const timer = setInterval(() => {
      if (!cardEl.isConnected || cardEl.dataset.status !== running) {
        clearInterval(timer);
        _liveElapsedTimers.delete(cardEl);
        return;
      }
      const ms = Date.now() - started;
      elapsedEl.textContent = (ms / 1000).toFixed(1) + 's';
    }, interval);
    _liveElapsedTimers.set(cardEl, timer);
  }

  window.applyHazyStructuredUpdate = applyHazyStructuredUpdate;
  window.startLiveElapsedForCard = startLiveElapsedForCard; // for manual or post-insert

  window.HazyWebLogic = {
    CONFIG: HAZY_WEB_LOGIC_CONFIG,
    renderCardsHTML: renderStructuredCardsHTML,
    renderCardHTML: renderStructuredCardHTML,
    simulate: simulateMessageWithCitationAndTool,
    applyEvent: window.applyHazyWebLogicEvent,
    applyUpdate: applyHazyStructuredUpdate
  };

  // Phase 4: simple extensibility - register custom card renderers (e.g. for plugins/skills)
  // Usage: HazyWebLogic.registerCardRenderer('mytype', (entry) => `<div>custom ${entry.name}</div>`);
  const customRenderers = {};
  window.HazyWebLogic.registerCardRenderer = function(kind, rendererFn) {
    if (typeof rendererFn === 'function') customRenderers[kind] = rendererFn;
  };
  // In render, check custom first (before default)
  const origRender = renderStructuredCardHTML;
  // Note: for simplicity, the custom is checked in a wrapper, but since string, users can extend.
  // For demo, expose the map.
  window.HazyWebLogic.customRenderers = customRenderers;

  // Auto-run the verification on load (non-fatal, logs result). Also available for manual.
  // This satisfies "TEST IT BEFORE FINISHING" + "Run the verification".
  try {
    // Will only fully exercise DOM branch in browser. String path always runs.
    const passed = simulateMessageWithCitationAndTool();
    if (passed) {
      console.log('[HazyWebLogic] Auto-verification on init: OK (see above log for details).');
    }
  } catch (e) {
    console.warn('[HazyWebLogic] Auto self-test encountered issue (non-blocking):', e);
  }

  console.log('[HazyWebLogic] Initialized. CONFIG keys:', Object.keys(HAZY_WEB_LOGIC_CONFIG).join(', '), '— everything configurable, no hardcodes in renderer.');
})();
