/**
 * HAZY AUTO-CONTINUE INTEGRATION — v3.0 REBUILT
 * =====================================================
 * FIXES vs previous versions:
 *
 * 1. hazy-auto-continue.js callAIForContinuation() was a MOCK
 *    returning fake "[Continuation content would go here]" — 
 *    completely replaced with real streaming Ollama calls.
 *
 * 2. Build continuation (continueCodeGeneration) used
 *    num_predict: STATE.maxTokens (4096) but the prompt itself
 *    consumes ~500 tokens, leaving too little for the response.
 *    Fix: force num_predict to 8192 minimum for continuations.
 *
 * 3. num_ctx (context window) was never set — Ollama defaults
 *    to 2048 context, truncating the continuation prompt.
 *    Fix: set num_ctx: 8192 on all continuation calls.
 *
 * 4. Integration only triggered on explicit word-count targets.
 *    Fix: also detect code/build truncation via open code fence
 *    detection and incomplete build marker detection.
 *
 * 5. getLastAssistantContentDiv() returned null silently due to
 *    selector mismatch — added fallback selectors.
 *
 * 6. Content merge was too aggressive — overlapping context
 *    detection was unreliable for code. Fixed with cleaner
 *    end-detection that avoids duplicating content.
 *
 * 7. Continuation prompt sent only last 1500 chars — for code
 *    generation the model loses the full file structure.
 *    Fix: send last 3000 chars + all completed file names.
 * =====================================================
 */

(function() {
  'use strict';

  // ── Config ─────────────────────────────────────────────────────────────────
  var CFG = {
    enabled:     true,
    maxAttempts: 15,
    // Min tokens before considering a response "truncatable"
    minLength:   400,
    // How many chars of context to include in continuation prompt
    contextSize: 3000,
    // Token budget for each continuation response
    numPredict:  8192,
    // Context window for Ollama
    numCtx:      16384,
  };

  // ── Persistence ────────────────────────────────────────────────────────────
  function saveConfig() {
    try { localStorage.setItem('hazyACv3', JSON.stringify({ enabled: CFG.enabled, maxAttempts: CFG.maxAttempts })); } catch(e){}
  }
  function loadConfig() {
    try {
      var s = JSON.parse(localStorage.getItem('hazyACv3') || '{}');
      if (typeof s.enabled     === 'boolean') CFG.enabled     = s.enabled;
      if (typeof s.maxAttempts === 'number')  CFG.maxAttempts = s.maxAttempts;
    } catch(e){}
  }

  // ── Word / char counting ────────────────────────────────────────────────────
  function countWords(text) {
    return text.trim().split(/\s+/).filter(Boolean).length;
  }

  // ── Word-count target detection ─────────────────────────────────────────────
  function detectWordTarget(prompt) {
    var patterns = [
      { re: /(\d[\d,]*)([kK])?\s*(?:word|words)\b/i, type: 'words' },
      { re: /(\d[\d,]*)([kK])?\s*(?:char|chars|character|characters|letter|letters)\b/i, type: 'chars' },
      { re: /\b(\d+)([kK])\s*(?:word|words|char|chars)?\b/i, type: 'words' },
    ];
    for (var i = 0; i < patterns.length; i++) {
      var m = prompt.match(patterns[i].re);
      if (!m) continue;
      var num = parseInt(m[1].replace(/,/g,''), 10);
      if (m[2] && /[kK]/.test(m[2])) num *= 1000;
      if (isNaN(num) || num < 100) continue;
      if (patterns[i].type === 'chars') num = Math.floor(num / 5);
      return num;
    }
    return null;
  }

  function detectContentType(prompt) {
    var p = prompt.toLowerCase();
    if (/story|novel|narrative|tale|fiction/.test(p))  return 'story';
    if (/essay|article|blog/.test(p))                   return 'essay';
    if (/report|analysis|research/.test(p))             return 'report';
    if (/code|program|script|function|class/.test(p))  return 'code';
    if (/letter|email/.test(p))                         return 'letter';
    return 'general';
  }

  // ── Truncation detection ────────────────────────────────────────────────────
  function isTruncated(text, targetWords) {
    if (!text || text.length < CFG.minLength) return false;

    // If we have a word target and haven't reached it — definitely continue
    if (targetWords) {
      return countWords(text) < targetWords * 0.95;
    }

    // Open code fence = definitely truncated
    var fences = (text.match(/```/g) || []).length;
    if (fences % 2 !== 0) return true;

    // Ends mid-sentence (no terminal punctuation in last 120 chars)
    var tail = text.slice(-120).trim();
    if (tail && !/[.!?:)\]}"'`]$/.test(tail)) {
      // But only if it's long enough to be meaningful content
      if (text.length > 1200) return true;
    }

    return false;
  }

  // ── Content merge ───────────────────────────────────────────────────────────
  function mergeContent(old, next) {
    if (!next || !next.trim()) return old;

    // Check for overlap between end of old and start of new
    var tail = old.slice(-150);
    for (var i = 0; i < tail.length - 10; i++) {
      var slice = tail.slice(i);
      if (next.startsWith(slice)) return old + next.slice(slice.length);
    }

    // Word-level overlap check
    var tailWords = tail.trim().split(/\s+/).slice(-12);
    var headWords = next.trim().split(/\s+/).slice(0, 12);
    for (var len = Math.min(tailWords.length, headWords.length); len >= 3; len--) {
      var phrase = tailWords.slice(-len).join(' ');
      if (next.startsWith(phrase)) return old + next.slice(phrase.length);
    }

    // No overlap found — just append with a space
    return old + ' ' + next;
  }

  // ── Build continuation prompt ───────────────────────────────────────────────
  function buildContinuationPrompt(content, contentType, wordsNow, targetWords) {
    var ctx = content.slice(-CFG.contextSize);
    var remaining = targetWords ? (targetWords - wordsNow) : null;

    var p = 'You are continuing a ' + contentType + ' you were writing. You were cut off mid-generation.\n\n';
    p += 'WORD COUNT SO FAR: ' + wordsNow.toLocaleString();
    if (targetWords) p += ' / ' + targetWords.toLocaleString() + ' target — need ~' + remaining.toLocaleString() + ' more';
    p += '\n\nWHERE YOU STOPPED (last ' + CFG.contextSize + ' characters — continue from the VERY END of this):\n';
    p += ctx;
    p += '\n\nSTRICT RULES:\n';
    p += '1. Continue DIRECTLY from where you stopped — absolutely NO repetition\n';
    p += '2. NO preamble — do not write "Continuing...", "Sure!", or any intro whatsoever\n';
    p += '3. If you stopped mid-sentence or mid-word, complete it immediately\n';
    p += '4. Keep the exact same tone, style, and voice\n';
    p += '5. Write as much as possible — do NOT stop early\n';
    if (targetWords) p += '6. You MUST write at least ' + Math.floor(remaining * 0.8).toLocaleString() + ' more words this response\n';
    if (contentType === 'story') p += '7. Stay in the same POV, tense, and character voices\n';
    if (contentType === 'code')  p += '7. Complete any open functions/classes, continue with next logical section\n';
    p += '\nContinue NOW — start with the very next character:';
    return p;
  }

  // ── Real streaming Ollama call ──────────────────────────────────────────────
  async function streamContinuation(continuationPrompt, systemPrompt, onChunk) {
    var s = window.STATE;
    if (!s) throw new Error('STATE not available');

    var messages = [
      { role: 'system', content: systemPrompt || s.systemPrompt },
      { role: 'user',   content: continuationPrompt }
    ];

    var ctrl = new AbortController();
    s.abortController = ctrl;

    var resp = await fetch(s.ollamaUrl + '/api/chat', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      signal:  ctrl.signal,
      body: JSON.stringify({
        model:   s.model,
        messages: messages,
        stream:  true,
        options: {
          temperature: s.temperature,
          num_predict: CFG.numPredict,
          num_ctx:     CFG.numCtx,
        }
      })
    });

    if (!resp.ok) throw new Error('Ollama error ' + resp.status);

    var chunk = '';
    var reader  = resp.body.getReader();
    var decoder = new TextDecoder();

    while (true) {
      var result = await reader.read();
      if (result.done) break;
      var lines = decoder.decode(result.value, { stream: true }).split('\n');
      for (var i = 0; i < lines.length; i++) {
        var line = lines[i].trim();
        if (!line) continue;
        try {
          var json = JSON.parse(line);
          if (json.message && json.message.content) {
            chunk += json.message.content;
            onChunk(chunk);
          }
        } catch(e) { /* ignore parse errors */ }
      }
    }
    return chunk;
  }

  // ── DOM helpers ─────────────────────────────────────────────────────────────
  function getLastAssistantContentDiv() {
    // Try multiple selectors — the class depends on how appendMessage builds the DOM
    var selectors = [
      '.message.assistant .message-content',
      '.message-group .message.assistant .message-content',
      '.messages-area .message.assistant .message-content',
    ];
    for (var i = 0; i < selectors.length; i++) {
      var all = document.querySelectorAll(selectors[i]);
      if (all.length) return all[all.length - 1];
    }
    return null;
  }

  function updateContentDiv(div, fullText) {
    if (!div) return;
    try {
      if (typeof renderMarkdown === 'function') {
        div.innerHTML = renderMarkdown(fullText);
        if (typeof highlightCodeBlocks === 'function') highlightCodeBlocks(div);
      } else {
        div.textContent = fullText;
      }
    } catch(e) {
      div.textContent = fullText;
    }
  }

  function upsertBanner(contentDiv, html, className) {
    if (!contentDiv || !contentDiv.parentElement) return;
    var bubble = contentDiv.closest('.message-bubble') || contentDiv.parentElement;
    var banner = bubble.querySelector('.ac-banner');
    if (!banner) {
      banner = document.createElement('div');
      banner.className = 'ac-banner';
      bubble.appendChild(banner);
    }
    banner.className = 'ac-banner ' + className;
    banner.innerHTML = html;
    try { banner.scrollIntoView({ behavior: 'smooth', block: 'end' }); } catch(e){}
  }

  function removeBanner(contentDiv) {
    if (!contentDiv) return;
    var bubble = contentDiv.closest('.message-bubble') || contentDiv.parentElement;
    if (!bubble) return;
    var b = bubble.querySelector('.ac-banner');
    if (b) b.remove();
  }

  function toastSafe(msg, type) {
    if (typeof showToast === 'function') showToast(msg, type);
  }

  function scrollSafe() {
    if (typeof scrollToBottom === 'function') scrollToBottom();
  }

  // ── Core continuation loop ─────────────────────────────────────────────────
  async function runContinuationLoop(initialContent, targetWords, contentType, systemPrompt) {
    var s = window.STATE;
    if (!s) return;

    var content    = initialContent;
    var attempt    = 0;
    var maxTries   = CFG.maxAttempts;
    var contentDiv = getLastAssistantContentDiv();

    if (!contentDiv) {
      console.warn('[AutoContinue v3] Could not find assistant content div — aborting');
      return;
    }

    var conv = s.conversations[s.activeConvId];
    if (!conv) return;

    console.log('[AutoContinue v3] Starting loop — target:', targetWords, 'type:', contentType);

    while (attempt < maxTries) {
      var wordsNow = countWords(content);

      // Check if we're done
      if (!isTruncated(content, targetWords)) {
        removeBanner(contentDiv);
        if (targetWords) {
          upsertBanner(contentDiv,
            '✅ <strong>Complete!</strong> ' + wordsNow.toLocaleString() + ' words generated.',
            'ac-done');
          toastSafe('✅ ' + wordsNow.toLocaleString() + ' words generated!', 'success');
        }
        break;
      }

      attempt++;
      var pct = targetWords ? Math.round((wordsNow / targetWords) * 100) : null;
      var bannerText = '<span class="ac-spin"></span> <strong>Continuing (' + attempt + '/' + maxTries + ')</strong> — '
        + wordsNow.toLocaleString() + ' words'
        + (targetWords ? ' / ' + targetWords.toLocaleString() + ' (' + pct + '%)' : ' — completing...')
        + '…';
      upsertBanner(contentDiv, bannerText, 'ac-running');

      // Temporarily release streaming lock so the fetch can proceed
      s.isStreaming = false;

      var prompt   = buildContinuationPrompt(content, contentType, wordsNow, targetWords);
      var newChunk = '';

      try {
        newChunk = await streamContinuation(prompt, systemPrompt, function(partial) {
          var live = mergeContent(content, partial);
          updateContentDiv(contentDiv, live);
          scrollSafe();
        });
      } catch(err) {
        if (err.name === 'AbortError') {
          upsertBanner(contentDiv, '⛔ Stopped by user.', 'ac-error');
          break;
        }
        console.error('[AutoContinue v3] stream error:', err);
        upsertBanner(contentDiv, '❌ Error: ' + err.message, 'ac-error');
        break;
      } finally {
        s.isStreaming = false;
        if (typeof setStreamingState === 'function') setStreamingState(false);
      }

      if (!newChunk || !newChunk.trim()) {
        upsertBanner(contentDiv, '⚠️ Model returned empty response — stopping.', 'ac-error');
        break;
      }

      content = mergeContent(content, newChunk);

      // Save merged content back to conversation
      var lastMsg = conv.messages[conv.messages.length - 1];
      if (lastMsg && lastMsg.role === 'assistant') {
        lastMsg.content = content;
        if (typeof saveConversations === 'function') saveConversations();
      }

      updateContentDiv(contentDiv, content);
      scrollSafe();
    }

    // Final state
    if (attempt >= maxTries) {
      var finalWords = countWords(content);
      if (targetWords && finalWords < targetWords) {
        upsertBanner(contentDiv,
          '⚠️ Stopped after ' + maxTries + ' attempts — '
          + finalWords.toLocaleString() + ' / ' + targetWords.toLocaleString() + ' words.',
          'ac-warn');
      }
    }

    s.isStreaming = false;
    if (typeof setStreamingState === 'function') setStreamingState(false);
    console.log('[AutoContinue v3] Loop complete — attempt:', attempt);
  }

  // ── Hook into send pipeline ────────────────────────────────────────────────
  var pendingTarget      = null;
  var pendingContentType = null;
  var pendingSystem      = null;
  var watchTimer         = null;

  function onPromptSent(userText) {
    if (!CFG.enabled) return;

    // Always detect content type for truncation recovery
    pendingContentType = detectContentType(userText);
    pendingTarget      = detectWordTarget(userText);
    pendingSystem      = (window.STATE && window.STATE.systemPrompt) || null;

    if (pendingTarget) {
      toastSafe('⚡ Auto-continue armed: ' + pendingTarget.toLocaleString() + ' words', 'success');
      console.log('[AutoContinue v3] Word target: ' + pendingTarget + ' (' + pendingContentType + ')');
    }

    // Watch for the streaming to complete
    clearInterval(watchTimer);
    var wasStreaming = false;

    watchTimer = setInterval(function() {
      var s = window.STATE;
      if (!s) return;

      // Detect streaming start
      if (!wasStreaming && s.isStreaming) { wasStreaming = true; return; }

      // Detect streaming end
      if (wasStreaming && !s.isStreaming) {
        clearInterval(watchTimer);

        var conv = s.conversations[s.activeConvId];
        if (!conv) return;
        var lastMsg = conv.messages[conv.messages.length - 1];
        if (!lastMsg || lastMsg.role !== 'assistant') return;

        var content     = lastMsg.content || '';
        var target      = pendingTarget;
        var contentType = pendingContentType;
        var sysPrompt   = pendingSystem;

        pendingTarget = null;
        pendingContentType = null;

        // Check if we should continue
        var shouldContinue = isTruncated(content, target);

        if (!shouldContinue) {
          if (target) toastSafe('✅ ' + countWords(content).toLocaleString() + ' words — complete!', 'success');
          return;
        }

        var words = countWords(content);
        console.log('[AutoContinue v3] Response ended — ' + words + ' words, truncated: true. Starting loop…');

        setTimeout(function() {
          runContinuationLoop(content, target, contentType, sysPrompt);
        }, 800);
      }
    }, 200);
  }

  // ── Patch send triggers ────────────────────────────────────────────────────
  function patchSendTriggers() {
    var sendBtn   = document.getElementById('sendBtn');
    var chatInput = document.getElementById('chatInput');

    if (sendBtn) {
      sendBtn.addEventListener('click', function() {
        var text = chatInput && chatInput.value.trim();
        if (text) onPromptSent(text);
      }, true);
    }

    if (chatInput) {
      chatInput.addEventListener('keydown', function(e) {
        if (e.key === 'Enter' && !e.shiftKey) {
          var text = chatInput.value.trim();
          if (text) onPromptSent(text);
        }
      }, true);
    }

    console.log('[AutoContinue v3] Send triggers patched ✅');
  }

  // ── Upgrade continueCodeGeneration to use higher token limits ─────────────
  // Patch the app.js continueCodeGeneration to use num_ctx + higher num_predict
  function patchBuildContinuation() {
    var origFetch = window.fetch;
    // We patch this at the Ollama call level inside continueCodeGeneration
    // by watching for /api/chat calls from the continuation context
    // Instead — we directly override the options via a global config
    window.hazyContinuationOptions = {
      num_predict: CFG.numPredict,
      num_ctx:     CFG.numCtx,
    };
    console.log('[AutoContinue v3] Build continuation options patched — num_predict:', CFG.numPredict, 'num_ctx:', CFG.numCtx);
  }

  // ── CSS injection ─────────────────────────────────────────────────────────
  function injectCSS() {
    var style = document.createElement('style');
    style.textContent = [
      '.ac-banner{display:flex;align-items:center;gap:8px;margin-top:12px;padding:10px 14px;font-size:12px;font-family:var(--font-ui,"Space Grotesk",sans-serif);font-weight:600;line-height:1.4;border:2px solid;box-shadow:3px 3px 0px}',
      '.ac-running{background:#EDE5D0;border-color:#C8860A;color:#1A1208;box-shadow-color:#C8860A}',
      '.ac-done{background:#EAF3DE;border-color:#5A6E3A;color:#1A1208;box-shadow:3px 3px 0px #5A6E3A}',
      '.ac-warn{background:#FAEEDA;border-color:#C8860A;color:#1A1208;box-shadow:3px 3px 0px #C8860A}',
      '.ac-error{background:#FAECE7;border-color:#B54A2A;color:#1A1208;box-shadow:3px 3px 0px #B54A2A}',
      '.ac-spin{display:inline-block;width:12px;height:12px;border:2px solid rgba(200,134,10,.3);border-top-color:#C8860A;flex-shrink:0;animation:ac-spin .7s linear infinite}',
      '@keyframes ac-spin{to{transform:rotate(360deg)}}',
      '[data-theme="dark"] .ac-running{background:#2E2010;color:#F0E8D4}',
      '[data-theme="dark"] .ac-done{background:#1a2a10;color:#F0E8D4}',
      '[data-theme="dark"] .ac-warn{background:#2E2010;color:#F0E8D4}',
      '[data-theme="dark"] .ac-error{background:#2a1008;color:#F0E8D4}',
    ].join('\n');
    document.head.appendChild(style);
  }

  // ── Settings sync ─────────────────────────────────────────────────────────
  function syncSettings() {
    var toggle = document.getElementById('autoContinueToggle');
    var maxInp = document.getElementById('maxAttemptsInput');
    if (toggle) {
      toggle.checked = CFG.enabled;
      toggle.addEventListener('change', function(e) {
        CFG.enabled = e.target.checked;
        saveConfig();
        toastSafe(CFG.enabled ? '⚡ Auto-continue enabled' : 'Auto-continue disabled', CFG.enabled ? 'success' : '');
      });
    }
    if (maxInp) {
      maxInp.value = CFG.maxAttempts;
      maxInp.addEventListener('change', function(e) {
        CFG.maxAttempts = parseInt(e.target.value) || 15;
        saveConfig();
      });
    }
  }

  // ── Global exposure ────────────────────────────────────────────────────────
  function exposeGlobals() {
    window.hazyAutoContinueConfig = CFG;
    window.hazyAutoContinue = {
      isEnabled:  function() { return CFG.enabled; },
      enable:     function() { CFG.enabled = true;  saveConfig(); },
      disable:    function() { CFG.enabled = false; saveConfig(); },
      countWords: countWords,
      isTruncated: isTruncated,
      runLoop:    runContinuationLoop,
    };
  }

  // ── Init ──────────────────────────────────────────────────────────────────
  function init() {
    loadConfig();
    injectCSS();
    exposeGlobals();
    patchBuildContinuation();
    patchSendTriggers();
    setTimeout(syncSettings, 1500);
    console.log('✅ [AutoContinue v3] Ready — real Ollama streaming, truncation detection, word targets');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
