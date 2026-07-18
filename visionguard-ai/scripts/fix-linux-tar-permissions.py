#!/usr/bin/env python3
"""Restore executable modes lost when electron-builder archives Linux on Windows."""

from __future__ import annotations

import argparse
import tarfile
from pathlib import Path


EXECUTABLE_MODES = {
    "chrome-sandbox": 0o4755,
    "chrome_crashpad_handler": 0o755,
    "visionguard-ai": 0o755,
}


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()

    args.output.parent.mkdir(parents=True, exist_ok=True)
    with tarfile.open(args.input, "r:gz") as source, tarfile.open(
        args.output, "w:gz", compresslevel=6
    ) as output:
        for member in source.getmembers():
            filename = member.name.rsplit("/", 1)[-1]
            if member.isfile() and filename in EXECUTABLE_MODES:
                member.mode = EXECUTABLE_MODES[filename]
            data = source.extractfile(member) if member.isfile() else None
            output.addfile(member, data)


if __name__ == "__main__":
    main()
