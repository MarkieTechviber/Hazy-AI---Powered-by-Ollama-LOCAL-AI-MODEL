#!/usr/bin/env python3
"""Windows desktop controller for the Hazy server and Ollama."""

from __future__ import annotations

import json
import os
import queue
import shutil
import subprocess
import sys
import threading
import time
import urllib.error
import urllib.request
import webbrowser
from dataclasses import dataclass
from pathlib import Path
from typing import Callable, Iterable, Optional

try:
    import psutil
except ImportError as exc:
    raise SystemExit(
        "Missing psutil. Run start-controller.bat to install controller dependencies."
    ) from exc


ROOT_DIR = Path(__file__).resolve().parent
BACKEND_DIR = ROOT_DIR / "backend"
STATE_DIR = ROOT_DIR / "cache" / "hazy-control"
STATE_FILE = STATE_DIR / "processes.json"
LOG_FILE = STATE_DIR / "controller-services.log"
HAZY_HEALTH_URL = "http://localhost:8080/health"
HAZY_WEBSITE_URL = "http://localhost:8080"
OLLAMA_HEALTH_URL = "http://127.0.0.1:11434/api/tags"
KOKORO_HEALTH_URL = "http://127.0.0.1:8880/health"
STARTUP_TIMEOUT_SECONDS = 90.0

CREATE_NEW_PROCESS_GROUP = getattr(subprocess, "CREATE_NEW_PROCESS_GROUP", 0)
CREATE_NO_WINDOW = getattr(subprocess, "CREATE_NO_WINDOW", 0)


@dataclass(frozen=True)
class ServiceStatus:
    name: str
    running: bool
    pid: Optional[int] = None
    verified: bool = False
    managed: bool = False
    detail: str = ""


@dataclass(frozen=True)
class StackStatus:
    hazy: ServiceStatus
    ollama: ServiceStatus
    kokoro: ServiceStatus


class ControllerError(RuntimeError):
    """Raised when a requested lifecycle action cannot be performed safely."""


class HazyProcessManager:
    def __init__(
        self,
        root_dir: Path = ROOT_DIR,
        process_api=psutil,
        run_command: Callable = subprocess.run,
        popen_factory: Callable = subprocess.Popen,
        urlopen: Callable = urllib.request.urlopen,
        sleep: Callable[[float], None] = time.sleep,
        which: Callable[[str], Optional[str]] = shutil.which,
    ) -> None:
        self.root_dir = Path(root_dir).resolve()
        self.backend_dir = self.root_dir / "backend"
        self.state_dir = self.root_dir / "cache" / "hazy-control"
        self.state_file = self.state_dir / "processes.json"
        self.log_file = self.state_dir / "controller-services.log"
        self.process_api = process_api
        self.run_command = run_command
        self.popen_factory = popen_factory
        self.urlopen = urlopen
        self.sleep = sleep
        self.which = which

    def _ensure_state_dir(self) -> None:
        self.state_dir.mkdir(parents=True, exist_ok=True)

    def _read_state(self) -> dict:
        try:
            data = json.loads(self.state_file.read_text(encoding="utf-8"))
            return data if isinstance(data, dict) else {}
        except (FileNotFoundError, json.JSONDecodeError, OSError):
            return {}

    def _write_state(self, state: dict) -> None:
        self._ensure_state_dir()
        temporary = self.state_file.with_suffix(".tmp")
        temporary.write_text(json.dumps(state, indent=2), encoding="utf-8")
        temporary.replace(self.state_file)

    def _set_managed_pid(self, service: str, pid: Optional[int]) -> None:
        state = self._read_state()
        if pid is None:
            state.pop(service, None)
        else:
            state[service] = {"pid": int(pid), "started_at": time.time()}
        self._write_state(state)

    def _managed_pid(self, service: str) -> Optional[int]:
        value = self._read_state().get(service, {}).get("pid")
        try:
            return int(value)
        except (TypeError, ValueError):
            return None

    def _listener_pid(self, port: int) -> Optional[int]:
        try:
            connections = self.process_api.net_connections(kind="tcp")
        except (self.process_api.AccessDenied, OSError):
            return None
        for connection in connections:
            address = getattr(connection, "laddr", None)
            status = getattr(connection, "status", "")
            if address and getattr(address, "port", None) == port and status == "LISTEN":
                return getattr(connection, "pid", None)
        return None

    @staticmethod
    def _normalized_command(process) -> str:
        try:
            return " ".join(process.cmdline()).lower().replace("\\", "/")
        except (psutil.AccessDenied, psutil.NoSuchProcess, OSError):
            return ""

    def _cwd_matches_backend(self, process) -> bool:
        try:
            return Path(process.cwd()).resolve() == self.backend_dir.resolve()
        except (psutil.AccessDenied, psutil.NoSuchProcess, OSError):
            return False

    def _is_verified_hazy(self, process) -> bool:
        command = self._normalized_command(process)
        script_match = "server.js" in command or "server.py" in command
        workspace_match = self.root_dir.as_posix().lower() in command
        return script_match and (workspace_match or self._cwd_matches_backend(process))

    def _is_verified_ollama(self, process) -> bool:
        command = self._normalized_command(process)
        try:
            name = process.name().lower()
        except (psutil.AccessDenied, psutil.NoSuchProcess, OSError):
            name = ""
        return "ollama" in name or "ollama serve" in command

    def _is_verified_kokoro(self, process) -> bool:
        command = self._normalized_command(process)
        return "kokoro_server.py" in command

    def _service_status(
        self,
        name: str,
        port: int,
        verifier: Callable,
    ) -> ServiceStatus:
        pid = self._listener_pid(port)
        if not pid:
            return ServiceStatus(name=name, running=False, detail=f"Port {port} is free")
        try:
            process = self.process_api.Process(pid)
            verified = bool(verifier(process))
        except (self.process_api.NoSuchProcess, self.process_api.AccessDenied, OSError):
            verified = False
        managed = pid == self._managed_pid(name)
        if not verified:
            detail = f"Unknown process owns port {port}; it will not be stopped"
        elif managed:
            detail = f"Running and managed by this controller (PID {pid})"
        else:
            detail = f"Running outside this controller (PID {pid})"
        return ServiceStatus(
            name=name,
            running=True,
            pid=pid,
            verified=verified,
            managed=managed,
            detail=detail,
        )

    def status(self) -> StackStatus:
        return StackStatus(
            hazy=self._service_status("hazy", 8080, self._is_verified_hazy),
            ollama=self._service_status("ollama", 11434, self._is_verified_ollama),
            kokoro=self._service_status("kokoro", 8880, self._is_verified_kokoro),
        )

    def _require_stoppable(
        self,
        service: ServiceStatus,
        allow_adopted: bool,
    ) -> None:
        if not service.running:
            return
        if not service.verified:
            raise ControllerError(service.detail)
        if not service.managed and not allow_adopted:
            raise ControllerError(
                f"{service.name.title()} is verified but was not started by this controller."
            )

    def _terminate_tree(self, pid: int, timeout: float = 8.0) -> None:
        try:
            parent = self.process_api.Process(pid)
        except self.process_api.NoSuchProcess:
            return
        processes = parent.children(recursive=True)
        processes.append(parent)
        for process in reversed(processes):
            try:
                process.terminate()
            except (self.process_api.NoSuchProcess, self.process_api.AccessDenied):
                pass
        _, alive = self.process_api.wait_procs(processes, timeout=timeout)
        for process in alive:
            try:
                process.kill()
            except (self.process_api.NoSuchProcess, self.process_api.AccessDenied):
                pass
        if alive:
            self.process_api.wait_procs(alive, timeout=3)

    def stop_hazy(self, allow_adopted: bool = False) -> None:
        service = self.status().hazy
        self._require_stoppable(service, allow_adopted)
        if service.pid:
            self._terminate_tree(service.pid)
        self._set_managed_pid("hazy", None)

    def stop_ollama(self, allow_adopted: bool = False) -> None:
        service = self.status().ollama
        self._require_stoppable(service, allow_adopted)
        if service.pid:
            self._terminate_tree(service.pid)
        self._set_managed_pid("ollama", None)

    def stop_kokoro(self, allow_adopted: bool = False) -> None:
        service = self.status().kokoro
        self._require_stoppable(service, allow_adopted)
        if service.pid:
            self._terminate_tree(service.pid)
        self._set_managed_pid("kokoro", None)

    def stop_all(self, allow_adopted: bool = False) -> None:
        current = self.status()
        self._require_stoppable(current.hazy, allow_adopted)
        self._require_stoppable(current.ollama, allow_adopted)
        self._require_stoppable(current.kokoro, allow_adopted)
        if current.hazy.pid:
            self._terminate_tree(current.hazy.pid)
        if current.ollama.pid:
            self._terminate_tree(current.ollama.pid)
        if current.kokoro.pid:
            self._terminate_tree(current.kokoro.pid)
        self._set_managed_pid("hazy", None)
        self._set_managed_pid("ollama", None)
        self._set_managed_pid("kokoro", None)

    def _spawn_hidden(self, command: Iterable[str], cwd: Path) -> int:
        self._ensure_state_dir()
        log_handle = self.log_file.open("ab", buffering=0)
        try:
            process = self.popen_factory(
                list(command),
                cwd=str(cwd),
                stdin=subprocess.DEVNULL,
                stdout=log_handle,
                stderr=subprocess.STDOUT,
                creationflags=CREATE_NEW_PROCESS_GROUP | CREATE_NO_WINDOW,
                close_fds=True,
            )
        finally:
            log_handle.close()
        return int(process.pid)

    def _wait_for_url(self, url: str, timeout: float = 20.0) -> bool:
        deadline = time.monotonic() + timeout
        while time.monotonic() < deadline:
            try:
                response = self.urlopen(url, timeout=2)
                status = getattr(response, "status", 200)
                if 200 <= status < 500:
                    return True
            except (urllib.error.URLError, TimeoutError, OSError):
                pass
            self.sleep(2.5)
        return False

    def start_ollama(self) -> ServiceStatus:
        current = self.status().ollama
        if current.running:
            if not current.verified:
                raise ControllerError(current.detail)
            return current
        executable = self.which("ollama")
        if not executable:
            raise ControllerError("Ollama was not found on PATH.")
        pid = self._spawn_hidden([executable, "serve"], self.root_dir)
        self._set_managed_pid("ollama", pid)
        if not self._wait_for_url(OLLAMA_HEALTH_URL, timeout=STARTUP_TIMEOUT_SECONDS):
            raise ControllerError(f"Ollama did not become ready within {int(STARTUP_TIMEOUT_SECONDS)} seconds.")
        return self.status().ollama

    def _hazy_command(self) -> list[str]:
        # Always run Python backend (server.py) instead of Node.js backend (server.js)
        # Check if project backend virtual environment exists first
        backend_venv_py = self.root_dir / ".venv-backend" / "Scripts" / "python.exe"
        if backend_venv_py.exists():
            return [str(backend_venv_py), "server.py"]

        # Prefer the interpreter that is running the controller, falling back to system Pythons
        candidates = [sys.executable, self.which("python"), self.which("python3")]
        for python in candidates:
            if python:
                return [python, "server.py"]
        raise ControllerError("Python is not available for Hazy.")

    def start_hazy(self) -> ServiceStatus:
        current = self.status().hazy
        if current.running:
            if not current.verified:
                raise ControllerError(current.detail)
            return current
        # Ensure Ollama is ready before starting Hazy
        if not self._wait_for_url(OLLAMA_HEALTH_URL, timeout=5.0):
            self.start_ollama()
        command = self._hazy_command()
        pid = self._spawn_hidden(command, self.backend_dir)
        self._set_managed_pid("hazy", pid)
        if not self._wait_for_url(HAZY_HEALTH_URL, timeout=STARTUP_TIMEOUT_SECONDS):
            raise ControllerError(f"Hazy did not become ready on port 8080 within {int(STARTUP_TIMEOUT_SECONDS)} seconds.")
        return self.status().hazy

    def start_kokoro(self) -> ServiceStatus:
        current = self.status().kokoro
        if current.running:
            if not current.verified:
                raise ControllerError(current.detail)
            return current
        
        # Use the kokoro venv if it exists
        kokoro_venv_py = self.root_dir / ".venv-kokoro" / "Scripts" / "python.exe"
        if kokoro_venv_py.exists():
            python = str(kokoro_venv_py)
        else:
            # Smart search for a compatible python version (3.10 to 3.13)
            # This avoids picking up experimental versions like 3.14 that lack AI library support.
            python = None
            for version in ["3.12", "3.11", "3.13", "3.10"]:
                found = self.which(f"python{version}") or self.which(f"py -{version}")
                if found:
                    python = found
                    break
            
            if not python:
                python = sys.executable
            
        pid = self._spawn_hidden([python, "kokoro_server.py"], self.root_dir)
        self._set_managed_pid("kokoro", pid)
        if not self._wait_for_url(KOKORO_HEALTH_URL, timeout=STARTUP_TIMEOUT_SECONDS):
            raise ControllerError(f"Kokoro TTS did not become ready on port 8880 within {int(STARTUP_TIMEOUT_SECONDS)} seconds.")
        return self.status().kokoro

    def ensure_all_ready(self) -> StackStatus:
        self.start_ollama()
        if not self._wait_for_url(OLLAMA_HEALTH_URL, timeout=STARTUP_TIMEOUT_SECONDS):
            raise ControllerError("Ollama is running but its API is not ready.")
        self.start_hazy()
        if not self._wait_for_url(HAZY_HEALTH_URL, timeout=STARTUP_TIMEOUT_SECONDS):
            raise ControllerError("Hazy is running but its website is not ready.")
        self.start_kokoro()
        if not self._wait_for_url(KOKORO_HEALTH_URL, timeout=STARTUP_TIMEOUT_SECONDS):
            raise ControllerError("Kokoro TTS is running but its API is not ready.")
        return self.status()

    def restart_all(self, allow_adopted: bool = False) -> StackStatus:
        self.stop_all(allow_adopted=allow_adopted)
        return self.ensure_all_ready()

    def computer_command(self, action: str) -> list[str]:
        if action == "shutdown":
            return ["shutdown", "/s", "/f", "/t", "10"]
        if action == "restart":
            return ["shutdown", "/r", "/f", "/t", "10"]
        if action == "cancel":
            return ["shutdown", "/a"]
        raise ValueError(f"Unknown computer action: {action}")

    def schedule_computer_action(self, action: str) -> None:
        self.run_command(
            self.computer_command(action),
            check=True,
            capture_output=True,
            text=True,
            creationflags=CREATE_NO_WINDOW,
        )

    def cancel_computer_action(self) -> None:
        self.schedule_computer_action("cancel")


def launch_gui(auto_start_and_open: bool = False) -> None:
    import tkinter as tk
    from tkinter import messagebox, scrolledtext, ttk

    try:
        import pystray
        from PIL import Image, ImageDraw
    except ImportError as exc:
        raise SystemExit(
            "Missing tray dependencies. Run start-controller.bat."
        ) from exc

    manager = HazyProcessManager()
    root = tk.Tk()
    root.title("Hazy Desktop Controller")
    root.geometry("560x520")
    root.minsize(520, 480)
    root.configure(bg="#111318")
    root.attributes("-topmost", False)

    events: queue.Queue = queue.Queue()
    busy = tk.BooleanVar(value=False)
    hazy_status = tk.StringVar(value="Checking...")
    ollama_status = tk.StringVar(value="Checking...")
    kokoro_status = tk.StringVar(value="Checking...")
    countdown = tk.StringVar(value="")
    countdown_job = {"id": None}

    style = ttk.Style(root)
    style.theme_use("clam")
    style.configure("TFrame", background="#111318")
    style.configure("Title.TLabel", background="#111318", foreground="#f5f1e8", font=("Segoe UI", 18, "bold"))
    style.configure("Status.TLabel", background="#171a21", foreground="#ddd7ca", font=("Segoe UI", 10))
    style.configure("Action.TButton", font=("Segoe UI", 10, "bold"), padding=10)
    style.configure("Danger.TButton", font=("Segoe UI", 10, "bold"), padding=10, foreground="#ffffff", background="#8f2d2d")
    style.map("Danger.TButton", background=[("active", "#aa3838")])

    outer = ttk.Frame(root, padding=18)
    outer.pack(fill="both", expand=True)
    ttk.Label(outer, text="Hazy Desktop Controller", style="Title.TLabel").pack(anchor="w")
    ttk.Label(
        outer,
        text="Control the local Hazy server, Ollama, or this Windows PC.",
        background="#111318",
        foreground="#aaa59c",
    ).pack(anchor="w", pady=(2, 14))

    status_frame = tk.Frame(outer, bg="#171a21", highlightbackground="#2b303a", highlightthickness=1)
    status_frame.pack(fill="x", pady=(0, 14))
    tk.Label(status_frame, textvariable=hazy_status, bg="#171a21", fg="#ddd7ca", anchor="w", padx=12, pady=8).pack(fill="x")
    tk.Label(status_frame, textvariable=ollama_status, bg="#171a21", fg="#ddd7ca", anchor="w", padx=12, pady=8).pack(fill="x")
    tk.Label(status_frame, textvariable=kokoro_status, bg="#171a21", fg="#ddd7ca", anchor="w", padx=12, pady=8).pack(fill="x")

    buttons = ttk.Frame(outer)
    buttons.pack(fill="x")
    for column in range(2):
        buttons.columnconfigure(column, weight=1)

    log_box = scrolledtext.ScrolledText(
        outer,
        height=10,
        state="disabled",
        bg="#0c0e12",
        fg="#d6d1c8",
        insertbackground="#ffffff",
        relief="flat",
        font=("Consolas", 9),
    )
    log_box.pack(fill="both", expand=True, pady=(14, 0))

    countdown_label = tk.Label(
        outer,
        textvariable=countdown,
        bg="#111318",
        fg="#ffb65b",
        font=("Segoe UI", 10, "bold"),
    )
    countdown_label.pack(fill="x", pady=(8, 0))

    cancel_button = ttk.Button(outer, text="Cancel PC Action", style="Action.TButton")

    def log(message: str) -> None:
        timestamp = time.strftime("%H:%M:%S")
        log_box.configure(state="normal")
        log_box.insert("end", f"[{timestamp}] {message}\n")
        log_box.see("end")
        log_box.configure(state="disabled")

    def format_service(service: ServiceStatus) -> str:
        marker = "RUNNING" if service.running and service.verified else "STOPPED"
        if service.running and not service.verified:
            marker = "BLOCKED"
        owner = "managed" if service.managed else "external"
        suffix = f", {owner}" if service.running and service.verified else ""
        return f"{service.name.title()}: {marker}{suffix} - {service.detail}"

    def apply_status(status: StackStatus) -> None:
        hazy_status.set(format_service(status.hazy))
        ollama_status.set(format_service(status.ollama))
        kokoro_status.set(format_service(status.kokoro))

    def pump_events() -> None:
        try:
            while True:
                kind, payload = events.get_nowait()
                if kind == "status":
                    apply_status(payload)
                elif kind == "log":
                    log(payload)
                elif kind == "error":
                    log(f"ERROR: {payload}")
                    messagebox.showerror("Hazy Controller", str(payload), parent=root)
                elif kind == "done":
                    busy.set(False)
        except queue.Empty:
            pass
        root.after(100, pump_events)

    def run_background(label: str, operation: Callable[[], object]) -> None:
        if busy.get():
            messagebox.showinfo("Hazy Controller", "Another action is still running.", parent=root)
            return
        busy.set(True)
        log(label)

        def worker() -> None:
            try:
                result = operation()
                if isinstance(result, StackStatus):
                    events.put(("status", result))
                else:
                    events.put(("status", manager.status()))
                events.put(("log", f"{label} completed."))
            except Exception as exc:
                events.put(("error", exc))
                events.put(("status", manager.status()))
            finally:
                events.put(("done", None))

        threading.Thread(target=worker, daemon=True).start()

    def refresh_status() -> None:
        run_background("Refreshing service status", manager.status)

    def adoption_needed() -> bool:
        status = manager.status()
        external = [
            service.name.title()
            for service in (status.hazy, status.ollama, status.kokoro)
            if service.running and service.verified and not service.managed
        ]
        if not external:
            return True
        return messagebox.askyesno(
            "Take control of existing services?",
            "The following verified services were not started by this controller:\n\n"
            + "\n".join(external)
            + "\n\nAllow the controller to stop them for this action?",
            icon="warning",
            parent=root,
        )

    def shutdown_services() -> None:
        if not adoption_needed():
            return
        run_background(
            "Shutting down Hazy and Ollama",
            lambda: (manager.stop_all(allow_adopted=True), manager.status())[1],
        )

    def restart_services() -> None:
        if not adoption_needed():
            return

        def restart_and_open() -> StackStatus:
            status = manager.restart_all(allow_adopted=True)
            webbrowser.open(HAZY_WEBSITE_URL, new=2)
            return status

        run_background(
            "Restarting Hazy and Ollama",
            restart_and_open,
        )

    def cancel_countdown() -> None:
        try:
            manager.cancel_computer_action()
            log("Windows shutdown/restart was cancelled.")
        except Exception as exc:
            messagebox.showerror("Cancel failed", str(exc), parent=root)
        if countdown_job["id"]:
            root.after_cancel(countdown_job["id"])
            countdown_job["id"] = None
        countdown.set("")
        cancel_button.pack_forget()

    cancel_button.configure(command=cancel_countdown)

    def begin_countdown(action: str) -> None:
        label = "shut down" if action == "shutdown" else "restart"
        confirmed = messagebox.askyesno(
            f"Force {label} this PC?",
            f"Windows will forcibly {label} in 10 seconds.\n\n"
            "Unsaved work in every open application may be lost.\n\n"
            "Continue?",
            icon="warning",
            parent=root,
        )
        if not confirmed:
            return
        try:
            manager.schedule_computer_action(action)
        except Exception as exc:
            messagebox.showerror("Windows action failed", str(exc), parent=root)
            return
        cancel_button.pack(fill="x", pady=(8, 0))
        deadline = time.monotonic() + 10

        def tick() -> None:
            remaining = max(0, int(deadline - time.monotonic() + 0.99))
            countdown.set(f"Windows will {label} in {remaining} second(s).")
            if remaining > 0:
                countdown_job["id"] = root.after(250, tick)
            else:
                countdown_job["id"] = None
                cancel_button.pack_forget()

        log(f"Windows {action} scheduled with a 10-second cancellation window.")
        tick()

    shutdown_button = ttk.Button(
        buttons,
        text="Shutdown Hazy + Ollama",
        style="Action.TButton",
        command=shutdown_services,
    )
    shutdown_button.grid(row=0, column=0, sticky="ew", padx=(0, 6), pady=(0, 8))
    restart_button = ttk.Button(
        buttons,
        text="Restart Hazy + Ollama",
        style="Action.TButton",
        command=restart_services,
    )
    restart_button.grid(row=0, column=1, sticky="ew", padx=(6, 0), pady=(0, 8))
    poweroff_button = ttk.Button(
        buttons,
        text="Force Shutdown PC",
        style="Danger.TButton",
        command=lambda: begin_countdown("shutdown"),
    )
    poweroff_button.grid(row=1, column=0, sticky="ew", padx=(0, 6))
    reboot_button = ttk.Button(
        buttons,
        text="Restart PC",
        style="Danger.TButton",
        command=lambda: begin_countdown("restart"),
    )
    reboot_button.grid(row=1, column=1, sticky="ew", padx=(6, 0))

    def create_tray_image():
        image = Image.new("RGBA", (64, 64), (20, 23, 29, 255))
        draw = ImageDraw.Draw(image)
        draw.rounded_rectangle((7, 8, 49, 34), radius=10, fill=(55, 118, 171, 255))
        draw.rounded_rectangle((15, 30, 57, 56), radius=10, fill=(255, 211, 67, 255))
        draw.ellipse((35, 14, 40, 19), fill=(255, 255, 255, 255))
        draw.ellipse((24, 45, 29, 50), fill=(55, 83, 110, 255))
        return image

    def show_window(_icon=None, _item=None) -> None:
        root.after(0, lambda: (root.deiconify(), root.lift(), root.focus_force()))

    def tray_refresh(_icon=None, _item=None) -> None:
        root.after(0, refresh_status)

    def exit_controller(_icon=None, _item=None) -> None:
        def close() -> None:
            tray.stop()
            root.destroy()
        root.after(0, close)

    tray = pystray.Icon(
        "hazy-controller",
        create_tray_image(),
        "Hazy Desktop Controller",
        menu=pystray.Menu(
            pystray.MenuItem("Open Controller", show_window, default=True),
            pystray.MenuItem("Refresh Status", tray_refresh),
            pystray.MenuItem("Exit Controller", exit_controller),
        ),
    )

    def hide_to_tray() -> None:
        root.withdraw()
        log("Controller hidden in the Windows notification area. Services remain running.")

    root.protocol("WM_DELETE_WINDOW", hide_to_tray)
    tray.run_detached()
    pump_events()
    if auto_start_and_open:
        def ensure_and_open() -> StackStatus:
            status = manager.ensure_all_ready()
            webbrowser.open(HAZY_WEBSITE_URL, new=2)
            return status

        root.after(
            150,
            lambda: run_background(
                "Starting Ollama and Hazy, then opening the website",
                ensure_and_open,
            ),
        )
    else:
        refresh_status()
    root.mainloop()


if __name__ == "__main__":
    if os.name != "nt":
        raise SystemExit("Hazy Desktop Controller currently supports Windows only.")
    launch_gui(auto_start_and_open="--start-and-open" in sys.argv[1:])
