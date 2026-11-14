"""Validate and build the independent Patchwork installer (standard library only)."""
import argparse
import hashlib
import json
import os
from pathlib import Path, PurePosixPath
import re
import subprocess
import sys
import tempfile
import zipfile

MODULE_ID = "pf2e-patchwork-qol"
SOURCE_FILES = set(['.github/workflows/build-stable.yml', '.github/workflows/publish-stable.yml', '.github/workflows/validate-stable.yml', 'CHANGELOG.md', 'LICENSE', 'README.md', 'assets/readme/playlist-creation.png', 'docs/README.md', 'docs/guides/getting-started.md', 'docs/guides/interface-and-presentation.md', 'docs/guides/scene-audio.md', 'docs/guides/session-hero-points.md', 'docs/guides/spellcasting.md', 'docs/guides/token-movement-history.md', 'lang/en.json', 'module.json', 'package.json', 'scripts/constants.mjs', 'scripts/features/about-face-flips.mjs', 'scripts/features/catalog.mjs', 'scripts/features/chat-toolbar-appearance.mjs', 'scripts/features/day-night-playlists.mjs', 'scripts/features/day-night-scene-ui.mjs', 'scripts/features/gm-target-indicators.mjs', 'scripts/features/hero-actions-adapter.mjs', 'scripts/features/pause-banner-position.mjs', 'scripts/features/playlist-curation-ui.mjs', 'scripts/features/playlist-curation.mjs', 'scripts/features/session-hero-points-reset.mjs', 'scripts/features/session-hero-points-ui.mjs', 'scripts/features/session-hero-points.mjs', 'scripts/features/silent-gm-initiative.mjs', 'scripts/features/spell-icon-preferences.mjs', 'scripts/features/spell-information-ui.mjs', 'scripts/features/spell-information.mjs', 'scripts/features/spell-surfaces.mjs', 'scripts/features/spellbook-lock.mjs', 'scripts/features/token-movement-ui.mjs', 'scripts/features/token-movement.mjs', 'scripts/main.mjs', 'scripts/settings.mjs', 'styles/patchwork.css', 'tests/stable-release.test.mjs', 'tests/test_packaging.py', 'tools/check.mjs', 'tools/package_release.py', 'tools/publish_release.mjs'])
INSTALL_FILES = set(['CHANGELOG.md', 'LICENSE', 'README.md', 'assets/readme/playlist-creation.png', 'docs/README.md', 'docs/guides/getting-started.md', 'docs/guides/interface-and-presentation.md', 'docs/guides/scene-audio.md', 'docs/guides/session-hero-points.md', 'docs/guides/spellcasting.md', 'docs/guides/token-movement-history.md', 'lang/en.json', 'module.json', 'scripts/constants.mjs', 'scripts/features/about-face-flips.mjs', 'scripts/features/catalog.mjs', 'scripts/features/chat-toolbar-appearance.mjs', 'scripts/features/day-night-playlists.mjs', 'scripts/features/day-night-scene-ui.mjs', 'scripts/features/gm-target-indicators.mjs', 'scripts/features/hero-actions-adapter.mjs', 'scripts/features/pause-banner-position.mjs', 'scripts/features/playlist-curation-ui.mjs', 'scripts/features/playlist-curation.mjs', 'scripts/features/session-hero-points-reset.mjs', 'scripts/features/session-hero-points-ui.mjs', 'scripts/features/session-hero-points.mjs', 'scripts/features/silent-gm-initiative.mjs', 'scripts/features/spell-icon-preferences.mjs', 'scripts/features/spell-information-ui.mjs', 'scripts/features/spell-information.mjs', 'scripts/features/spell-surfaces.mjs', 'scripts/features/spellbook-lock.mjs', 'scripts/features/token-movement-ui.mjs', 'scripts/features/token-movement.mjs', 'scripts/main.mjs', 'scripts/settings.mjs', 'styles/patchwork.css'])
ROOT_FILES = {p for p in INSTALL_FILES if "/" not in p}
RUNTIME_DIRS = {p.split("/")[0] for p in INSTALL_FILES if "/" in p}
REQUIRED = INSTALL_FILES
VERSION_PATTERN = r"\d+\.\d+\.\d+(?:-[A-Za-z0-9]+(?:[.-][A-Za-z0-9]+)*)?"
STAMP = (2026, 11, 10, 0, 0, 0)


def require(condition, message):
    if not condition:
        raise ValueError(message)


def allowed_path(name):
    parts = name.split("/")
    require(name and "\\" not in name and ":" not in name
            and not PurePosixPath(name).is_absolute()
            and all(part and part not in {".", ".."} for part in parts), f"Unsafe path: {name}")
    return name in INSTALL_FILES


def collect_files(root):
    files = {}
    for name in sorted(INSTALL_FILES):
        path = root / name
        for parent in [path, *path.parents]:
            if parent == root.parent: break
            require(not parent.is_symlink(), f"Symlink forbidden: {parent}")
        require(path.is_file(), f"Missing files: {name}")
        files[name] = path.read_bytes()
    for directory in sorted(RUNTIME_DIRS):
        for path in (root / directory).rglob("*"):
            require(not path.is_symlink(), "Symlink forbidden")
            if path.is_file(): require(path.relative_to(root).as_posix() in INSTALL_FILES, "Unexpected runtime file")
    return files


def validate_payload(files, expected_version=None):
    require(REQUIRED <= files.keys(), f"Missing files: {sorted(REQUIRED - files.keys())}")
    manifest = json.loads(files["module.json"])
    version = manifest.get("version", "")
    require(manifest.get("id") == MODULE_ID, "Patchwork module identity mismatch")
    require(isinstance(version, str) and re.fullmatch(VERSION_PATTERN, version), "Invalid version")
    require(expected_version is None or version == expected_version, "Requested version mismatch")
    constants = files["scripts/constants.mjs"].decode()
    require(f'export const VERSION = "{version}";' in constants, "Runtime version mismatch")
    require(f'export const MODULE_ID = "{MODULE_ID}";' in constants, "Runtime identity mismatch")
    require(manifest.get("compatibility", {}).get("minimum") == "14"
            and manifest["compatibility"].get("maximum") == "14", "Foundry v14 limits required")
    require(any(system.get("id") == "pf2e" for system in
                manifest.get("relationships", {}).get("systems", [])), "PF2e restriction required")
    base = "https://github.com/SoundSherpa/pf2e-patchwork"
    require(manifest.get("url") == base and manifest.get("bugs") == base + "/issues", "Repository URLs required")
    require(manifest.get("manifest") == base + "/releases/latest/download/module.json", "Stable manifest URL required")
    require(manifest.get("download") == f"{base}/releases/download/v{version}/{MODULE_ID}-v{version}.zip", "Versioned ZIP URL required")
    require(manifest.get("license") == "LICENSE" and b"Copyright (c) 2026 SoundSherpa" in files["LICENSE"], "MIT attribution required")
    for field in ("esmodules", "styles"):
        require(isinstance(manifest.get(field), list) and manifest[field], f"Missing {field}")
        for name in manifest[field]:
            require(isinstance(name, str) and name in files, f"Missing {field} file: {name}")
    for language in manifest.get("languages", []):
        require(language.get("path") in files, "Missing language file")
    for name, content in files.items():
        if name.endswith(".json"):
            json.loads(content)
        if name.endswith((".mjs", ".js")):
            imports = re.findall(r'(?:from\s*|import\s*)[\'"]([^\'"]+)[\'"]', content.decode())
            for target in imports:
                require(target.startswith("."), f"External runtime import in {name}: {target}")
                resolved = os.path.normpath(str(PurePosixPath(name).parent / target)).replace("\\", "/")
                require(resolved in files, f"Missing runtime import in {name}: {target}")
    return version


def run_checks(root):
    subprocess.run(["node", "tools/check.mjs"], cwd=root, check=True)
    tests = sorted(str(path.relative_to(root)) for path in (root / "tests").glob("*.test.mjs"))
    require(tests, "Node tests required")
    subprocess.run(["node", "--test", *tests], cwd=root, check=True)
    subprocess.run([sys.executable, "-B", "-m", "unittest", "discover", "-s", "tests", "-p", "test_*.py"],
                   cwd=root, check=True)


def write_archive(path, files):
    with zipfile.ZipFile(path, "w", compression=zipfile.ZIP_DEFLATED, compresslevel=9) as archive:
        for name, data in sorted(files.items()):
            info = zipfile.ZipInfo(f"{MODULE_ID}/{name}", date_time=STAMP)
            info.create_system = 3
            info.external_attr = 0o100644 << 16
            info.compress_type = zipfile.ZIP_DEFLATED
            archive.writestr(info, data, compresslevel=9)


def validate_archive(path, files, version):
    validate_payload(files, version)
    with zipfile.ZipFile(path) as archive:
        require(archive.testzip() is None, "ZIP integrity failure")
        names = archive.namelist()
        require(len(names) == len(set(names)), "Duplicate ZIP entries")
        require(set(names) == {f"{MODULE_ID}/{name}" for name in files}, "Unexpected ZIP entries")
        for entry in archive.infolist():
            require(entry.date_time == STAMP and (entry.external_attr >> 16) & 0o170000 == 0o100000,
                    "ZIP metadata mismatch")
            require(archive.read(entry) == files[entry.filename[len(MODULE_ID) + 1:]], "ZIP source mismatch")
    with tempfile.TemporaryDirectory() as temporary:
        # Entry names and bytes were checked before extraction.
        with zipfile.ZipFile(path) as archive:
            archive.extractall(Path(temporary) / "modules")
        installed = Path(temporary) / "modules" / MODULE_ID / "module.json"
        require(installed.is_file() and json.loads(installed.read_text())["id"] == MODULE_ID,
                "Extraction layout mismatch")


def build_release(root, output_dir, expected_version=None):
    files = collect_files(root)
    version = validate_payload(files, expected_version)
    tooling = json.loads((root / "package.json").read_text())
    require(tooling.get("version") == version and tooling.get("name") == MODULE_ID, "Tooling version/identity mismatch")
    require(tooling.get("license") == "MIT", "MIT package metadata required")
    require(f"## v{version}\n" in (root / "CHANGELOG.md").read_text(), "Versioned changelog required")
    run_checks(root)
    require(files == collect_files(root), "Runtime source changed during validation")
    output_dir = output_dir.resolve()
    require(not any(output_dir.is_relative_to(root / name) for name in RUNTIME_DIRS), "Output must be outside runtime")
    output_dir.mkdir(parents=True, exist_ok=True)
    destination = output_dir / f"{MODULE_ID}-v{version}.zip"
    with tempfile.TemporaryDirectory(dir=output_dir) as temporary:
        candidate = Path(temporary) / destination.name
        write_archive(candidate, files)
        validate_archive(candidate, files, version)
        checksum = hashlib.sha256(candidate.read_bytes()).hexdigest()
        checksum_file = candidate.with_suffix(".zip.sha256")
        checksum_file.write_text(f"{checksum}  {destination.name}\n", encoding="utf-8")
        os.replace(candidate, destination)
        os.replace(checksum_file, destination.with_suffix(".zip.sha256"))
    (output_dir / "module.json").write_bytes(files["module.json"])
    print(f"PASS: {len(files)} runtime files; installer {destination.name}; SHA-256 {checksum}")
    return destination


if __name__ == "__main__":
    root = Path(__file__).resolve().parents[1]
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--version")
    parser.add_argument("--output-dir", type=Path, default=root / "dist")
    args = parser.parse_args()
    try:
        build_release(root, args.output_dir, args.version)
    except (ValueError, OSError, subprocess.CalledProcessError, zipfile.BadZipFile) as error:
        parser.exit(1, f"Packaging failed: {error}\n")
