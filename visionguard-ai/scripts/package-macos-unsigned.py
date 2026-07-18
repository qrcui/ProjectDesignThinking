#!/usr/bin/env python3
"""Create an unsigned VisionGuard macOS app zip from an official Electron zip.

This is a cross-host development fallback. Public releases must still be built,
signed, and notarized on macOS.
"""

from __future__ import annotations

import argparse
import plistlib
import stat
import zipfile
from pathlib import Path


APP_NAME = "VisionGuard AI"
APP_ID = "ai.visionguard.desktop"
APP_VERSION = "1.0.0"
SOURCE_PREFIX = "Electron.app/"
TARGET_PREFIX = f"{APP_NAME}.app/"
CAMERA_DESCRIPTION = (
    "VisionGuard AI uses the camera only after consent to analyze eye and "
    "viewing behavior locally on this device."
)


def copied_info(source: zipfile.ZipInfo, filename: str) -> zipfile.ZipInfo:
    target = zipfile.ZipInfo(filename, source.date_time)
    target.compress_type = source.compress_type
    target.comment = source.comment
    target.extra = source.extra
    target.create_system = source.create_system
    target.create_version = source.create_version
    target.extract_version = source.extract_version
    target.external_attr = source.external_attr
    target.internal_attr = source.internal_attr
    target.volume = source.volume
    return target


def file_info(filename: str, executable: bool = False) -> zipfile.ZipInfo:
    target = zipfile.ZipInfo(filename)
    target.compress_type = zipfile.ZIP_DEFLATED
    target.create_system = 3
    mode = stat.S_IFREG | (0o755 if executable else 0o644)
    target.external_attr = mode << 16
    return target


def directory_info(filename: str) -> zipfile.ZipInfo:
    target = zipfile.ZipInfo(filename.rstrip("/") + "/")
    target.compress_type = zipfile.ZIP_STORED
    target.create_system = 3
    target.external_attr = ((stat.S_IFDIR | 0o755) << 16) | 0x10
    return target


def renamed_entry(name: str) -> str:
    target = TARGET_PREFIX + name[len(SOURCE_PREFIX) :]
    executable = f"{TARGET_PREFIX}Contents/MacOS/Electron"
    if target == executable:
        return f"{TARGET_PREFIX}Contents/MacOS/{APP_NAME}"
    return target


def write_app_files(output: zipfile.ZipFile, project: Path) -> None:
    app_root = f"{TARGET_PREFIX}Contents/Resources/app"
    output.writestr(directory_info(app_root), b"")
    for relative_root in (Path("dist"), Path("electron")):
        source_root = project / relative_root
        if not source_root.is_dir():
            raise FileNotFoundError(f"Missing application directory: {source_root}")
        for source in sorted(source_root.rglob("*")):
            relative = source.relative_to(project).as_posix()
            archive_name = f"{app_root}/{relative}"
            if source.is_dir():
                output.writestr(directory_info(archive_name), b"")
            else:
                output.writestr(file_info(archive_name), source.read_bytes())

    package_json = project / "package.json"
    output.writestr(
        file_info(f"{app_root}/package.json"), package_json.read_bytes()
    )


def install_script() -> bytes:
    return f"""#!/bin/zsh
set -euo pipefail
script_dir="${{0:A:h}}"
app="$script_dir/{APP_NAME}.app"

if [[ ! -d "$app" ]]; then
  echo "Cannot find $app" >&2
  exit 1
fi

xattr -dr com.apple.quarantine "$app" 2>/dev/null || true
codesign --force --deep --sign - "$app"
open "$app"
""".encode("utf-8")


def readme(arch: str) -> bytes:
    return f"""VisionGuard AI {APP_VERSION} for macOS ({arch})

This development build is unsigned because it was assembled on Windows.
Before the first launch, open Terminal in this folder and run:

  chmod +x INSTALL-macOS.command
  ./INSTALL-macOS.command

The script removes this extracted copy's quarantine flag, applies an ad-hoc
local signature, and opens the app. macOS will then request camera permission
when you start the consented camera flow.

For public distribution, use the native macOS CI build and Apple Developer ID
signing/notarization instead of this development package.
""".encode("utf-8")


def build(input_zip: Path, output_zip: Path, project: Path, arch: str) -> None:
    output_zip.parent.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(input_zip, "r") as source, zipfile.ZipFile(
        output_zip, "w", allowZip64=True, compresslevel=6
    ) as output:
        names = set(source.namelist())
        plist_name = f"{SOURCE_PREFIX}Contents/Info.plist"
        if plist_name not in names:
            raise ValueError(f"Not an Electron macOS archive: {input_zip}")

        for entry in source.infolist():
            if not entry.filename.startswith(SOURCE_PREFIX):
                continue
            if entry.filename.endswith("/Contents/Resources/default_app.asar"):
                continue

            target_name = renamed_entry(entry.filename)
            data = source.read(entry)
            if entry.filename == plist_name:
                info = plistlib.loads(data)
                info.update(
                    {
                        "CFBundleDisplayName": APP_NAME,
                        "CFBundleExecutable": APP_NAME,
                        "CFBundleIdentifier": APP_ID,
                        "CFBundleName": APP_NAME,
                        "CFBundleShortVersionString": APP_VERSION,
                        "CFBundleVersion": APP_VERSION,
                        "NSCameraUsageDescription": CAMERA_DESCRIPTION,
                    }
                )
                data = plistlib.dumps(info, fmt=plistlib.FMT_XML, sort_keys=False)
            output.writestr(copied_info(entry, target_name), data)

        write_app_files(output, project)
        output.writestr(file_info("INSTALL-macOS.command", executable=True), install_script())
        output.writestr(file_info("README-macOS.txt"), readme(arch))


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--arch", choices=("x64", "arm64"), required=True)
    args = parser.parse_args()
    project = Path(__file__).resolve().parent.parent
    build(args.input.resolve(), args.output.resolve(), project, args.arch)


if __name__ == "__main__":
    main()
