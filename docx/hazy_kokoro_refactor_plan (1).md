# 🎙️ Hazy — Kokoro TTS Refactor Plan
**Goal:** Move Kokoro TTS from in-browser WASM → dedicated local server so the user's GPU handles inference, not Chrome.

---

## 📋 Overview

| | Current (❌ Bad) | Target (✅ Good) |
|---|---|---|
| **Where Kokoro runs** | Inside Chrome tab (WASM) | Local Python server |
| **Who does inference** | CPU via browser WASM | User's GPU (auto-detected) |
| **RAM usage** | High (WASM loaded in tab) | Lower (offloaded to server) |
| **Audio delivery** | Web Audio API (in-tab) | HTTP audio blob → `<audio>` |
| **Speed** | Slow (CPU WASM) | Fast (GPU inference) |

---

## 🖥️ Hardware Scanning (New Feature)

Before starting Kokoro, the app should **automatically scan the user's hardware** and decide the best device to run inference on. This removes any hardcoded device assumptions.

### Backend hardware scan endpoint

Add to `backend/server.js`:

```javascript
import os from 'os';
import { execSync } from 'child_process';

app.get('/hazy/hardware', (req, res) => {
  const info = {
    platform: process.platform,
    cpuCores: os.cpus().length,
    cpuModel: os.cpus()[0]?.model || 'Unknown',
    totalRAM: Math.round(os.totalmem() / 1024 / 1024 / 1024), // GB
    freeRAM: Math.round(os.freemem() / 1024 / 1024 / 1024),   // GB
    gpu: null,
    cudaAvailable: false,
    recommendedDevice: 'cpu' // default fallback
  };

  // Try detect NVIDIA GPU via nvidia-smi
  try {
    const smi = execSync(
      'nvidia-smi --query-gpu=name,memory.total --format=csv,noheader,nounits',
      { timeout: 3000 }
    ).toString().trim();

    const [gpuName, vramMB] = smi.split(',').map(s => s.trim());
    info.gpu = gpuName;
    info.vramMB = parseInt(vramMB, 10);
    info.cudaAvailable = true;
    info.recommendedDevice = 'cuda';
  } catch {
    // nvidia-smi not found or failed — CPU only
  }

  // Recommend CPU if VRAM is too low (under 2GB)
  if (info.cudaAvailable && info.vramMB < 2048) {
    info.recommendedDevice = 'cpu';
    info.gpuWarning = 'VRAM too low for GPU inference — falling back to CPU';
  }

  res.json(info);
});
```

### Frontend hardware check on startup

Add to `frontend/ttsManager.js` (inside the init flow):

```javascript
async function detectAndApplyDevice() {
  try {
    const res = await fetch('/hazy/hardware');
    const hw = await res.json();

    const device = hw.recommendedDevice; // 'cuda' or 'cpu'
    const label = hw.gpu
      ? `GPU detected: ${hw.gpu} (${hw.vramMB}MB VRAM)`
      : `No GPU detected — using CPU (${hw.cpuModel})`;

    console.log(`[Hazy TTS] ${label} → using ${device}`);
    return device; // pass this into Kokoro server startup or ttsManager config
  } catch {
    console.warn('[Hazy TTS] Hardware scan failed — defaulting to CPU');
    return 'cpu';
  }
}
```

---

## 🗺️ Target Architecture

```
┌─────────────────────────────────────┐
│           BROWSER (Hazy UI)         │
│  - Chat UI renders response         │
│  - Sends text → Node.js backend     │
│  - Receives audio blob              │
│  - Plays via audioQueueManager.js   │
└──────────────────┬──────────────────┘
                   │ HTTP POST /hazy/tts
┌──────────────────▼──────────────────┐
│       Node.js Backend (:8080)       │
│  - /hazy/hardware  (hw scan)        │
│  - /hazy/tts       (proxy)          │
│  - /hazy/tts/health (status)        │
└──────────────┬──────────────────────┘
               │ HTTP POST
    ┌──────────▼──────────┐
    │  Kokoro TTS Server  │
    │  (kokoro-fastapi)   │
    │  localhost:8880     │
    │  Device chosen by   │
    │  hardware scan 🎯   │
    └─────────────────────┘
```

---

## 📁 Real File Map (From Audit)

These are the actual files involved — no guessing:

| File | Role | What Changes |
|---|---|---|
| `frontend/ttsManager.js` | Loads Kokoro WASM model | **Replace** `from_pretrained` with HTTP call to `:8880` |
| `frontend/streamingTTSController.js` | Hooks into LLM token stream | **Rewire** `synthesize()` calls → `/hazy/tts` fetch |
| `frontend/audioQueueManager.js` | Queues + plays audio | **Keep** — still handles playback, feed it audio blobs from server |
| `frontend/voiceSettingsStore.js` | Persists voice settings | **Add** `voiceDevice` field (auto / cuda / cpu) |
| `frontend/app.js` | Glues everything together | **Replace** `speakText()`, update status listener, wire hardware scan |
| `frontend/index.html` | Script load order + importmap | **Remove** vendored WASM imports, keep audio/settings scripts |
| `frontend/vendor/kokoro-runtime/` | WASM runtime bundle | **Remove entirely** after server path confirmed |
| `frontend/voices.json` | Voice list | **Keep** — still used for voice selector UI |
| `backend/server.js` | Serves static assets | **Add** `/hazy/tts`, `/hazy/tts/health`, `/hazy/hardware` |
| `backend/server.py` | Python static server | **Add** same endpoints if Python path is primary |

---

## 📦 Phase 1 — Set Up Kokoro FastAPI Server

### 1.1 Install kokoro-fastapi

```bash
git clone https://github.com/remsky/kokoro-fastapi.git
cd kokoro-fastapi
pip install -r requirements.txt
```

### 1.2 Start with hardware-scanned device

The app will detect the device automatically. You can also pass it manually:

```bash
# GPU path (if CUDA detected)
python main.py --port 8880 --device cuda

# CPU fallback (if no GPU or low VRAM)
python main.py --port 8880 --device cpu
```

> In the final implementation, Hazy's backend will call hardware scan first and start Kokoro with the correct `--device` flag automatically — no manual input needed.

### 1.3 Verify server is running

```bash
curl -X POST http://localhost:8880/v1/audio/speech \
  -H "Content-Type: application/json" \
  -d '{"model":"kokoro","input":"Hello, I am Hazy.","voice":"af_heart"}' \
  --output test.wav
```

> ✅ If `test.wav` plays correctly, the server is ready.

---

## 🔧 Phase 2 — Backend Proxy (`backend/server.js`)

### 2.1 TTS proxy endpoint

```javascript
const KOKORO_URL = process.env.KOKORO_URL || 'http://localhost:8880/v1/audio/speech';

app.post('/hazy/tts', async (req, res) => {
  const { text, voice = 'af_heart', speed = 1.0 } = req.body;

  if (!text?.trim()) {
    return res.status(400).json({ error: 'No text provided' });
  }

  try {
    const kokoroRes = await fetch(KOKORO_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'kokoro',
        input: text,
        voice,
        speed,
        response_format: 'wav'
      })
    });

    if (!kokoroRes.ok) throw new Error(`Kokoro error: ${kokoroRes.status}`);

    res.setHeader('Content-Type', 'audio/wav');
    res.setHeader('Transfer-Encoding', 'chunked');
    kokoroRes.body.pipe(res);

  } catch (err) {
    console.error('[TTS Proxy]', err.message);
    res.status(503).json({ error: 'Kokoro TTS unavailable', detail: err.message });
  }
});
```

### 2.2 Health check

```javascript
app.get('/hazy/tts/health', async (req, res) => {
  try {
    const check = await fetch('http://localhost:8880/health');
    const data = await check.json();
    res.json({ status: 'ok', kokoro: data });
  } catch {
    res.status(503).json({ status: 'unavailable' });
  }
});
```

---

## 🖥️ Phase 3 — Frontend Refactor (4 Files)

### 3.1 `frontend/ttsManager.js` — Remove WASM loader

**Before (current):**
```javascript
// Loads entire Kokoro model into browser memory
const tts = await KokoroTTS.from_pretrained('onnx-community/Kokoro-82M-v1.0', {
  dtype: getKokoroDeviceConfig().dtype,
  device: getKokoroDeviceConfig().device,
});
```

**After (new):**
```javascript
// No model loading — server handles it
// ttsManager now only manages voice settings + server communication

export async function synthesize(text, voiceSettings) {
  const res = await fetch('/hazy/tts', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      text,
      voice: voiceSettings.voice || 'af_heart',
      speed: voiceSettings.speed || 1.0
    })
  });
  if (!res.ok) throw new Error(`TTS failed: ${res.status}`);
  return await res.blob(); // return audio blob to audioQueueManager
}
```

### 3.2 `frontend/streamingTTSController.js` — Rewire synthesize calls

**Before:** Called `HAZY_TTS_MANAGER.synthesize()` which ran WASM in-browser.

**After:** Same `synthesize()` call but now it goes to the server:
```javascript
// No changes to the controller's interface —
// just ensure synthesize() in ttsManager.js now calls /hazy/tts
// The streaming pipeline (start/push/finish/stop) stays intact
```

> ✅ This file needs minimal changes — the interface stays the same.

### 3.3 `frontend/audioQueueManager.js` — Feed blobs instead of PCM

**Before:** Received raw PCM Float32Array from WASM inference.

**After:** Receives WAV blob from server:
```javascript
// Inside the queue handler — decode the blob before queuing
async function enqueueBlob(audioBlob) {
  const arrayBuffer = await audioBlob.arrayBuffer();
  const audioBuffer = await _audioCtx.decodeAudioData(arrayBuffer);
  // rest of playback logic stays the same
  enqueueBuffer(audioBuffer);
}
```

### 3.4 `frontend/voiceSettingsStore.js` — Add device field

```javascript
// Add voiceDevice to the persisted settings
const defaults = {
  voiceEnabled: false,
  voiceVoice: 'af_heart',
  voiceSpeed: 1.0,
  voiceVolume: 100,
  voiceAutoplay: true,
  voiceDevice: 'auto', // NEW — 'auto' | 'cuda' | 'cpu'
};
```

### 3.5 `frontend/app.js` — Update speakText + status

```javascript
// Replace speakText() around line 4242
async function speakText(text, force = false) {
  if (!text.trim()) return;
  if (!force && !STATE.voiceEnabled) return;

  try {
    const blob = await window.HAZY_TTS_MANAGER.synthesize(text, {
      voice: STATE.voiceVoice || 'af_heart',
      speed: STATE.voiceSpeed || 1.0
    });
    await window.HAZY_AUDIO_QUEUE_MANAGER.enqueueBlob(blob);
  } catch (error) {
    console.warn('[Hazy Voice] unavailable:', error.message);
    showToast('Voice generation unavailable', '');
  }
}

// Replace hazy-kokoro-ready listener with health poll
async function checkKokoroHealth() {
  try {
    const res = await fetch('/hazy/tts/health');
    if (res.ok) {
      const hw = await fetch('/hazy/hardware').then(r => r.json());
      const deviceLabel = hw.gpu ? `GPU · ${hw.gpu}` : `CPU · ${hw.cpuModel}`;
      updateKokoroStatus('ready', `Kokoro ready — ${deviceLabel}`);
    } else {
      updateKokoroStatus('error', 'Kokoro server not responding');
    }
  } catch {
    updateKokoroStatus('idle', 'Kokoro server offline — run kokoro-fastapi');
  }
}
```

### 3.6 `frontend/index.html` — Remove WASM importmap

Remove the vendored runtime script tags:
```html
<!-- REMOVE THESE after server path confirmed -->
<!-- <script type="importmap">...</script> -->
<!-- <script src="vendor/kokoro-runtime/kokoro.web.js"></script> -->
<!-- <script src="vendor/kokoro-runtime/onnxruntime-web.js"></script> -->
<!-- <script src="vendor/kokoro-runtime/transformers.js"></script> -->

<!-- KEEP THESE -->
<script src="voiceSettingsStore.js"></script>
<script src="audioQueueManager.js"></script>
<script src="ttsManager.js"></script>
<script src="streamingTTSController.js"></script>
<script src="app.js"></script>
```

---

## 🧹 Phase 4 — Cleanup (After Testing Passes)

Files to **remove entirely** once server path is stable:

```
frontend/vendor/kokoro-runtime/
  ├── kokoro.web.js         ← DELETE
  ├── transformers.js       ← DELETE
  ├── onnxruntime-web.js    ← DELETE
  └── versions.json         ← DELETE

frontend/voices-data.js     ← DELETE (unused copy)
frontend/phonemize.js       ← DELETE (legacy, not wired)
frontend/splitter.js        ← DELETE (not used by Kokoro)
tools/vendor-kokoro-runtime.js ← DELETE (no longer needed)
```

---

## 🧪 Phase 5 — Testing Checklist

```
[ ] /hazy/hardware returns correct GPU/CPU info
[ ] kokoro-fastapi starts on device recommended by hardware scan
[ ] /hazy/tts/health returns { status: 'ok' }
[ ] curl test to :8880 returns valid .wav
[ ] Chat response triggers voice playback end-to-end
[ ] Streaming TTS works (words play as LLM responds)
[ ] audioQueueManager correctly queues server blobs
[ ] Voice settings (voice, speed, volume) respected
[ ] Stop / interrupt voice works
[ ] No WASM loading visible in Chrome DevTools Network tab
[ ] Browser RAM usage lower than before
[ ] GPU activity visible during TTS generation
[ ] CPU-only fallback works when no GPU detected
```

---

## 📉 Expected Results After Refactor

| Metric | Before | After |
|---|---|---|
| Chrome tab RAM | High (WASM in tab) | Significantly lower |
| TTS inference device | CPU via browser WASM | Auto-detected GPU or CPU |
| Voice generation speed | Slow | Fast (GPU path) |
| First-word latency | High | Low |
| App startup time | Slow (WASM preload) | Faster (no model in browser) |
| Hardware adaptability | Hardcoded | Auto-scanned per machine |

---

## ⚠️ Known Risks & Mitigations

| Risk | Mitigation |
|---|---|
| Kokoro server not running | Health check on startup + toast with instructions |
| CUDA not available on user machine | Hardware scan detects this → auto CPU fallback |
| Low VRAM | Hardware scan checks VRAM → warns + falls back to CPU |
| Port 8880 conflict | Configurable via `.env` → `KOKORO_PORT=8880` |
| Large text = slow first response | `streamingTTSController.js` already splits by sentence — keep this |
| nvidia-smi not installed | Catch block in hardware scan → graceful CPU fallback |

---

## 🗂️ File Change Summary

| File | Action |
|---|---|
| `backend/server.js` | Add `/hazy/tts`, `/hazy/tts/health`, `/hazy/hardware` |
| `backend/server.py` | Mirror same endpoints if Python path used |
| `frontend/ttsManager.js` | Replace `from_pretrained` WASM load with HTTP `synthesize()` |
| `frontend/streamingTTSController.js` | Minimal — interface unchanged, benefits automatically |
| `frontend/audioQueueManager.js` | Add `enqueueBlob()` for WAV blob input |
| `frontend/voiceSettingsStore.js` | Add `voiceDevice: 'auto'` field |
| `frontend/app.js` | Replace `speakText()`, replace ready listener with health poll |
| `frontend/index.html` | Remove WASM importmap + vendor script tags |
| `frontend/vendor/kokoro-runtime/` | Delete after Phase 5 passes |
| `frontend/voices-data.js` | Delete (unused) |
| `frontend/phonemize.js` | Delete (legacy) |
| `frontend/splitter.js` | Delete (not used) |

---

*Plan prepared for Hazy AI*
*Hardware is scanned at runtime — no assumptions made about the user's machine.*
