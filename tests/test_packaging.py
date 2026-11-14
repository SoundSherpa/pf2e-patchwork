import hashlib
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
import zipfile
from tools.package_release import (MODULE_ID, allowed_path, collect_files, validate_payload,
                                   write_archive, validate_archive, build_release)

ROOT = Path(__file__).resolve().parents[1]


class PackagingTests(unittest.TestCase):
    def setUp(self):
        self.files = collect_files(ROOT)
        self.version = json.loads(self.files["module.json"])["version"]

    def test_payload_versions(self):
        self.assertEqual(validate_payload(self.files, self.version), self.version)
        self.files["scripts/constants.mjs"] = b'export const VERSION = "99.0.0";'
        with self.assertRaisesRegex(ValueError, "Runtime version"):
            validate_payload(self.files)

    def test_wrong_module_identity_is_rejected(self):
        manifest = json.loads(self.files["module.json"])
        manifest["id"] = "pf2e-patchwork"
        self.files["module.json"] = json.dumps(manifest).encode()
        with self.assertRaisesRegex(ValueError, "identity"):
            validate_payload(self.files)

    def test_explicit_version_mismatch(self):
        with self.assertRaisesRegex(ValueError, "Requested version"):
            validate_payload(self.files, "99.0.0")

    def test_missing_import_rejected(self):
        self.files["scripts/main.mjs"] += b'\nimport "./absent.mjs";\n'
        with self.assertRaisesRegex(ValueError, "Missing runtime import"):
            validate_payload(self.files)

    def test_missing_required_file(self):
        del self.files["lang/en.json"]
        with self.assertRaisesRegex(ValueError, "Missing files"):
            validate_payload(self.files)

    def test_paths_and_exclusions(self):
        for path in ["../secret", "/absolute/module.json", "scripts/../../secret", "C:/secret", "scripts\\bad.mjs"]:
            with self.subTest(path=path), self.assertRaises(ValueError):
                allowed_path(path)
        for path in ["AGENTS.md", ".git/config", "tests/foundation.test.mjs", "tools/check.mjs"]:
            self.assertFalse(allowed_path(path))

    def test_archive_is_deterministic_and_extractable(self):
        with tempfile.TemporaryDirectory() as temporary:
            first, second = [Path(temporary) / name for name in ["first.zip", "second.zip"]]
            write_archive(first, self.files)
            write_archive(second, self.files)
            self.assertEqual(first.read_bytes(), second.read_bytes())
            validate_archive(first, self.files, self.version)
            with zipfile.ZipFile(first) as archive:
                self.assertTrue(all(name.startswith(f"{MODULE_ID}/") for name in archive.namelist()))

    def test_archive_rejects_extra_and_changed_bytes(self):
        with tempfile.TemporaryDirectory() as temporary:
            path = Path(temporary) / "installer.zip"
            write_archive(path, self.files)
            with zipfile.ZipFile(path, "a") as archive:
                archive.writestr("wrapper/module.json", "{}")
            with self.assertRaisesRegex(ValueError, "Unexpected ZIP"):
                validate_archive(path, self.files, self.version)
            changed = dict(self.files)
            changed["README.md"] += b"changed"
            write_archive(path, changed)
            with self.assertRaisesRegex(ValueError, "source mismatch"):
                validate_archive(path, self.files, self.version)

    def test_failed_checks_do_not_produce_installer(self):
        with tempfile.TemporaryDirectory() as temporary, patch("tools.package_release.run_checks", side_effect=ValueError("checks failed")):
            with self.assertRaisesRegex(ValueError, "checks failed"):
                build_release(ROOT, Path(temporary))
            self.assertEqual(list(Path(temporary).iterdir()), [])

    def test_build_checksum_and_external_manifest(self):
        with tempfile.TemporaryDirectory() as temporary, patch("tools.package_release.run_checks"):
            archive = build_release(ROOT, Path(temporary))
            digest = hashlib.sha256(archive.read_bytes()).hexdigest()
            self.assertEqual(archive.with_suffix(".zip.sha256").read_text().strip(), f"{digest}  {archive.name}")
            self.assertEqual((Path(temporary) / "module.json").read_bytes(), self.files["module.json"])


if __name__ == "__main__":
    unittest.main()
