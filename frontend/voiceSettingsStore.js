(function () {
  'use strict';

  const STORAGE_KEY = 'hazy_voice_settings';
  const DEFAULTS = {
    enabled: false,
    voice: 'af_heart',
    speed: 1.0,
    volume: 100,
    autoplay: true,
    voiceDevice: 'auto' // 'auto' | 'cuda' | 'cpu' — for kokoro server device selection (hardware scan)
  };

  function read() {
    try {
      return { ...DEFAULTS, ...(JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}') || {}) };
    } catch {
      return { ...DEFAULTS };
    }
  }

  function write(next) {
    const merged = { ...DEFAULTS, ...(next || {}) };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(merged));
    return merged;
  }

  window.HAZY_VOICE_SETTINGS_STORE = { DEFAULTS, read, write, STORAGE_KEY };
})();
