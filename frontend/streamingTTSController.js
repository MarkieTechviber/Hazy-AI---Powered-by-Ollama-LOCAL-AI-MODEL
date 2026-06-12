(function () {
  'use strict';

  class StreamingTTSController {
    constructor() {
      this.reset();
    }

    reset() {
      // plan Agent E: wire AbortController into reset (real cancellation + audit gap fix for flag-only)
      if (this.abortController && !this.abortController.signal.aborted) {
        try { this.abortController.abort(); } catch (_) {}
      }
      this.buffer = '';
      this.active = false;
      this.cancelled = false;
      this.pending = Promise.resolve();
      this.generationStartedAt = 0;
      this.abortController = null;
      this.settings = null;
    }

    start(settings) {
      this.reset();
      // plan Agent E: create fresh AbortController per start (used for synthesize signal + stop/abort)
      this.abortController = new AbortController();
      this.settings = { ...settings };
      this.active = true;
      this.generationStartedAt = performance.now();
      if (this.settings.enabled) {
        // pass signal so preload can early-abort if stop called before load finishes
        window.HAZY_TTS_MANAGER?.load?.(this.abortController?.signal).catch((error) => {
          if (error && error.name === 'AbortError') return;
          console.warn('[Hazy TTS] preload failed', error);
        });
      }
    }

    stop() {
      // plan Agent E: abort the controller + set cancelled (cleanly prevents further enqueue/play)
      this.cancelled = true;
      if (this.abortController) {
        try { this.abortController.abort(); } catch (_) {}
      }
      this.buffer = '';
      this.active = false;
      window.HAZY_AUDIO_QUEUE_MANAGER?.stop();
    }

    pause() {
      window.HAZY_AUDIO_QUEUE_MANAGER?.pause();
    }

    resume() {
      window.HAZY_AUDIO_QUEUE_MANAGER?.resume();
    }

    push(text) {
      if (!this.active || this.cancelled || this.abortController?.signal?.aborted || !this.settings?.enabled) return;
      this.buffer += String(text || '');
      this._flush(false);
    }

    async finish() {
      if (!this.active || this.cancelled || this.abortController?.signal?.aborted || !this.settings?.enabled) return;
      await this._flush(true);
      this.active = false;
    }

    async regenerate(text, settings) {
      this.stop();
      this.start(settings);
      this.push(text);
      await this.finish();
    }

    _splitBuffer(force) {
      const chunks = [];
      let buffer = this.buffer;
      // Match sentence endings: capture up to and including [.!?;:] or newline.
      // Use a lookahead so we DON'T require whitespace after — during streaming the
      // next token arrives immediately after the period with no space yet.
      // Minimum 6 chars before the boundary to avoid flushing tiny fragments like "OK."
      const boundary = /(.{6,}?[.!?;:\n])(?=[\s"'\u201C\u201D]|[A-Z]|$)/s;
      while (true) {
        const match = buffer.match(boundary);
        if (!match) break;
        const sentence = match[1].trim();
        // Skip fragments shorter than 8 chars — not worth a round-trip to Kokoro
        if (sentence.length >= 8) chunks.push(sentence);
        buffer = buffer.slice(match.index + match[0].length);
      }
      if (force && buffer.trim().length >= 3) chunks.push(buffer.trim());
      if (!force) {
        // Fallback: flush if buffer is getting long even without a sentence boundary
        // (e.g. a very long run-on sentence). Lowered from 90→60 for faster first-word audio.
        if (chunks.length === 0 && buffer.length > 60) {
          const splitAt = Math.max(
            buffer.lastIndexOf(',', 60),
            buffer.lastIndexOf(' ', 60)
          );
          const cut = splitAt > 30 ? splitAt + 1 : 60;
          const piece = buffer.slice(0, cut).trim();
          if (piece.length >= 8) chunks.push(piece);
          buffer = buffer.slice(cut);
        }
      }
      this.buffer = buffer;
      return chunks.filter(Boolean);
    }

    async _flush(force) {
      // plan Agent E: pass signal to synthesize; early abort checks; catch AbortError silently (no voice-error dispatch)
      // addresses audit: flag-only cancel was insufficient for pending chains / awaits in _flush loop
      this.pending = this.pending.then(async () => {
        const chunks = this._splitBuffer(force);
        for (const chunk of chunks) {
          if (this.cancelled || this.abortController?.signal?.aborted) return;
          try {
            // Refactor: synthesize() now returns WAV blob from /hazy/tts (server GPU path).
            // enqueue handles legacy blob (new Audio + objectURL) or pcm; dual kept for compat.
            // No interface change to StreamingTTSController per plan.
            const audio = await window.HAZY_TTS_MANAGER.synthesize(chunk, this.settings, this.abortController?.signal);
            if (this.cancelled || this.abortController?.signal?.aborted) return;
            window.HAZY_AUDIO_QUEUE_MANAGER.enqueue(audio, this.settings).catch(() => {});
          } catch (error) {
            if (error && (error.name === 'AbortError' || this.cancelled || this.abortController?.signal?.aborted)) {
              return; // clean abort, do not treat as voice error
            }
            console.warn('[Hazy TTS] voice generation unavailable', error);
            window.dispatchEvent(new CustomEvent('hazy-voice-error', { detail: error }));
            break;
          }
        }
      }).catch((e) => {
        // ensure pending chain never stays rejected after aborts or transient errors
        if (e && e.name !== 'AbortError') console.warn('[Hazy TTS] pending chain error (suppressed for continuity)', e);
      });
      return this.pending;
    }
  }

  window.HAZY_STREAMING_TTS = new StreamingTTSController();
})();
