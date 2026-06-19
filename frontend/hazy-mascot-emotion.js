/**
 * hazy-mascot-emotion.js
 * -----------------------------------------------------------------------------
 * Live emotion-reactive mascot system for Hazy AI.
 *
 * SUPPORTED EMOTIONS (10 total):
 *   happy, annoyed, flustered, excited, heartbroken, neutral, sad, shocked, shy, thinking
 *
 * HOW IT WORKS
 *  1. The AI model embeds [[emotion]] tags inline (e.g. [[happy]], [[sad]]).
 *  2. stripEmotionTags() removes ALL [[word]] patterns before display (never visible).
 *  3. On every token, HazyMascotController.scanBuffer() checks the RAW buffer.
 *  4. On tag detection → setEmotion() fires immediately swapping the mascot image.
 *  5. At stream end → if zero tags were found, keyword fallback scan runs once.
 *  6. Mascot holds the last emotion indefinitely - no reset between responses.
 *  7. prefers-reduced-motion: skips animation, performs a direct src swap only.
 * -----------------------------------------------------------------------------
 */

'use strict';

// -- Mascot image paths -------------------------------------------------------
const HAZY_MASCOTS = {
  happy:       'assets/mascot/hazy_ai_happy.png',
  annoyed:     'assets/mascot/hazy_ai_annoyed.png',
  flustered:   'assets/mascot/hazy_ai_flustered.png',
  excited:     'assets/mascot/hazy_ai_excited.png',
  heartbroken: 'assets/mascot/hazy_ai_heartbroken.png',
  neutral:     'assets/mascot/hazy_ai_neutral.png',
  sad:         'assets/mascot/hazy_ai_sad.png',
  shocked:     'assets/mascot/hazy_ai_shocked.png',
  shy:         'assets/mascot/hazy_ai_shy.png',
  thinking:    'assets/mascot/hazy_ai_thinking.png',
};

// Default emotion on first render (before any tag arrives)
const HAZY_DEFAULT_EMOTION = 'happy';

// -- Emotion tag detection ----------------------------------------------------
// Matches any complete [[emotion]] tag for all 10 supported emotions.
const EMOTION_TAG_REGEX = /\[\[(happy|annoyed|flustered|excited|heartbroken|neutral|sad|shocked|shy|thinking)\]\]/g;

// Matches ANY [[word]] pattern — used by stripEmotionTags so unknown/hallucinated
// tags (e.g. [[X]], [[excited]]) are also stripped and never leak to the UI.
const ANY_TAG_REGEX = /\[\[[\w-]+\]\]/g;

// -- Keyword fallback map -----------------------------------------------------
// Used ONLY when the entire stream completes with zero [[emotion]] tags.
const KEYWORD_MAP = {
  happy: [
    'glad', 'great', 'wonderful', 'love', 'fantastic', 'yay', 'hurray',
    'excellent', 'perfect', 'delighted', 'thrilled', 'joyful', 'happy',
    'pleased', 'fun', 'enjoy', 'cool', 'cheerful', 'grateful', 'thankful',
  ],
  excited: [
    'excited', 'exciting', 'amazing', 'incredible', 'wow', 'awesome',
    'unbelievable', 'thrilling', 'pumped', 'energized', 'hyped', 'stoked',
    "let's go", "can't wait", 'mind-blowing', 'epic', 'fire',
  ],
  annoyed: [
    'frustrated', 'ugh', 'annoyed', 'irritating', 'irritated',
    'bug', 'error', 'crash', 'wrong', 'failed', 'failure', 'awful',
    'terrible', 'useless', 'hate', 'stuck', 'ridiculous', 'broken',
  ],
  // flustered = Hazy personally confused / caught off guard / making a mistake
  // Do NOT put empathetic words like 'sorry' or 'overwhelmed' here — those
  // appear in condolence/support responses and would mis-trigger this emotion.
  flustered: [
    'confused', 'oops', 'unclear', 'mistake', 'whoops',
    'uncertain', 'unsure', 'embarrassed', 'hmm', 'awkward', 'flustered', 'panic',
  ],
  // sad = mild sorrow, disappointment, unfortunate news
  sad: [
    'sad', 'unfortunate', 'unfortunately', 'sorrow', 'sorrowful', 'depressed',
    'unhappy', 'miserable', 'gloomy', 'heartache', 'regret', 'regretful',
    'disappointing', 'disappointed', 'upset', 'down', 'blue', 'tearful',
    'sorry', 'apologies', 'terrible thing', 'that\'s rough',
  ],
  // heartbroken = deep grief, loss, death — uses substring matching so
  // 'heartbreaking' hits 'heartbreak', 'grieving' hits 'grief', etc.
  heartbroken: [
    'heartbreak', 'devastat', 'crushed', 'betray',
    'grief', 'griev', 'losing', 'loss', 'lost', 'miss', 'missing',
    'alone', 'lonely', 'abandon', 'reject', 'painful',
    'died', 'dead', 'death', 'passed away', 'pass away',
    'mourn', 'cruel', 'unfair', 'tragic', 'tragedy',
    'so sorry', 'incredibly sorry', 'deeply sorry',
  ],
  shocked: [
    'shocked', 'shocking', 'surprised', 'surprise', 'unexpected', 'sudden',
    'jaw-dropping', 'astonished', 'astonishing', 'stunned', 'gasp', 'omg', 'whoa',
  ],
  shy: [
    'shy', 'blush', 'blushing', 'bashful', 'timid', 'reserved',
    'gentle', 'sweet', 'flattered', 'humble', 'modest',
    'vulnerable', 'tender', 'delicate',
  ],
  thinking: [
    'thinking', 'considering', 'ponder', 'wonder', 'wondering',
    'maybe', 'perhaps', 'possibly', 'analyzing', 'calculating', 'figuring',
    'let me think', 'interesting', 'curious', 'processing', 'evaluating',
    'complex', 'complicated', 'difficult',
  ],
  neutral: [
    'okay', 'alright', 'understood', 'noted', 'indeed', 'correct', 'certainly',
  ],
};

// -- Prefers-reduced-motion check ---------------------------------------------
function prefersReducedMotion() {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

// -- Strip all [[emotion]] tags from a string ---------------------------------
// Used by ThrottledStreamRenderer so tags never appear in the visible text.
// Uses ANY_TAG_REGEX (not the strict emotion-only regex) so that hallucinated or
// unknown tags like [[X]], [[excited]], etc. are ALSO stripped and never rendered.
function stripEmotionTags(text) {
  if (!text) return text;
  return text.replace(ANY_TAG_REGEX, '');
}

// -- Keyword fallback: given clean text, return best matching emotion or null --
// Uses substring matching (text.includes) so partial stems work:
//   'heartbreak' matches 'heartbreaking', 'grief' matches 'grieving', etc.
// Multi-word phrases like 'so sorry' also work correctly with this approach.
function detectEmotionFromKeywords(text) {
  if (!text) return null;
  const lower = text.toLowerCase();

  const scores = { happy: 0, excited: 0, annoyed: 0, flustered: 0, sad: 0, heartbroken: 0, shocked: 0, shy: 0, thinking: 0, neutral: 0 };
  for (const [emotion, keywords] of Object.entries(KEYWORD_MAP)) {
    for (const kw of keywords) {
      if (lower.includes(kw)) scores[emotion]++;
    }
  }

  const best = Object.entries(scores).reduce((a, b) => b[1] > a[1] ? b : a);
  return best[1] > 0 ? best[0] : null;
}

// -- HazyMascotController -----------------------------------------------------
class HazyMascotController {
  /**
   * @param {HTMLImageElement} imgEl - The .hazy-mascot-image element to control.
   */
  constructor(imgEl) {
    this._img = imgEl;
    this._currentEmotion = (window.HAZY_MASCOT_STATE && window.HAZY_MASCOT_STATE.currentEmotion) || HAZY_DEFAULT_EMOTION;
    this._tagsDetected = 0;       // count of tags found in this stream
    this._rawScanPos = 0;         // offset into rawBuffer already scanned

    // Sync initial src from global state so history messages look consistent
    if (window.HAZY_MASCOT_STATE && window.HAZY_MASCOT_STATE.currentSrc) {
      if (imgEl) imgEl.src = window.HAZY_MASCOT_STATE.currentSrc;
    }
  }

  // -- Public: called on every token during streaming -----------------------
  /**
   * Scans only the newly-added portion of rawBuffer for emotion tags.
   * Uses _rawScanPos to avoid re-processing already-scanned content.
   * @param {string} rawBuffer - The full unstripped accumulation of tokens so far.
   */
  scanBuffer(rawBuffer) {
    if (!rawBuffer) return;

    // Only scan the slice we haven't checked yet, but we must look back a few
    // characters to handle tags that were split across two tokens.
    // 20 chars overlap is more than enough for the longest tag "[[flustered]]" (14 chars).
    const overlap = 20;
    const scanFrom = Math.max(0, this._rawScanPos - overlap);
    const newSlice = rawBuffer.slice(scanFrom);

    const localRegex = /\[\[(happy|annoyed|flustered|excited|heartbroken|neutral|sad|shocked|shy|thinking)\]\]/g;
    const matches = [];
    let match;
    while ((match = localRegex.exec(newSlice)) !== null) {
      // Translate match index back to absolute position in rawBuffer
      const absolutePos = scanFrom + match.index;
      // Only count tags that start in the truly-new region (>= _rawScanPos - overlap)
      // We use absolute position to deduplicate: only count if we haven't counted it yet.
      // Since _tagsDetected tracks the total count, we just collect all and compare.
      matches.push(match[1]);
    }

    // Advance the scan position to avoid re-scanning on the next token.
    this._rawScanPos = rawBuffer.length;

    // Count ALL tags in the full buffer to detect truly new ones.
    // This is needed because the slice-based match count may include overlapping re-scanned tags.
    // Re-scan the full buffer only for the count comparison (cheap — just counting, no DOM ops).
    const fullRegex = /\[\[(happy|annoyed|flustered|excited|heartbroken|neutral|sad|shocked|shy|thinking)\]\]/g;
    const allMatches = [];
    while ((match = fullRegex.exec(rawBuffer)) !== null) {
      allMatches.push(match[1]);
    }

    if (allMatches.length > this._tagsDetected) {
      // Trigger new emotions in order
      for (let i = this._tagsDetected; i < allMatches.length; i++) {
        this.setEmotion(allMatches[i]);
      }
      this._tagsDetected = allMatches.length;
    }
  }

  // -- Public: called once when the stream fully ends -----------------------
  /**
   * Runs keyword fallback if zero tags were detected across the entire stream.
   * @param {string} cleanText - The fully stripped display text.
   */
  onStreamEnd(cleanText) {
    if (this._tagsDetected === 0) {
      const fallbackEmotion = detectEmotionFromKeywords(cleanText);
      if (fallbackEmotion) {
        this.setEmotion(fallbackEmotion);
      }
      // If neither tags nor keywords → mascot keeps whatever it had before (no-op)
    }
    // If tags were detected, mascot already holds the last emotion (sticky) - no-op
  }

  // -- Public: set mascot to a specific emotion with animation -------------
  /**
   * Swaps the mascot image. Respects prefers-reduced-motion.
   * @param {'happy'|'annoyed'|'flustered'|'excited'|'heartbroken'|'neutral'|'sad'|'shocked'|'shy'|'thinking'} emotion
   */
  setEmotion(emotion) {
    const src = HAZY_MASCOTS[emotion];
    if (!src) return; // guard against unknown emotion values
    if (!this._img) return;

    // Skip if already showing this emotion (avoid redundant swaps)
    if (this._currentEmotion === emotion && this._img.src.endsWith(HAZY_MASCOTS[emotion].replace(/^.*\//, ''))) {
      return;
    }

    this._currentEmotion = emotion;

    // Persist to global state so new message bubbles inherit the current emotion
    window.HAZY_MASCOT_STATE = window.HAZY_MASCOT_STATE || {};
    window.HAZY_MASCOT_STATE.currentEmotion = emotion;
    window.HAZY_MASCOT_STATE.currentSrc = src;

    // Swap src directly without any animations
    this._img.src = src;
    this._img.dataset.emotion = emotion;
  }

  // -- Static: strip all emotion tags from a string -------------------------
  static stripTags(text) {
    return stripEmotionTags(text);
  }
}

// -- Module globals -----------------------------------------------------------

// Global emotion state - survives across message bubbles
window.HAZY_MASCOT_STATE = window.HAZY_MASCOT_STATE || {
  currentEmotion: HAZY_DEFAULT_EMOTION,
  currentSrc: HAZY_MASCOTS[HAZY_DEFAULT_EMOTION],
};

// Global singleton controller reference (points to the active streaming message)
window.HAZY_MASCOT_CONTROLLER = null;

// Convenience function for console-level testing / external calls
window.setHazyEmotion = function(emotion) {
  // Update global state
  window.HAZY_MASCOT_STATE = window.HAZY_MASCOT_STATE || {};
  window.HAZY_MASCOT_STATE.currentEmotion = emotion;
  window.HAZY_MASCOT_STATE.currentSrc = HAZY_MASCOTS[emotion] || HAZY_MASCOTS[HAZY_DEFAULT_EMOTION];

  // Apply to the active controller if one exists
  if (window.HAZY_MASCOT_CONTROLLER) {
    window.HAZY_MASCOT_CONTROLLER.setEmotion(emotion);
    return;
  }

  // Fallback: apply directly to the last/most-recent mascot image in the DOM
  const imgs = document.querySelectorAll('.hazy-mascot-image');
  if (imgs.length > 0) {
    const lastImg = imgs[imgs.length - 1];
    lastImg.src = HAZY_MASCOTS[emotion] || HAZY_MASCOTS[HAZY_DEFAULT_EMOTION];
    lastImg.dataset.emotion = emotion;
  }
};

// Expose classes and helpers for use in app.js
window.HazyMascotController = HazyMascotController;
window.HAZY_MASCOTS = HAZY_MASCOTS;
window.HAZY_DEFAULT_EMOTION = HAZY_DEFAULT_EMOTION;
window.hazyStripEmotionTags = stripEmotionTags;
