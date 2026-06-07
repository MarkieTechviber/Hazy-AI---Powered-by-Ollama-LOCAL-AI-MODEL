#!/usr/bin/env python3
"""
Hazy Backend Server
-----------------------
A lightweight proxy + static file server that:
  1. Serves the frontend (HTML/CSS/JS)
  2. Proxies /api/* requests to Ollama (avoids CORS issues)
  3. Streams responses from Ollama back to the frontend

Requirements:
  pip install fastapi uvicorn httpx

Run:
  python server.py
  # OR with auto-reload:
  uvicorn server:app --reload --port 8080
"""

import asyncio
import json
import os
import sys
from pathlib import Path
from typing import AsyncGenerator

try:
    import httpx
    from fastapi import FastAPI, Request, Response
    from fastapi.middleware.cors import CORSMiddleware
    from fastapi.responses import StreamingResponse, FileResponse, HTMLResponse
    from fastapi.staticfiles import StaticFiles
    from openai import OpenAI
except ImportError:
    print("\n❌  Missing dependencies. Please run:\n")
    print("    pip install fastapi uvicorn httpx openai\n")
    sys.exit(1)

# ─────────────────────────────────────────────────────────────────────────────
# Config
# ─────────────────────────────────────────────────────────────────────────────
OLLAMA_BASE  = os.getenv("OLLAMA_URL", "http://localhost:11434")
FRONTEND_DIR = Path(__file__).parent.parent / "frontend"
PORT         = int(os.getenv("PORT", 8080))
HOST         = os.getenv("HOST", "127.0.0.1")
NVIDIA_BASE  = os.getenv("NVIDIA_BASE_URL", "https://integrate.api.nvidia.com/v1")
NVIDIA_MODEL = os.getenv("NVIDIA_MODEL", "nvidia/nemotron-3-super-120b-a12b")

# ─────────────────────────────────────────────────────────────────────────────
# App
# ─────────────────────────────────────────────────────────────────────────────
app = FastAPI(title="Hazy", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# ─────────────────────────────────────────────────────────────────────────────
# Ollama proxy helpers
# ─────────────────────────────────────────────────────────────────────────────
async def stream_ollama(url: str, body: dict) -> AsyncGenerator[bytes, None]:
    """Stream NDJSON lines from Ollama and forward them."""
    async with httpx.AsyncClient(timeout=None) as client:
        async with client.stream("POST", url, json=body) as resp:
            resp.raise_for_status()
            async for line in resp.aiter_lines():
                if line:
                    yield (line + "\n").encode()


def stream_nvidia_chat(api_key: str, body: dict):
    client = OpenAI(base_url=NVIDIA_BASE, api_key=api_key)
    completion = client.chat.completions.create(
        model=body.get("model", NVIDIA_MODEL),
        messages=body.get("messages", []),
        temperature=body.get("temperature", 1),
        top_p=body.get("top_p", 0.95),
        max_tokens=body.get("max_tokens", 16384),
        extra_body=body.get(
            "extra_body",
            {"chat_template_kwargs": {"enable_thinking": True}, "reasoning_budget": 16384},
        ),
        stream=True,
    )

    for chunk in completion:
        if not getattr(chunk, "choices", None):
            continue
        delta = chunk.choices[0].delta
        if delta.content is not None:
            yield delta.content.encode()


# ─────────────────────────────────────────────────────────────────────────────
# API routes (proxy to Ollama)
# ─────────────────────────────────────────────────────────────────────────────
@app.get("/api/tags")
async def list_models():
    """List available Ollama models."""
    async with httpx.AsyncClient(timeout=10) as client:
        try:
            r = await client.get(f"{OLLAMA_BASE}/api/tags")
            return Response(content=r.content, media_type="application/json", status_code=r.status_code)
        except httpx.ConnectError:
            return Response(
                content=json.dumps({"error": "Cannot connect to Ollama", "models": []}),
                media_type="application/json",
                status_code=503,
            )


@app.post("/api/chat")
async def chat(request: Request):
    """Proxy streaming chat requests to Ollama."""
    body = await request.json()
    stream = body.get("stream", True)

    if stream:
        return StreamingResponse(
            stream_ollama(f"{OLLAMA_BASE}/api/chat", body),
            media_type="application/x-ndjson",
        )
    else:
        async with httpx.AsyncClient(timeout=120) as client:
            r = await client.post(f"{OLLAMA_BASE}/api/chat", json=body)
            return Response(content=r.content, media_type="application/json", status_code=r.status_code)


@app.post("/api/generate")
async def generate(request: Request):
    """Proxy streaming generate requests to Ollama."""
    body = await request.json()
    stream = body.get("stream", True)

    if stream:
        return StreamingResponse(
            stream_ollama(f"{OLLAMA_BASE}/api/generate", body),
            media_type="application/x-ndjson",
        )
    else:
        async with httpx.AsyncClient(timeout=120) as client:
            r = await client.post(f"{OLLAMA_BASE}/api/generate", json=body)
            return Response(content=r.content, media_type="application/json", status_code=r.status_code)


@app.post("/api/nvidia/chat")
async def nvidia_chat(request: Request):
    """Stream chat responses from NVIDIA's OpenAI-compatible endpoint."""
    body = await request.json()
    api_key = body.get("apiKey") or os.getenv("NVIDIA_API_KEY")
    if not api_key:
        return Response(
            content=json.dumps({"error": "NVIDIA API key not set. Set NVIDIA_API_KEY."}),
            media_type="application/json",
            status_code=401,
        )

    return StreamingResponse(
        stream_nvidia_chat(api_key, body),
        media_type="text/plain",
    )


@app.get("/api/status")
async def status():
    """Health check — checks if Ollama is reachable."""
    try:
        async with httpx.AsyncClient(timeout=5) as client:
            r = await client.get(f"{OLLAMA_BASE}/api/tags")
            data = r.json()
            models = [m["name"] for m in data.get("models", [])]
            return {"status": "ok", "ollama": "connected", "models": models, "url": OLLAMA_BASE}
    except Exception as e:
        return {"status": "error", "ollama": "unreachable", "error": str(e), "url": OLLAMA_BASE}


# ─────────────────────────────────────────────────────────────────────────────
# Serve frontend static files
# ─────────────────────────────────────────────────────────────────────────────
if FRONTEND_DIR.exists():
    # Mount static assets
    app.mount("/static", StaticFiles(directory=str(FRONTEND_DIR)), name="static")

    @app.get("/")
    async def serve_index():
        index = FRONTEND_DIR / "index.html"
        if index.exists():
            return FileResponse(str(index))
        return HTMLResponse("<h2>Frontend not found. Place frontend/ next to server.py</h2>", status_code=404)

    @app.get("/{filename}")
    async def serve_file(filename: str):
        fp = FRONTEND_DIR / filename
        if fp.exists() and fp.is_file():
            return FileResponse(str(fp))
        # fallback to index for SPA routing
        return FileResponse(str(FRONTEND_DIR / "index.html"))
else:
    @app.get("/")
    async def no_frontend():
        return HTMLResponse("""
        <html><body style="font-family:monospace; padding:40px; background:#0f1117; color:#e8ecf4;">
        <h2>⚠️  Frontend directory not found</h2>
        <p>Expected: <code>frontend/</code> next to <code>server.py</code></p>
        <p>The API proxy is still running at <code>/api/*</code></p>
        </body></html>
        """)


# ─────────────────────────────────────────────────────────────────────────────
# Entry point
# ─────────────────────────────────────────────────────────────────────────────
if __name__ == "__main__":
    try:
        import uvicorn
    except ImportError:
        print("❌  uvicorn not installed. Run: pip install uvicorn")
        sys.exit(1)

    print(f"""
╔══════════════════════════════════════╗
║         Hazy Server              ║
╚══════════════════════════════════════╝
  🌐  http://{HOST}:{PORT}
  🤖  Ollama: {OLLAMA_BASE}
  📁  Frontend: {FRONTEND_DIR}

  Open http://localhost:{PORT} in your browser.
  Press Ctrl+C to stop.
""")
    uvicorn.run(app, host=HOST, port=PORT, log_level="warning")
