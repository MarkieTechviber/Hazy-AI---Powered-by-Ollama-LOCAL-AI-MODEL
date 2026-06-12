import os
import io
import torch
import soundfile as sf
from fastapi import FastAPI, Response
from kokoro import KPipeline
import uvicorn
import json

app = FastAPI()

# Global pipeline cache
PIPELINES = {}
DEVICE = 'cuda' if torch.cuda.is_available() else 'cpu'

def get_pipeline(lang_code: str):
    if lang_code not in PIPELINES:
        print(f"[Kokoro] Loading pipeline for '{lang_code}' on {DEVICE}...")
        PIPELINES[lang_code] = KPipeline(lang_code=lang_code)
    return PIPELINES[lang_code]

@app.get("/health")
async def health():
    return {"status": "ok", "device": DEVICE}

@app.post("/v1/audio/speech")
def speech(body: dict):
    try:
        text = body.get("input", "")
        voice = body.get("voice", "af_heart")
        speed = body.get("speed", 1.0)
        
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
        print(f"[Kokoro] Error: {e}")
        return Response(content=json.dumps({"error": str(e)}), status_code=500)

if __name__ == "__main__":
    print(f"--- Kokoro TTS Server starting on port 8880 ({DEVICE}) ---")
    uvicorn.run(app, host="0.0.0.0", port=8880)
