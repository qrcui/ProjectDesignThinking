#!/usr/bin/env python3
"""Serve the prebuilt VisionGuard AI app on localhost using Python stdlib only."""

from __future__ import annotations

import argparse
import mimetypes
import os
import shutil
import subprocess
import sys
import threading
import webbrowser
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Callable, Mapping, Sequence


BrowserMode = str


def parse_args(argv: Sequence[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Serve VisionGuard AI's prebuilt dist directory.")
    parser.add_argument("--host", default="127.0.0.1", help="Bind host (default: 127.0.0.1)")
    parser.add_argument("--port", type=int, default=4173, help="Bind port (default: 4173)")
    browser_group = parser.add_mutually_exclusive_group()
    browser_group.add_argument(
        "--browser",
        choices=("chrome", "default"),
        default="chrome",
        help=(
            "Browser opening strategy: 'chrome' prefers Google Chrome and falls back "
            "to the system default (the default); 'default' opens the system browser directly"
        ),
    )
    browser_group.add_argument(
        "--no-browser",
        action="store_true",
        help="Do not open a browser automatically",
    )
    return parser.parse_args(argv)


def chrome_executable_candidates(
    platform: str,
    environ: Mapping[str, str],
    home: Path,
) -> tuple[Path, ...]:
    """Return likely Chrome executable paths without touching the filesystem."""
    candidates: list[Path] = []
    explicit_path = environ.get("CHROME_PATH")
    if explicit_path:
        candidates.append(Path(explicit_path))

    if platform.startswith("win"):
        for variable in ("PROGRAMFILES", "PROGRAMFILES(X86)", "PROGRAMW6432", "LOCALAPPDATA"):
            base = environ.get(variable)
            if base:
                candidates.append(Path(base) / "Google" / "Chrome" / "Application" / "chrome.exe")
    elif platform == "darwin":
        candidates.extend(
            (
                Path("/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"),
                home / "Applications" / "Google Chrome.app" / "Contents" / "MacOS" / "Google Chrome",
            )
        )

    # Keep discovery deterministic and avoid trying the same Windows path twice
    # when PROGRAMFILES and PROGRAMW6432 point to the same directory.
    unique: list[Path] = []
    seen: set[str] = set()
    for candidate in candidates:
        key = str(candidate).casefold() if platform.startswith("win") else str(candidate)
        if key not in seen:
            seen.add(key)
            unique.append(candidate)
    return tuple(unique)


def chrome_command_names(platform: str) -> tuple[str, ...]:
    """Return PATH command names in preferred order for the current platform."""
    if platform.startswith("win"):
        return ("chrome.exe", "chrome")
    if platform == "darwin":
        return ("google-chrome", "chrome")
    return ("google-chrome", "google-chrome-stable", "chrome")


def choose_browser_target(
    browser_mode: BrowserMode,
    chrome_executable: str | None,
) -> tuple[str, str | None]:
    """Build a launch plan; kept pure so fallback behavior is easy to test."""
    if browser_mode == "chrome" and chrome_executable:
        return ("chrome", chrome_executable)
    return ("default", None)


def find_chrome_executable(
    *,
    platform: str = sys.platform,
    environ: Mapping[str, str] = os.environ,
    home: Path | None = None,
    is_file: Callable[[Path], bool] = Path.is_file,
    which: Callable[[str], str | None] = shutil.which,
) -> str | None:
    """Find Google Chrome in standard Windows/macOS locations or on PATH."""
    resolved_home = home if home is not None else Path.home()
    for candidate in chrome_executable_candidates(platform, environ, resolved_home):
        if is_file(candidate):
            return str(candidate)
    for command in chrome_command_names(platform):
        executable = which(command)
        if executable:
            return executable
    return None


def open_requested_browser(url: str, browser_mode: BrowserMode) -> bool:
    """Open Chrome when requested and available, otherwise use the system browser."""
    chrome_executable = find_chrome_executable() if browser_mode == "chrome" else None
    target, executable = choose_browser_target(browser_mode, chrome_executable)

    if target == "chrome" and executable:
        try:
            subprocess.Popen(  # noqa: S603 - executable is a discovered local Chrome binary
                [executable, url],
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
                close_fds=True,
            )
            print(f"Opened Google Chrome: {executable}")
            return True
        except OSError as error:
            print(f"Could not start Google Chrome ({error}); using the system default browser.")
    elif browser_mode == "chrome":
        print("Google Chrome was not found; using the system default browser.")

    return webbrowser.open(url)


def schedule_browser_open(url: str, browser_mode: BrowserMode) -> None:
    timer = threading.Timer(0.35, open_requested_browser, args=(url, browser_mode))
    timer.daemon = True
    timer.start()


def main() -> None:
    args = parse_args()
    dist = Path(__file__).resolve().parent / "dist"
    if not (dist / "index.html").is_file():
        raise SystemExit("dist/index.html does not exist. Run npm run build first.")

    mimetypes.add_type("application/wasm", ".wasm")
    mimetypes.add_type("application/octet-stream", ".task")
    handler = partial(SimpleHTTPRequestHandler, directory=str(dist))

    try:
        server = ThreadingHTTPServer((args.host, args.port), handler)
    except OSError as error:
        raise SystemExit(
            f"Unable to listen on {args.host}:{args.port}: {error}\n"
            "Try another port, for example: python serve_dist.py --port 8088"
        ) from error

    url = f"http://{args.host}:{args.port}"
    print(f"VisionGuard AI is running at: {url}")
    print("Press Ctrl+C to stop.")
    if not args.no_browser:
        schedule_browser_open(url, args.browser)

    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nStopped.")
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
