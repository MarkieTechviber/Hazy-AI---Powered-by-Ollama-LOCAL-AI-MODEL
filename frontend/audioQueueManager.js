(function () {
  'use strict';

  class AudioQueueManager {
    constructor() {
      this.queue = [];
      this.current = null;
      this.paused = false;
      // plan Agent C: shared AudioContext (modeled on Piper pattern from app.js:4240+)
      // created lazily; resumed as needed. Avoids per-chunk context creation.
      this._audioCtx = null;
    }

    enqueue(payload, meta = {}) {
      // dual-path enqueue kept (pcm WebAudio path + legacy blob for WAV from server).
      // Refactor: server synthesize returns WAV Blob → hits legacy <audio> path (works for WAV).
      return new Promise((resolve, reject) => {
        const item = { payload, meta, resolve, reject };
        this.queue.push(item);
        this._drain();
      });
    }

    // Added for plan: enqueueBlob for WAV blobs returned by new /hazy/tts synthesize.
    // Accepts optional meta (speed/volume) so speakText (preview/buttons) respects persisted settings (not just streaming path).
    // Delegates to enqueue; the legacy blob _drain already reads item.meta.speed/volume.
    enqueueBlob(audioBlob, meta = {}) {
      if (!audioBlob) return Promise.resolve();
      return this.enqueue(audioBlob, meta);
    }

    stop() {
      this.queue.splice(0).forEach(item => item.reject?.(new Error('stopped')));
      this._stopCurrent();
      this.paused = false;
    }

    pause() {
      if (this.current?.audio) {
        // legacy Blob/<audio> path
        try { this.current.audio.pause(); } catch {}
        this.paused = true;
      } else if (this.current?.source && this.current.isPCM) {
        // plan Agent C: PCM WebAudio path pause (detach onended to avoid premature drain, compute offset for resume)
        this._pauseCurrentPCM();
      }
      // if already in pausedPCM state, noop
    }

    resume() {
      if (this.current?.audio && this.paused) {
        // legacy Blob/<audio> path
        this.current.audio.play().catch(() => {});
        this.paused = false;
      } else if (this.paused && this.current && this.current.pausedPCM) {
        // plan Agent C: resume PCM from computed buffer offset (re-uses _playPCM with offset; recreates source/gain)
        const p = this.current;
        const payload = p.pausedPayload;
        const offset = p.pausedOffset || 0;
        const item = p.pausedItem;
        this.current = null;
        this.paused = false;
        if (payload) {
          this._playPCM(payload, (item && item.meta) || {}, item, offset).catch((e) => {
            if (item) item.reject?.(e);
            this.current = null;
            this._drain();
          });
        }
      }
    }

    async _drain() {
      if (this.current || this.paused) return;
      const item = this.queue.shift();
      if (!item) return;

      const payload = item.payload;

      // plan Agent C: PCM descriptor preferred path (direct from Kokoro, modeled on Piper but no decodeAudioData)
      // Uses AudioContext + createBuffer(1, len, sr) + getChannelData(0).set(pcm) + BufferSource + gain + playbackRate
      if (payload && typeof payload === 'object' && payload.type === 'pcm' && payload.pcm instanceof Float32Array) {
        this._playPCM(payload, item.meta, item).catch((e) => {
          item.reject?.(e);
          this.current = null;
          this._drain();
        });
        return;
      }

      // legacy Blob path (fallback; keeps exact prior behavior for any Blob enqueued)
      const audio = new Audio();
      const url = URL.createObjectURL(payload);
      audio.src = url;
      audio.volume = Math.max(0, Math.min(1, (item.meta.volume ?? 100) / 100));
      audio.playbackRate = item.meta.speed || 1;

      this.current = { audio, url, item };
      audio.onended = () => {
        URL.revokeObjectURL(url);
        this.current = null;
        item.resolve?.();
        this._drain();
      };
      audio.onerror = () => {
        URL.revokeObjectURL(url);
        this.current = null;
        item.reject?.(new Error('audio playback failed'));
        this._drain();
      };

      try {
        await audio.play();
      } catch (error) {
        // Browser autoplay policy (NotAllowedError) or decode error — clean up and move on
        URL.revokeObjectURL(url);
        this.current = null;
        item.reject?.(error);
        this._drain();
      }
    }

    _stopCurrent() {
      if (!this.current) return;
      if (this.current.audio) {
        // legacy Blob path
        try { this.current.audio.pause(); } catch {}
        try { URL.revokeObjectURL(this.current.url); } catch {}
      } else if (this.current.source) {
        // plan Agent C PCM WebAudio path: stop without onended firing into drain
        const s = this.current.source;
        const g = this.current.gain;
        if (s) s.onended = null;
        try { s.stop(); } catch {}
        try { s.disconnect(); } catch {}
        if (g) try { g.disconnect(); } catch {}
      } else if (this.current.pausedPCM) {
        // paused state for PCM; nothing to stop playing
      }
      this.current = null;
    }

    // --- plan Agent C helpers (WebAudio PCM path, reuse Piper AudioContext pattern) ---

    _ensureAudioContext() {
      if (!this._audioCtx || this._audioCtx.state === 'closed') {
        this._audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      }
      return this._audioCtx;
    }

    async _resumeContext() {
      const ctx = this._ensureAudioContext();
      if (ctx.state === 'suspended') {
        try { await ctx.resume(); } catch {}
      }
      return ctx;
    }

    async _playPCM(pcmDesc, meta, item, startOffset = 0) {
      // Direct WebAudio playback for Kokoro PCM (Float32Array @ 24kHz typically).
      // No WAV Blob, no objectURL, no decodeAudioData — low-overhead path per plan Agent C.
      // Pattern: ctx.createBuffer(1, len, sr); buf.getChannelData(0).set(pcm); source + gain + playbackRate + start(onended)
      if (!pcmDesc || !(pcmDesc.pcm instanceof Float32Array)) {
        item && item.reject?.(new Error('invalid pcm'));
        this.current = null;
        this._drain();
        return;
      }
      const ctx = await this._resumeContext();
      const { pcm, sampleRate = 24000 } = pcmDesc;
      if (pcm.length === 0) {
        item && item.resolve?.();
        this.current = null;
        this._drain();
        return;
      }

      const audioBuffer = ctx.createBuffer(1, pcm.length, sampleRate);
      audioBuffer.getChannelData(0).set(pcm);

      const source = ctx.createBufferSource();
      source.buffer = audioBuffer;

      const pbRate = (meta && meta.speed) || 1;
      source.playbackRate.value = pbRate;

      const gain = ctx.createGain();
      const vol = Math.max(0, Math.min(1, ((meta && meta.volume) ?? 100) / 100));
      gain.gain.value = vol;

      source.connect(gain);
      gain.connect(ctx.destination);

      const startTime = ctx.currentTime + 0.005; // small lead like Piper
      let offset = startOffset || 0;
      const pcmDuration = pcm.length / sampleRate;
      if (offset > 0) {
        if (offset >= pcmDuration) {
          item && item.resolve?.();
          this.current = null;
          setTimeout(() => this._drain(), 0);
          return;
        }
      }

      source.start(startTime, offset);

      this.current = {
        source,
        gain,
        ctx,
        item,
        payload: pcmDesc,
        startTime,
        playbackRate: pbRate,
        startOffset: offset,
        isPCM: true
      };

      source.onended = () => {
        try { source.disconnect(); } catch {}
        try { gain.disconnect(); } catch {}
        this.current = null;
        item && item.resolve?.();
        this._drain();
      };
    }

    _pauseCurrentPCM() {
      const curr = this.current;
      if (!curr || !curr.source) return;
      // Detach onended so stop() does not trigger resolve+drain (pause is not end)
      curr.source.onended = null;
      const ctx = curr.ctx;
      const pbRate = curr.playbackRate || (curr.source.playbackRate ? curr.source.playbackRate.value : 1);
      const realElapsed = (ctx ? ctx.currentTime : 0) - (curr.startTime || 0);
      const bufferElapsed = realElapsed * pbRate;
      const newOffset = (curr.startOffset || 0) + bufferElapsed;

      try { curr.source.stop(); } catch {}
      try { curr.source.disconnect(); } catch {}
      if (curr.gain) try { curr.gain.disconnect(); } catch {}

      // Store paused state in current (so drain stays blocked, resume can pick it up)
      this.current = {
        pausedPCM: true,
        pausedPayload: curr.payload,
        pausedOffset: Math.max(0, newOffset),
        pausedItem: curr.item,
        pausedMeta: (curr.item && curr.item.meta) || {}
      };
      this.paused = true;
    }
  }

  window.HAZY_AUDIO_QUEUE_MANAGER = new AudioQueueManager();
})();
