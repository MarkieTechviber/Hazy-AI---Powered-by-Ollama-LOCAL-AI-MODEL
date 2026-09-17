import os
import io
import sys
import importlib.util
import threading
from fastapi import FastAPI, Response
from pydantic import BaseModel, Field
from backend.python_boundary import LocalBoundary
import uvicorn
import json

app = FastAPI()
app.add_middleware(LocalBoundary, port=int(os.getenv('KOKORO_PORT', '8880')), max_bytes=65536)
SPEECH_LOCK = threading.Lock()

class SpeechRequest(BaseModel):
    input: str = Field(min_length=1, max_length=10000)
    voice: str = Field(default='af_heart', pattern=r'^[abefhipjz][fm]_[a-z0-9_]{1,40}$')
    speed: float = Field(default=1.0, ge=0.5, le=2.0, allow_inf_nan=False)


# Global pipeline cache
PIPELINES = {}
DEVICE = os.getenv('KOKORO_DEVICE', 'cpu')

def get_pipeline(lang_code: str):
    from kokoro import KPipeline
    if lang_code not in PIPELINES:
        print(f"[Kokoro] Loading pipeline for '{lang_code}' on {DEVICE}...")
        PIPELINES[lang_code] = KPipeline(lang_code=lang_code, device=DEVICE)
    return PIPELINES[lang_code]

@app.get("/health")
async def health():
    available = all(importlib.util.find_spec(name) is not None for name in ("kokoro", "torch", "soundfile"))
    return {"status": "ok" if available else "unavailable", "device": DEVICE, "modelLoaded": bool(PIPELINES)}

@app.post("/v1/audio/speech")
def speech(body: SpeechRequest):
    if not SPEECH_LOCK.acquire(blocking=False):
        return Response(content=json.dumps({"error": "TTS is busy; retry shortly."}), status_code=429, media_type="application/json")
    try:
        import soundfile as sf
        text = body.input
        voice = body.voice
        speed = body.speed
        
        if not text:
            return Response(content=json.dumps({"error": "No text provided"}), status_code=400)

        # Map voice to language code (e.g., 'af_heart' -> 'a')
        lang_code = voice[0] if voice else 'a'
        pipeline = get_pipeline(lang_code)
        
        # Generate audio
        generator = pipeline(text, voice=voice, speed=speed, split_pattern=r'\n+')
        
        # We'll collect chunks if needed
        all_audio = []
        for _, _, audio in generator:
            all_audio.append(audio)
            
        if not all_audio:
            return Response(content=json.dumps({"error": "Failed to generate audio"}), status_code=500)
            
        import numpy as np
        combined = np.concatenate(all_audio)
        
        # Convert to WAV in memory
        out = io.BytesIO()
        sf.write(out, combined, 24000, format='WAV')
        out.seek(0)
        
        return Response(content=out.read(), media_type="audio/wav")

    except Exception as e:
        print("[Kokoro] Speech generation unavailable. Check installed dependencies and model files.")
        return Response(content=json.dumps({"error": "TTS unavailable. Text chat remains available."}), status_code=503, media_type="application/json")
    finally:
        SPEECH_LOCK.release()

if __name__ == "__main__":
    print(f"--- Kokoro TTS Server starting on port 8880 ({DEVICE}) ---")
    if not (3, 10) <= sys.version_info[:2] <= (3, 12):
        raise SystemExit("This launcher supports Python 3.10–3.12 for Kokoro. Use Python 3.11 or 3.12; core Node chat does not need Python.")
    uvicorn.run(app, host=os.getenv("KOKORO_HOST", "127.0.0.1"), port=int(os.getenv("KOKORO_PORT", "8880")))
