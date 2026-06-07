from __future__ import annotations

import json
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import Mock

from hazy_controller import (
    ControllerError,
    HazyProcessManager,
    ServiceStatus,
    StackStatus,
)


class FakeNoSuchProcess(Exception):
    pass


class FakeAccessDenied(Exception):
    pass


class FakeProcess:
    def __init__(self, pid, name, command, cwd):
        self.pid = pid
        self._name = name
        self._command = command
        self._cwd = cwd
        self.terminated = False
        self.killed = False

    def name(self):
        return self._name

    def cmdline(self):
        return list(self._command)

    def cwd(self):
        return str(self._cwd)

    def children(self, recursive=True):
        return []

    def terminate(self):
        self.terminated = True

    def kill(self):
        self.killed = True


class FakeProcessApi:
    NoSuchProcess = FakeNoSuchProcess
    AccessDenied = FakeAccessDenied

    def __init__(self, connections=None, processes=None):
        self.connections = connections or []
        self.processes = processes or {}

    def net_connections(self, kind="tcp"):
        return self.connections

    def Process(self, pid):
        if pid not in self.processes:
            raise self.NoSuchProcess(pid)
        return self.processes[pid]

    @staticmethod
    def wait_procs(processes, timeout):
        return processes, []


def listener(port, pid):
    return SimpleNamespace(
        laddr=SimpleNamespace(port=port),
        status="LISTEN",
        pid=pid,
    )


class HazyControllerTests(unittest.TestCase):
    def make_manager(self, process_api=None, **kwargs):
        temporary = tempfile.TemporaryDirectory()
        self.addCleanup(temporary.cleanup)
        root = Path(temporary.name)
        (root / "backend").mkdir()
        return HazyProcessManager(
            root_dir=root,
            process_api=process_api or FakeProcessApi(),
            **kwargs,
        )

    def test_process_discovery_verifies_workspace_hazy_and_ollama(self):
        manager = self.make_manager()
        manager.process_api = FakeProcessApi(
            connections=[listener(8080, 10), listener(11434, 20)],
            processes={
                10: FakeProcess(10, "node.exe", ["node", "server.js"], manager.backend_dir),
                20: FakeProcess(20, "ollama.exe", ["ollama", "serve"], manager.root_dir),
            },
        )

        status = manager.status()

        self.assertTrue(status.hazy.verified)
        self.assertTrue(status.ollama.verified)
        self.assertFalse(status.hazy.managed)
        self.assertFalse(status.ollama.managed)

    def test_pid_state_marks_only_controller_owned_process_as_managed(self):
        manager = self.make_manager()
        manager.process_api = FakeProcessApi(
            connections=[listener(8080, 10)],
            processes={
                10: FakeProcess(10, "node.exe", ["node", "server.js"], manager.backend_dir),
            },
        )
        manager._set_managed_pid("hazy", 10)

        self.assertTrue(manager.status().hazy.managed)
        state = json.loads(manager.state_file.read_text(encoding="utf-8"))
        self.assertEqual(state["hazy"]["pid"], 10)

    def test_unknown_port_owner_is_never_terminated(self):
        manager = self.make_manager()
        unknown = FakeProcess(55, "other.exe", ["other.exe"], manager.root_dir)
        manager.process_api = FakeProcessApi(
            connections=[listener(8080, 55)],
            processes={55: unknown},
        )

        with self.assertRaises(ControllerError):
            manager.stop_hazy(allow_adopted=True)

        self.assertFalse(unknown.terminated)
        self.assertFalse(unknown.killed)

    def test_external_verified_service_requires_explicit_adoption(self):
        manager = self.make_manager()
        manager.status = Mock(
            return_value=StackStatus(
                hazy=ServiceStatus(
                    "hazy", True, pid=10, verified=True, managed=False
                ),
                ollama=ServiceStatus("ollama", False),
            )
        )
        manager._terminate_tree = Mock()

        with self.assertRaises(ControllerError):
            manager.stop_all(allow_adopted=False)

        manager._terminate_tree.assert_not_called()

    def test_restart_starts_missing_services_in_required_order(self):
        manager = self.make_manager()
        calls = []
        manager.stop_all = Mock(side_effect=lambda allow_adopted: calls.append("stop"))
        manager.ensure_all_ready = Mock(side_effect=lambda: calls.append("ready") or StackStatus(
            hazy=ServiceStatus("hazy", True, verified=True),
            ollama=ServiceStatus("ollama", True, verified=True),
        ))
        manager.status = Mock(
            return_value=StackStatus(
                hazy=ServiceStatus("hazy", True, verified=True),
                ollama=ServiceStatus("ollama", True, verified=True),
            )
        )

        manager.restart_all(allow_adopted=True)

        self.assertEqual(calls, ["stop", "ready"])

    def test_ensure_all_ready_starts_ollama_before_hazy_and_checks_both_urls(self):
        manager = self.make_manager()
        calls = []
        manager.start_ollama = Mock(side_effect=lambda: calls.append("start_ollama"))
        manager.start_hazy = Mock(side_effect=lambda: calls.append("start_hazy"))
        manager._wait_for_url = Mock(side_effect=lambda url, timeout: calls.append(url) or True)
        expected = StackStatus(
            hazy=ServiceStatus("hazy", True, verified=True),
            ollama=ServiceStatus("ollama", True, verified=True),
        )
        manager.status = Mock(return_value=expected)

        result = manager.ensure_all_ready()

        self.assertEqual(result, expected)
        self.assertEqual(calls[0], "start_ollama")
        self.assertIn("11434", calls[1])
        self.assertEqual(calls[2], "start_hazy")
        self.assertIn("8080", calls[3])

    def test_health_check_retries_until_service_is_ready(self):
        urlopen = Mock(
            side_effect=[
                OSError("not ready"),
                OSError("still not ready"),
                SimpleNamespace(status=200),
            ]
        )
        manager = self.make_manager(urlopen=urlopen, sleep=lambda _seconds: None)

        self.assertTrue(manager._wait_for_url("http://example.test", timeout=1))
        self.assertEqual(urlopen.call_count, 3)

    def test_shutdown_commands_are_exact_and_mockable(self):
        run_command = Mock()
        manager = self.make_manager(run_command=run_command)

        manager.schedule_computer_action("shutdown")
        manager.schedule_computer_action("restart")
        manager.cancel_computer_action()

        commands = [call.args[0] for call in run_command.call_args_list]
        self.assertEqual(commands[0], ["shutdown", "/s", "/f", "/t", "10"])
        self.assertEqual(commands[1], ["shutdown", "/r", "/f", "/t", "10"])
        self.assertEqual(commands[2], ["shutdown", "/a"])


if __name__ == "__main__":
    unittest.main()
