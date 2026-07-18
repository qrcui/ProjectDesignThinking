from __future__ import annotations

import importlib.util
import unittest
from pathlib import Path


SERVER_PATH = Path(__file__).resolve().parents[1] / "serve_dist.py"
SPEC = importlib.util.spec_from_file_location("visionguard_serve_dist", SERVER_PATH)
if SPEC is None or SPEC.loader is None:  # pragma: no cover - import setup guard
    raise RuntimeError(f"Unable to import {SERVER_PATH}")
serve_dist = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(serve_dist)


class BrowserSelectionTests(unittest.TestCase):
    def test_windows_candidates_include_explicit_and_standard_locations(self) -> None:
        candidates = serve_dist.chrome_executable_candidates(
            "win32",
            {
                "CHROME_PATH": r"D:\Portable\chrome.exe",
                "PROGRAMFILES": r"C:\Program Files",
                "LOCALAPPDATA": r"C:\Users\Ada\AppData\Local",
            },
            Path(r"C:\Users\Ada"),
        )
        self.assertEqual(candidates[0], Path(r"D:\Portable\chrome.exe"))
        self.assertIn(
            Path(r"C:\Program Files") / "Google" / "Chrome" / "Application" / "chrome.exe",
            candidates,
        )
        self.assertIn(
            Path(r"C:\Users\Ada\AppData\Local")
            / "Google"
            / "Chrome"
            / "Application"
            / "chrome.exe",
            candidates,
        )

    def test_macos_candidates_cover_system_and_user_applications(self) -> None:
        home = Path("/Users/ada")
        candidates = serve_dist.chrome_executable_candidates("darwin", {}, home)
        self.assertEqual(
            candidates,
            (
                Path("/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"),
                home / "Applications" / "Google Chrome.app" / "Contents" / "MacOS" / "Google Chrome",
            ),
        )

    def test_duplicate_windows_install_roots_are_removed(self) -> None:
        candidates = serve_dist.chrome_executable_candidates(
            "win32",
            {"PROGRAMFILES": r"C:\Program Files", "PROGRAMW6432": r"C:\PROGRAM FILES"},
            Path(r"C:\Users\Ada"),
        )
        self.assertEqual(len(candidates), 1)

    def test_find_chrome_checks_known_paths_before_path_commands(self) -> None:
        known = Path("/Applications/Google Chrome.app/Contents/MacOS/Google Chrome")
        commands_checked: list[str] = []
        found = serve_dist.find_chrome_executable(
            platform="darwin",
            environ={},
            home=Path("/Users/ada"),
            is_file=lambda path: path == known,
            which=lambda command: commands_checked.append(command) or "/usr/bin/fallback",
        )
        self.assertEqual(found, str(known))
        self.assertEqual(commands_checked, [])

    def test_find_chrome_uses_path_and_then_reports_missing(self) -> None:
        found = serve_dist.find_chrome_executable(
            platform="linux",
            environ={},
            home=Path("/home/ada"),
            is_file=lambda _path: False,
            which=lambda command: "/usr/bin/google-chrome" if command == "google-chrome" else None,
        )
        self.assertEqual(found, "/usr/bin/google-chrome")

        missing = serve_dist.find_chrome_executable(
            platform="linux",
            environ={},
            home=Path("/home/ada"),
            is_file=lambda _path: False,
            which=lambda _command: None,
        )
        self.assertIsNone(missing)

    def test_browser_plan_prefers_chrome_and_falls_back_to_default(self) -> None:
        self.assertEqual(
            serve_dist.choose_browser_target("chrome", "/Applications/Google Chrome"),
            ("chrome", "/Applications/Google Chrome"),
        )
        self.assertEqual(serve_dist.choose_browser_target("chrome", None), ("default", None))
        self.assertEqual(
            serve_dist.choose_browser_target("default", "/Applications/Google Chrome"),
            ("default", None),
        )

    def test_cli_defaults_to_chrome_first_and_preserves_no_browser(self) -> None:
        defaults = serve_dist.parse_args([])
        self.assertEqual(defaults.browser, "chrome")
        self.assertFalse(defaults.no_browser)

        no_browser = serve_dist.parse_args(["--no-browser"])
        self.assertTrue(no_browser.no_browser)

        system_browser = serve_dist.parse_args(["--browser", "default"])
        self.assertEqual(system_browser.browser, "default")


if __name__ == "__main__":
    unittest.main()
