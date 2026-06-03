# Hazy - Local Companion
### by Dream On

A feature-rich local companion that runs **100% on your machine** using [Ollama](https://ollama.com).
Fully private — no cloud, no subscriptions, no data leaving your device.

---

## ✨ Features

| Feature | Description |
|---|---|
| 💬 **Smart Chat** | Streaming responses, markdown rendering, syntax highlighting |
| 🌐 **Website Builder** | AI generates full multi-file websites (HTML/CSS/JS + backend) with live preview & ZIP download |
| 🎭 **Companion Personas** | Character-style personas with scenarios, relationships, and roleplay |
| 📎 **File Upload** | Attach images (vision), PDFs, code files, CSVs — AI reads and understands them |
| 🎤 **Piper AI Voice** | Lightweight neural TTS — natural voices, 12 languages, runs 100% locally |
| ✏️ **Edit Messages** | Edit any sent message and regenerate Hazy's response from that point |
| 🔍 **Search Chats** | Search your conversation history from the sidebar |
| 🏷️ **Smart Titles** | AI auto-generates a short descriptive title for each chat |
| 🌓 **3 Themes** | Hazel (warm), Dark, OLED |
| 💾 **IndexedDB Cache** | Streaming output saved to local storage as RAM safety net |

---

## 🖥️ System Requirements

| Component | Minimum | Recommended |
|---|---|---|
| VRAM | 4GB | 6–8GB |
| RAM | 8GB | 16GB |
| Storage | 5GB | 20GB+ |
| OS | Windows 10 / macOS 12 / Ubuntu 20.04 | Any modern OS |
| Browser | Chrome 112+ / Edge 112+ | Chrome latest |

---

## 🚀 Quick Start

### Step 1 — Install Ollama

Download and install from **https://ollama.com**

Verify:
```bash
ollama --version
```

### Step 2 — Pull a Model

**Recommended for 4GB VRAM:**
```bash
ollama pull mistral          # Mistral 7B Q4 — best quality/speed (~4GB)
ollama pull llama3.2         # Llama 3.2 3B — faster, lower memory (~2GB)
ollama pull phi3             # Phi-3 Mini — smart and small (~2.3GB)
```

**For 6–8GB VRAM:**
```bash
ollama pull llama3           # Meta Llama 3 8B
ollama pull gemma2           # Google Gemma 2 9B
ollama pull qwen2.5          # Alibaba Qwen 2.5 7B
```

**For image/vision support (file upload feature):**
```bash
ollama pull llava            # LLaVA — best vision model
ollama pull llama3.2-vision  # Llama 3.2 Vision
```

### Step 3 — Start Hazy

**Windows:**
```
Double-click start.bat
```

**macOS / Linux:**
```bash
chmod +x start.sh
./start.sh
```

**Manual (Node.js):**
```bash
cd backend
node server.js
# Open http://localhost:8080
```

**Manual (Python):**
```bash
cd backend
pip install -r requirements.txt
python server.py
# Open http://localhost:8080
```

---

## 📁 Project Structure

```
hazy-chatbot/
├── frontend/
│   ├── index.html      ← Main UI + all modals
│   ├── style.css       ← Full design system (2300+ lines)
│   └── app.js          ← All logic (2700+ lines)
├── backend/
│   ├── server.js       ← Node.js server (zero npm deps)
│   ├── server.py       ← Python/FastAPI alternative
│   ├── package.json
│   └── requirements.txt
├── start.sh            ← macOS/Linux launcher
├── start.bat           ← Windows launcher
└── README.md
```

---

## 🎤 Piper AI Voice (TTS)

Hazy includes **Piper** — a fast, lightweight neural text-to-speech engine that runs
100% in your browser via WASM. No server, no API key, no internet after the first download.

### How to set it up

1. Start Hazy and open it in your browser
2. Click the **TTS** button in the bottom bar
3. Select **🧠 Piper AI Voice**
4. Select a voice from the dropdown — it downloads once (~30–80MB) and caches permanently
5. Pick a voice from the dropdown
6. Click **Preview Voice** to test it
7. Click **Enable & Start**

Every Hazy response will now be read aloud in the selected voice automatically.

### Available voices

| Voice | Type | Description |
|---|---|---|
| Heart ⭐ | 🇺🇸 American Female | Highest quality — recommended |
| Bella | 🇺🇸 American Female | Warm and natural |
| Nicole | 🇺🇸 American Female | Clear and articulate |
| Sky | 🇺🇸 American Female | Light and expressive |
| Sarah | 🇺🇸 American Female | Smooth and professional |
| Adam | 🇺🇸 American Male | Deep and confident |
| Michael | 🇺🇸 American Male | Natural and friendly |
| Emma | 🇬🇧 British Female | Crisp British accent |
| Isabella | 🇬🇧 British Female | Elegant and clear |
| George | 🇬🇧 British Male | Rich British accent |
| Lewis | 🇬🇧 British Male | Calm and measured |

### Requirements for Piper

| | |
|---|---|
| **Browser** | Chrome 112+ or Edge 112+ (Firefox works but is slower via WASM) |
| **Internet** | Required once for the ~160MB model download |
| **RAM** | ~400MB free while model is running |
| **Storage** | ~160MB in browser cache (persists until you clear browser data) |

> **Tip:** The model stays cached — closing and reopening the tab does NOT re-download it.
> If Piper fails to load, switch to Browser Voice in the TTS settings as a fallback.

---

## 🌐 Website Builder

Switch to **Build Website** mode in the input bar, then describe what you want:

```
Build me a portfolio landing page with a hero section, about me, skills, and contact form
```

```
Create a restaurant website with Home, Menu, About, Contact pages and a Node.js backend
```

```
Build an analytics dashboard with Chart.js charts showing revenue and user data
```

Hazy generates all files, shows them in a tabbed panel with syntax highlighting,
renders a live preview, and lets you download everything as a ZIP.

**Supports:** HTML/CSS/JS, multi-page sites, Express.js backends, Chart.js dashboards,
contact forms with validation, Google Fonts, responsive design.

---

## 🎭 Companion Personas

Click the **Persona** button in the sidebar to create a character and scenario.

### Quick Start scenarios included

| Scenario | Setting |
|---|---|
| 🔬 Lab Partners | Chemistry class, Monday morning |
| ☕ Coffee Shop Crush | Rainy campus café |
| 🛤️ Childhood Friend Reunion | Hometown convenience store, 7 years later |
| 💼 Office Rival | Glass conference room, Friday deadline |
| ⚔️ Fantasy Kingdom | Ashwood Forest, dangerous mission |
| 📚 Late Night Study | University library, finals week |
| 🏥 Hospital Roommates | Two-day stay, identical beige meals |
| ✏️ Custom | Write your own scenario from scratch |

Or build your own — write a custom scenario description, set the opening line,
choose a relationship type, personality traits, and conversation tone.

Hazy opens the scene automatically, uses `*actions*` for body language and environment,
stays fully in character, and never breaks the fourth wall.

---

## 📎 File Upload

Attach files to any message using the 📎 button, drag-and-drop onto the input area,
or paste directly from clipboard (Ctrl+V for images).

| File type | What Hazy does |
|---|---|
| Images (jpg/png/gif/webp) | Sends as vision content — AI sees and analyzes the image |
| PDF | Extracts text from up to 20 pages using PDF.js |
| Code files (js/py/html/css/etc.) | Reads as text with language label |
| Text/CSV/JSON/Markdown | Reads as plain text context |

> **Note:** Image understanding requires a vision-capable model.
> Pull one with: `ollama pull llava`

---

## ⚙️ Settings

Click **Settings** (⚙️) in the sidebar:

| Setting | Description | Default |
|---|---|---|
| Ollama URL | Where Ollama is running | `http://localhost:11434` |
| System Prompt | How Hazy behaves in Chat mode | Warm companion |
| Temperature | Creativity (0 = precise, 2 = very creative) | 0.7 |
| Max Tokens | Max response length — use 4096+ for website building | 4096 |
| Theme | Hazel / Dark / OLED | Auto-detected from system |

### Change default port
```bash
# Node.js
PORT=8081 node backend/server.js

# Python
PORT=8081 python backend/server.py

# Windows
set PORT=8081 && node backend/server.js
```

### Remote Ollama
```bash
OLLAMA_URL=http://192.168.1.100:11434 node backend/server.js
```

---

## ⌨️ Keyboard Shortcuts

| Key | Action |
|---|---|
| `Enter` | Send message |
| `Shift+Enter` | New line in input |
| `Ctrl/Cmd+K` | Start new chat |
| `Escape` | Close any open modal |
| `Ctrl+Enter` | Save edited message (when editing) |

---

## 🐛 Troubleshooting

**"Cannot connect to Ollama"**
```bash
ollama serve
# Verify in another terminal:
curl http://localhost:11434/api/tags
```

**"No models installed"**
```bash
ollama pull mistral
ollama list
```

**Port already in use**
```bash
PORT=8081 node backend/server.js
# Open http://localhost:8081
```

**GPU not being used (slow responses)**
```bash
ollama run mistral "hello"
# Look for "using GPU" in the Ollama logs
```

**Piper TTS won't load**
- Use Chrome 112+ or Edge 112+
- Open browser console (F12 → Console) and check for errors
- Try a hard refresh (Ctrl+Shift+R) to clear cached module state
- Switch to Browser Voice in TTS settings as a fallback

**Website builder shows "Could not extract files"**
- Switch to a larger model: `ollama pull llama3` or `ollama pull mistral`
- Increase Max Tokens to 4096+ in Settings ⚙️
- Click **Build Website** mode button before sending your prompt
- Make your description more specific and detailed

---

## 🏗️ Architecture

```
Browser (HTML/CSS/JS)
       │
       ├── Piper TTS     (WASM — lightweight neural TTS, runs in browser)
       ├── PDF.js        (PDF text extraction, in browser)
       ├── JSZip         (ZIP packaging, in browser)
       ├── Highlight.js  (Syntax highlighting, in browser)
       │
       │ HTTP + NDJSON streaming
       ▼
Hazy Server (Node.js or Python)
       │
       │ Proxies to Ollama, serves frontend
       ▼
Ollama (localhost:11434)
       │
       ▼
LLM Model (Mistral, Llama3, LLaVA, etc.)
       │
       ▼
GPU / CPU Inference
```

---

## 📄 License

MIT License — do whatever you want with it.

Built with ❤️ by **Dream On** using [Ollama](https://ollama.com), Piper TTS,
Node.js/FastAPI, and vanilla HTML/CSS/JS.
