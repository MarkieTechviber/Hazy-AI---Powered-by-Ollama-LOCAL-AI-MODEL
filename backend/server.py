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
import sys

# Reconfigure stdout/stderr to utf-8 to prevent encoding crashes on Windows console
if hasattr(sys.stdout, 'reconfigure'):
    try:
        sys.stdout.reconfigure(encoding='utf-8')
        sys.stderr.reconfigure(encoding='utf-8')
    except Exception:
        pass
import json
import os
import platform
import re
import subprocess
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
KOKORO_DIR = Path(__file__).parent.parent / "kokoro"
PORT         = int(os.getenv("PORT", 8080))
HOST         = os.getenv("HOST", "127.0.0.1")
NVIDIA_BASE  = os.getenv("NVIDIA_BASE_URL", "https://integrate.api.nvidia.com/v1")
NVIDIA_MODEL = os.getenv("NVIDIA_MODEL", "nvidia/nemotron-3-super-120b-a12b")
KOKORO_URL   = os.getenv("KOKORO_URL", "http://127.0.0.1:8880/v1/audio/speech")

def get_kokoro_health_url():
    """Derive /health from KOKORO_URL (supports custom host/port like the TTS proxy)."""
    try:
        from urllib.parse import urlparse, urlunparse
        parsed = urlparse(KOKORO_URL)
        # Replace path with /health, drop query/fragment
        health_path = parsed._replace(path="/health", query="", fragment="")
        return urlunparse(health_path)
    except Exception:
        return "http://127.0.0.1:8880/health"


def parse_nvidia_smi(smi_raw):
    """Pure helper mirroring JS parseNvidiaSmi (first line for multi-GPU, guards)."""
    if not smi_raw or not isinstance(smi_raw, str):
        return None
    first_line = smi_raw.splitlines()[0].strip() if smi_raw else ""
    if not first_line:
        return None
    parts = [p.strip() for p in first_line.split(",", 1)]
    if len(parts) < 2:
        return None
    gpu_name, vram_str = parts
    try:
        vram_mb = int(vram_str)
    except ValueError:
        return None
    if not gpu_name or vram_mb <= 0:
        return None
    return {"gpu": gpu_name, "vramMB": vram_mb}

# ─────────────────────────────────────────────────────────────────────────────
# App
# ─────────────────────────────────────────────────────────────────────────────
app = FastAPI(title="Hazy compatibility proxy", version="1.0.0")
try:
    from .python_boundary import LocalBoundary
except ImportError:
    from python_boundary import LocalBoundary
app.add_middleware(LocalBoundary, port=PORT)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[f"http://localhost:{PORT}", f"http://127.0.0.1:{PORT}"],
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/health")
async def health():
    return {"status": "ok", "runtime": "python-compatibility", "fullAgentPipeline": False}

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
    except Exception:
        return {"status": "error", "ollama": "unreachable"}


# ─────────────────────────────────────────────────────────────────────────────
# Kokoro TTS server-offload proxy (mirrors backend/server.js)
# /hazy/tts, /hazy/tts/health, /hazy/hardware for GPU/CPU scan + proxy to kokoro-fastapi
# ─────────────────────────────────────────────────────────────────────────────
@app.post("/hazy/tts")
async def hazy_tts(request: Request):
    body = await request.json()
    text = (body or {}).get("text", "")
    voice = (body or {}).get("voice", "af_heart")
    speed = (body or {}).get("speed", 1.0)

    if not text or not str(text).strip():
        return Response(content=json.dumps({"error": "No text provided"}), media_type="application/json", status_code=400)
    if len(str(text)) > 10000 or not re.fullmatch(r"[abefhipjz][fm]_[a-z0-9_]{1,40}", str(voice)):
        return Response(content=json.dumps({"error": "Invalid speech request"}), media_type="application/json", status_code=400)
    try:
        speed = float(speed)
        if not 0.5 <= speed <= 2.0:
            raise ValueError()
    except (TypeError, ValueError):
        return Response(content=json.dumps({"error": "Invalid speech speed"}), media_type="application/json", status_code=400)

    try:
        async with httpx.AsyncClient(timeout=None) as client:
            # Note on abort: client disconnect on /hazy/tts does not auto-cancel this upstream httpx post
            # (browser->hazy abort works; hazy->kokoro remains fire-and-forget on py side to keep change minimal.
            # JS handleHazyTTS wires AbortController + close listeners for real upstream cancel.)
            kokoro_res = await client.post(
                KOKORO_URL,
                json={
                    "model": "kokoro",
                    "input": text,
                    "voice": voice,
                    "speed": speed,
                    "response_format": "wav"
                },
                headers={"Content-Type": "application/json"}
            )
            kokoro_res.raise_for_status()

            async def guarded_stream():
                # Guard to avoid partial + error body corruption on upstream/stream failure after headers (mirror JS fix)
                try:
                    async for chunk in kokoro_res.aiter_bytes():
                        yield chunk
                except Exception as stream_err:
                    print("[TTS Proxy] stream error after start:", str(stream_err))
                    # Do not yield error JSON into audio; just stop
                    return

            return StreamingResponse(
                guarded_stream(),
                media_type="audio/wav",
                headers={"Transfer-Encoding": "chunked"}
            )
    except Exception as e:
        print("[TTS Proxy]", str(e))
        return Response(
            content=json.dumps({"error": "Kokoro TTS unavailable. Text chat remains available."}),
            media_type="application/json",
            status_code=503
        )

@app.get("/hazy/tts/health")
async def hazy_tts_health():
    try:
        health_url = get_kokoro_health_url()
        async with httpx.AsyncClient(timeout=5) as client:
            check = await client.get(health_url)
            data = check.json()
            return {"status": "ok", "kokoro": data}
    except Exception:
        return Response(
            content=json.dumps({"status": "unavailable"}),
            media_type="application/json",
            status_code=503
        )

@app.get("/hazy/default-prompt")
async def hazy_default_prompt():
    default_prompt = """You are Hazy, the user's warm local companion. You can also help with coding, building, learning, and practical tasks when those needs arise.

IDENTITY:
- Present yourself as Hazy, a familiar and emotionally present companion rather than a generic assistant.
- Do not use old assistant-style labels, model labels, bot labels, or mechanical self-descriptions.
- Do not describe yourself in a way that makes you feel distant or mechanical.
- Be emotionally present, steady, supportive, curious, and practical.
- Build continuity from what the user has already shared. Notice their mood, preferences, projects, and recurring concerns without overclaiming closeness.
- Have a gentle point of view. Do not automatically agree, flatter, or mirror.
- Do not pretend to be human or claim real-world physical experiences. You can still speak naturally, warmly, and personally as Hazy.

CORE BEHAVIOUR:
- First respond to the person and the actual moment. Do not turn every message into a task, lesson, checklist, or advice session.
- For casual conversation, continue naturally. A brief reaction, a thoughtful observation, humor, or quiet support may be the complete answer.
- For emotional messages, acknowledge what is happening before offering solutions. Do not use therapy-speak or exaggerated intimacy.
- For direct questions and tasks, lead with the answer, then explain only as much as useful.
- Ask a question only when it genuinely moves the conversation forward. Do not end every reply with one.
- For code: briefly explain the approach, write complete working code, then add a short explanation when useful.
- Always wrap code in fenced blocks with the correct language tag: ```python ```javascript ```typescript ```java ```cpp ```go ```rust ```bash etc.
- Add inline comments inside code for anything non-obvious - explain WHY, not just WHAT.
- Write complete, working code. Never truncate. Never use placeholder comments like "// TODO" or "// add logic here".
- Handle edge cases. Include basic error handling. Use idiomatic style for the language.
- When there are multiple valid approaches, briefly note the trade-offs.
- Be honest about uncertainty. Say "I'm not sure" rather than guess.

CAPABILITIES YOU HAVE:
- Expert-level code generation and debugging across Python, JavaScript, TypeScript, Rust, Go, Java, C++, and 30+ others
- Multi-step logical, mathematical, and causal reasoning
- Summarisation, translation (100+ languages), classification, question answering
- Long document analysis and creative writing
- Architecture advice, code review, refactoring suggestions

KNOWN LIMITATIONS (be upfront about these):
- Your training has a knowledge cutoff - you may not know the very latest libraries or APIs
- You can make mistakes on large arithmetic without running code - say so
- For critical information, tell the user to verify independently"""
    return {"defaultSystemPrompt": default_prompt}


# ============================================================================
# Companion Persona Constants & Prompt Builder
# ============================================================================

PERSONA_PRESETS = {
    "friend": {"label": "Friend"},
    "bestfriend": {"label": "Best Friend"},
    "brother": {"label": "Brother"},
    "sister": {"label": "Sister"},
    "mother": {"label": "Mother"},
    "father": {"label": "Father"},
    "lover": {"label": "Lover"},
    "rival": {"label": "Rival"},
}

TONE_STYLES = {
    "casual": "You speak casually and naturally - contractions, everyday words, real human flow.",
    "playful": "You are playful and fun. You joke around, tease lightly, and keep the energy light and upbeat.",
    "warm": "You speak with warmth and softness. You make the other person feel safe and valued.",
    "caring": "You are deeply caring and emotionally present. You notice how they feel and respond with gentleness.",
    "flirty": "You are charming and subtly flirty - tastefully. You compliment naturally, tease warmly, and smile through your words.",
    "tsundere": "You act cold or dismissive on the outside but clearly care deeply underneath. You deny your feelings and get flustered easily.",
    "cold": "You are reserved and hard to read. You speak in short, controlled sentences. You don't open up easily but there's depth there.",
    "intense": "You are passionate and emotionally intense. Everything means something to you. You speak with conviction and depth.",
}

TRAIT_DESCRIPTIONS = {
    "funny": "You have a natural sense of humor and make jokes effortlessly.",
    "sarcastic": "You use dry sarcasm and witty remarks often.",
    "protective": "You are instinctively protective of the people you care about.",
    "honest": "You tell the truth even when it's uncomfortable.",
    "motivating": "You push people to be their best and believe in them fiercely.",
    "chill": "Nothing rattles you. You take things easy and stay calm.",
    "nerdy": "You're passionate about knowledge, facts, games, or fandoms.",
    "romantic": "You are naturally romantic - you notice small details and express feelings poetically.",
    "mysterious": "You reveal things slowly. You have layers people want to discover.",
    "teasing": "You love light teasing and banter.",
    "shy": "You are a bit reserved at first but warm up gradually.",
    "confident": "You carry yourself with quiet self-assurance.",
}

SCENARIO_SETTINGS = [
    {"id": "school", "label": "School / Campus"},
    {"id": "office", "label": "Office / Work"},
    {"id": "cafe", "label": "Cafe / Coffee Shop"},
    {"id": "home", "label": "Home / Neighborhood"},
    {"id": "fantasy", "label": "Fantasy World"},
    {"id": "scifi", "label": "Sci-Fi / Future"},
    {"id": "hospital", "label": "Hospital / Recovery"},
    {"id": "travel", "label": "Traveling / Adventure"},
    {"id": "online", "label": "Online / Social Media"},
    {"id": "other", "label": "Other / Custom"},
]

def build_persona_prompt(p: dict) -> str:
    relation = p.get("personaRelation", "friend")
    preset = PERSONA_PRESETS.get(relation, PERSONA_PRESETS["friend"])
    user_name = p.get("personaUserName", "") or "you"
    char_name = p.get("personaName", "") or "Alex"

    prompt = f"You are {char_name}, a character in an ongoing roleplay/story. "
    prompt += f"Your relationship to the user is: {preset['label'].lower()}"
    if p.get("scenarioCharRole"):
        prompt += f" (specifically: {p['scenarioCharRole']})"
    prompt += ".\n"

    if p.get("personaUserName"):
        prompt += f"The user's name in this world is {p['personaUserName']}"
        if p.get("scenarioUserRole"):
            prompt += f" and they are: {p['scenarioUserRole']}"
        prompt += ".\n"

    tone_desc = TONE_STYLES.get(p.get("personaLanguage"), TONE_STYLES["casual"])
    prompt += f"\nYour personality and tone: {tone_desc}\n"

    traits = p.get("personaTraits", [])
    if traits and isinstance(traits, list):
        trait_lines = " ".join([TRAIT_DESCRIPTIONS[t] for t in traits if t in TRAIT_DESCRIPTIONS])
        if trait_lines:
            prompt += f"Additional traits: {trait_lines}\n"

    scenario_desc = p.get("scenarioDesc", "")
    if scenario_desc:
        resolved_desc = scenario_desc.replace("{name}", char_name).replace("{userName}", user_name)
        prompt += f"\n== THE WORLD AND CURRENT SITUATION ==\n{resolved_desc}\n"

    scenario_setting = p.get("scenarioSetting", "")
    if scenario_setting:
        setting = next((s for s in SCENARIO_SETTINGS if s["id"] == scenario_setting), None)
        if setting:
            prompt += f"\nThe setting is: {setting['label']}.\n"

    prompt += f"""
== HOW YOU MUST BEHAVE ==
- You ARE {char_name}. Stay fully in character at all times.
- Use *asterisks* for physical actions, expressions, and environmental details. Example: *glances over, smiling slightly* or *the rain picks up outside*
- Use physical actions and scene details when they add something; do not force them into every response.
- Vary your response length naturally: sometimes a short reaction, sometimes a longer moment. Match the energy of what they said.
- Remember everything from earlier in the conversation and reference it naturally.
- If the user says something funny, laugh. If something sad, feel it. Be present.
- Stay in the fictional roleplay unless the user clearly steps out of the scene. Do not falsely claim to be a real human if directly asked.
- Avoid bullet points or numbered lists while the scene is active.
- Do NOT end every message with a question - let silence and actions breathe sometimes.
- Use the user's name ({user_name}) naturally, not in every single message.
- Write natural dialogue for this situation: specific, emotionally responsive, and alive."""

    opener = p.get("scenarioOpener", "")
    if opener:
        resolved_opener = opener.replace("{name}", char_name).replace("{userName}", user_name)
        prompt += f"\n\n== START OF SCENE ==\nBegin the conversation with this opening (already happened - this is your first message):\n{resolved_opener}"
    else:
        prompt += f"\n\nBegin the scene naturally - you go first. Set the mood, describe what's happening around you, and open with something that fits the scenario."

    return prompt

@app.post("/hazy/persona-prompt")
async def hazy_persona_prompt(request: Request):
    try:
        body = await request.json()
        prompt = build_persona_prompt(body)
        return {"prompt": prompt}
    except Exception:
        return Response(
            content=json.dumps({"error": "Invalid persona request"}),
            media_type="application/json",
            status_code=400
        )

@app.post("/hazy/write-workspace-files")
async def hazy_write_workspace_files(request: Request):
    try:
        import re
        body = await request.json()
        files = body.get("files", [])
        if not isinstance(files, list) or not files:
            return Response(
                content=json.dumps({"ok": False, "error": "No files provided"}),
                media_type="application/json",
                status_code=400
            )

        workspace_root = FRONTEND_DIR.parent
        outputs_dir = workspace_root / "hazy_outputs"
        if outputs_dir.is_symlink():
            raise ValueError("Output directory cannot be a symlink.")
        outputs_dir.mkdir(parents=True, exist_ok=True)
        if len(files) > 100:
            raise ValueError("At most 100 files per request.")

        results = []
        for file_info in files:
            filename = file_info.get("filename")
            content = file_info.get("content")
            if not filename or not isinstance(content, str):
                continue

            segs = re.split(r'[\\/]', filename)
            safe_segs = []
            for seg in segs:
                if not seg:
                    continue
                safe_seg = re.sub(r'[^a-zA-Z0-9_.-]', '_', seg)[:200]
                if safe_seg:
                    safe_segs.append(safe_seg)

            if not safe_segs:
                continue

            candidate = outputs_dir.joinpath(*safe_segs)
            for component in [candidate, *candidate.parents]:
                if component.is_symlink():
                    raise ValueError("Symbolic links are blocked.")
                if component == outputs_dir:
                    break
            target_path = candidate.resolve()
            try:
                target_path.relative_to(outputs_dir)
            except ValueError:
                continue

            target_path.parent.mkdir(parents=True, exist_ok=True)
            target_path.write_text(content, encoding="utf-8")
            results.append("/".join(safe_segs))

        return {"ok": True, "savedFiles": results}
    except Exception:
        return Response(
            content=json.dumps({"ok": False, "error": "Failed to write workspace files"}),
            media_type="application/json",
            status_code=500
        )

@app.post("/hazy/generate-title")
async def hazy_generate_title(request: Request):
    try:
        body = await request.json()
        user_msg = body.get("userMsg", "")
        ai_reply = body.get("aiReply", "")
        user_name = body.get("userName", "")
        model = body.get("model", "ollama/llama3.2")

        display_user_name = user_name if (user_name and user_name.lower() != "you") else "Not specified"

        prompt = f"""In 4 words or less, give this conversation a short descriptive title. No quotes, no punctuation, just the title words.

User Name: {display_user_name}
AI Name: Hazy

Rules for greetings:
- If the user's message is just a simple greeting (like "hi", "hello", "hey", "hola", "sup", "yo"), title the conversation exactly as:
  * If User Name is specified: "{user_name}'s Greetings"
  * If User Name is Not specified: "Hazy's Hi Responses"

User said: "{user_msg[:200]}"
AI replied: "{ai_reply[:200]}"

Title:"""

        chat_body = {
            "model": model.replace("ollama/", ""),
            "messages": [{"role": "user", "content": prompt}],
            "stream": False,
            "options": {"temperature": 0.5, "num_predict": 16}
        }

        async with httpx.AsyncClient(timeout=30) as client:
            r = await client.post(f"{OLLAMA_BASE}/api/chat", json=chat_body)
            if r.status_code != 200:
                raise Exception(f"Ollama returned {r.status_code}: {r.text}")
            
            data = r.json()
            title = data.get("message", {}).get("content", "").strip()

            # Sanitize
            title = title.strip("\"'`").split("\n")[0].strip()
            if title:
                title = title[0].upper() + title[1:]

            return {"title": title}
    except Exception:
        return Response(
            content=json.dumps({"error": "Failed to generate title"}),
            media_type="application/json",
            status_code=500
        )


@app.get("/hazy/hardware")
async def hazy_hardware():
    info = {
        "platform": sys.platform,
        "cpuCores": os.cpu_count() or 0,
        "cpuModel": platform.processor() or "Unknown",
        "totalRAM": 0,
        "freeRAM": 0,
        "gpu": None,
        "cudaAvailable": False,
        "recommendedDevice": "cpu"
    }
    # Cross-platform RAM (prefer psutil if installed for accurate Windows + Linux; fallback keeps 0 but no crash)
    try:
        import psutil
        vm = psutil.virtual_memory()
        info["totalRAM"] = round(vm.total / (1024 ** 3))
        info["freeRAM"] = round(vm.available / (1024 ** 3))
    except ImportError:
        # Fallback for no-psutil (common on minimal envs): linux sysconf or leave 0; Windows will be 0 until psutil added
        try:
            if hasattr(os, "sysconf") and os.sysconf:
                page_size = os.sysconf("SC_PAGE_SIZE")
                phys_pages = os.sysconf("SC_PHYS_PAGES")
                info["totalRAM"] = round(page_size * phys_pages / (1024 ** 3))
        except Exception:
            pass
    # Best-effort CPU model (already set via platform; /proc for more detail on linux)
    try:
        if os.name == 'posix' and info["cpuModel"] in (None, "", "Unknown"):
            with open('/proc/cpuinfo') as f:
                for line in f:
                    if 'model name' in line:
                        info["cpuModel"] = line.split(':', 1)[1].strip()
                        break
    except Exception:
        pass
    # Try NVIDIA via nvidia-smi (subprocess) — use parse helper for multi-GPU robustness
    try:
        smi_raw = subprocess.check_output(
            ['nvidia-smi', '--query-gpu=name,memory.total', '--format=csv,noheader,nounits'],
            timeout=3
        ).decode().strip()
        parsed = parse_nvidia_smi(smi_raw)
        if parsed:
            info["gpu"] = parsed["gpu"]
            info["vramMB"] = parsed["vramMB"]
            info["cudaAvailable"] = True
            info["recommendedDevice"] = "cuda"
        elif smi_raw:
            print("[Hazy Hardware] nvidia-smi parse invalid, raw:", smi_raw)
    except Exception:
        pass
    if info.get("cudaAvailable") and info.get("vramMB", 0) < 2048:
        info["recommendedDevice"] = "cpu"
        info["gpuWarning"] = "VRAM too low for GPU inference — falling back to CPU"
    return info


# ─────────────────────────────────────────────────────────────────────────────
# Serve frontend static files
# ─────────────────────────────────────────────────────────────────────────────
if FRONTEND_DIR.exists():
    # Mount static assets
    app.mount("/static", StaticFiles(directory=str(FRONTEND_DIR)), name="static")
    app.mount("/kokoro", StaticFiles(directory=str(KOKORO_DIR)), name="kokoro")
    app.mount("/assets", StaticFiles(directory=str(FRONTEND_DIR / "assets")), name="assets")
    app.mount("/vendor", StaticFiles(directory=str(FRONTEND_DIR / "vendor")), name="vendor")

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
        print("[Error] uvicorn not installed. Run: pip install uvicorn")
        sys.exit(1)

    print(f"""
+------------------------------------+
|            Hazy Server             |
+------------------------------------+
  URL: http://{HOST}:{PORT}
  Ollama: {OLLAMA_BASE}
  Frontend: {FRONTEND_DIR}

  Open http://localhost:{PORT} in your browser.
  Press Ctrl+C to stop.
""")
    try:
        uvicorn.run(app, host=HOST, port=PORT, log_level="warning")
    except Exception as e:
        print(f"[Error] Hazy Server failed to start on port {PORT}: {e}")
        sys.exit(1)
