#!/usr/bin/env python3
"""Run VisionGuard AI's prebuilt server from the assignment workspace root."""

from __future__ import annotations

import runpy
from pathlib import Path


PROJECT_SERVER = Path(__file__).resolve().parent / "visionguard-ai" / "serve_dist.py"


if __name__ == "__main__":
    if not PROJECT_SERVER.is_file():
        raise SystemExit(f"VisionGuard AI server script was not found: {PROJECT_SERVER}")
    runpy.run_path(str(PROJECT_SERVER), run_name="__main__")
