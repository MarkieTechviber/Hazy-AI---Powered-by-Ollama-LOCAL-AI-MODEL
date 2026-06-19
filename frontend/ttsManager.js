(function () {
  'use strict';

  const FALLBACK_VOICES = [
    'af_heart','af_bella','af_sarah','am_adam','am_michael','bf_emma','bm_george'
  ];

  let voiceListCache = null;
  let voiceListPromise = null;

  // Server-offload path (refactor plan): no WASM, no from_pretrained, no vendored bundles.
  // synthesize POSTs to backend proxy which forwards to kokoro-fastapi (GPU on :8880).
  // Returns WAV blob for audioQueue (legacy blob path or enqueueBlob).
  async function synthesize(text, voiceSettings, signal) {
    if (signal?.aborted) {
      throw new DOMException('Aborted', 'AbortError');
    }
    const res = await fetch('/hazy/tts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text: String(text || '').trim(),
        voice: (voiceSettings && voiceSettings.voice) || 'af_heart',
        speed: (voiceSettings && voiceSettings.speed) || 1.0
      }),
      signal  // forward AbortSignal for real cancellation of in-flight HTTP + server inference (Issue 4 fix)
    });
    if (signal?.aborted) {
      throw new DOMException('Aborted', 'AbortError');
    }
    if (!res.ok) throw new Error(`TTS failed: ${res.status}`);
    return await res.blob(); // WAV blob from server (GPU inference)
  }

  // load kept for interface compat (streamingTTSController calls it for preload; now instant no-op)
  async function load(optsOrSignal) {
    if (optsOrSignal instanceof AbortSignal && optsOrSignal.aborted) {
      throw new DOMException('Aborted', 'AbortError');
    }
    if (optsOrSignal && typeof optsOrSignal === 'object' && optsOrSignal.signal instanceof AbortSignal && optsOrSignal.signal.aborted) {
      throw new DOMException('Aborted', 'AbortError');
    }
    // No model load — kokoro-fastapi server handles inference + hardware device choice.
    return null;
  }

  async function refreshVoices() {
    if (voiceListCache) return voiceListCache;
    if (!voiceListPromise) {
      voiceListPromise = fetch(`${window.location.origin}/voices.json`)
        .then(response => response.json())
        .then(list => {
          voiceListCache = Array.isArray(list) && list.length ? list : FALLBACK_VOICES.map(id => ({ id, label: id }));
          return voiceListCache;
        })
        .catch(() => {
          voiceListCache = FALLBACK_VOICES.map(id => ({ id, label: id }));
          return voiceListCache;
        });
    }
    return voiceListPromise;
  }

  function getVoices() {
    return voiceListCache || FALLBACK_VOICES.map(id => ({ id, label: id }));
  }

  // Stub for any legacy callers (device choice now via /hazy/hardware + manual start of kokoro server)
  function getKokoroDeviceConfig() {
    return { dtype: 'q4', device: 'cpu' };
  }

  // Thin helper matching plan's "detectAndApplyDevice" intent (placed in ttsManager per hardware section).
  // Returns the hardware scan JSON (recommendedDevice etc). Used by health/status in app.js.
  async function detectHardware() {
    try {
      const res = await fetch('/hazy/hardware');
      return await res.json();
    } catch {
      // Rich fallback matching hardware endpoint contract (cpuModel etc) to avoid "CPU · undefined" labels in checkKokoroHealth
      return { recommendedDevice: 'cpu', cpuModel: 'Unknown', platform: 'unknown', gpu: null };
    }
  }

  window.HAZY_TTS_MANAGER = { load, refreshVoices, synthesize, getVoices, fallbackVoices: FALLBACK_VOICES, getKokoroDeviceConfig, detectHardware };
})();
