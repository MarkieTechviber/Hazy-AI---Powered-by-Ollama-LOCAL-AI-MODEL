#!/usr/bin/env bash
set -e

echo ""
echo "  ╔══════════════════════════════════════╗"
echo "  ║         Hazy AI Chatbot          ║"
echo "  ╚══════════════════════════════════════╝"
echo ""

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_DIR="$SCRIPT_DIR/backend"
PORT="${PORT:-8080}"

# ─── Check Ollama ───
echo "[1/3] Checking Ollama..."
if ! curl -s "http://localhost:11434/api/tags" > /dev/null 2>&1; then
    echo "  ⚠  Ollama not running. Starting it..."
    if command -v ollama &> /dev/null; then
        ollama serve &
        OLLAMA_PID=$!
        sleep 2
        echo "  ✓  Ollama started (PID $OLLAMA_PID)"
    else
        echo "  ❌  Ollama not installed."
        echo "      Install from: https://ollama.com"
        echo "      Then pull a model: ollama pull mistral"
        echo ""
        echo "  ℹ  The app will still open but won't work until Ollama is running."
    fi
else
    echo "  ✓  Ollama is running"
fi

# ─── Start server ───
echo "[2/3] Starting server on port $PORT..."

cd "$BACKEND_DIR"

if command -v node &> /dev/null; then
    echo "  ✓  Using Node.js backend"
    node server.js &
    SERVER_PID=$!
elif command -v python3 &> /dev/null; then
    echo "  ✓  Using Python backend"
    pip3 install -r requirements.txt -q 2>/dev/null || pip install -r requirements.txt -q
    python3 server.py &
    SERVER_PID=$!
elif command -v python &> /dev/null; then
    echo "  ✓  Using Python backend"
    pip install -r requirements.txt -q
    python server.py &
    SERVER_PID=$!
else
    echo "  ❌  Neither Node.js nor Python found."
    echo "      Install Node.js: https://nodejs.org"
    echo "      Or Python: https://python.org"
    exit 1
fi

sleep 1

# ─── Open browser ───
echo "[3/3] Opening browser..."
URL="http://localhost:$PORT"

if command -v xdg-open &> /dev/null; then
    xdg-open "$URL" 2>/dev/null &
elif command -v open &> /dev/null; then
    open "$URL"
fi

echo ""
echo "  ✅  Hazy running at $URL"
echo "  Press Ctrl+C to stop."
echo ""

# ─── Wait & cleanup ───
trap "echo ''; echo '  Shutting down...'; kill $SERVER_PID 2>/dev/null; kill $OLLAMA_PID 2>/dev/null; exit 0" INT TERM
wait $SERVER_PID
