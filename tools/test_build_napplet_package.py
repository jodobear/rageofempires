#!/usr/bin/env python3

from __future__ import annotations

import importlib.util
import json
import tempfile
import unittest
from pathlib import Path


MODULE_PATH = Path(__file__).with_name("build_napplet_package.py")
SPEC = importlib.util.spec_from_file_location("build_napplet_package", MODULE_PATH)
assert SPEC and SPEC.loader
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)


class NappletPackageTests(unittest.TestCase):
    def test_shell_inlines_styles_and_nostr_bundle(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            template = root / "shell.html"
            styles = root / "styles.css"
            nostr = root / "aoe_nostr.js"
            output = root / "output.html"
            template.write_text(
                '<link rel="stylesheet" href="styles.css">\n'
                '<script src="aoe_nostr.js"></script>\n{{{ SCRIPT }}}\n',
                encoding="utf-8",
            )
            styles.write_text("body { color: red; }", encoding="utf-8")
            nostr.write_text("globalThis.nostr = true;", encoding="utf-8")
            MODULE.prepare_shell(template, styles, nostr, output)
            rendered = output.read_text(encoding="utf-8")
            self.assertIn("<style>\nbody { color: red; }", rendered)
            self.assertIn("<script>\nglobalThis.nostr = true;", rendered)
            self.assertNotIn("styles.css", rendered)
            self.assertNotIn("aoe_nostr.js", rendered)
            self.assertIn("{{{ SCRIPT }}}", rendered)

    def test_manifest_is_deterministic_and_hashes_html(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            html = root / "index.html"
            html.write_text("<!doctype html><p>game</p>", encoding="utf-8")
            first = MODULE.build_manifest(html)
            second = MODULE.build_manifest(html)
            self.assertEqual(first, second)
            path = MODULE.tags_named(first, "path")
            self.assertEqual(path[0][1], "/index.html")
            self.assertEqual(path[0][2], MODULE.sha256_bytes(html.read_bytes()))
            self.assertEqual(first["kind"], 35129)

    def test_verify_accepts_only_html_and_manifest(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            html = root / "index.html"
            manifest = root / ".nip5a-manifest.json"
            html.write_text(
                '<!doctype html><link rel="icon" href="data:,">'
                "<script>console.log('game')</script>",
                encoding="utf-8",
            )
            MODULE.write_manifest(html, manifest)
            MODULE.verify_package(html, manifest)

    def test_verify_rejects_external_subresource(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            html = root / "index.html"
            manifest = root / ".nip5a-manifest.json"
            html.write_text(
                '<!doctype html><script src="game.js"></script>',
                encoding="utf-8",
            )
            MODULE.write_manifest(html, manifest)
            with self.assertRaisesRegex(ValueError, "external runtime"):
                MODULE.verify_package(html, manifest)

    def test_verify_rejects_private_authority_markers(self) -> None:
        for marker in MODULE.FORBIDDEN_AUTHORITY_MARKERS:
            with self.subTest(marker=marker), tempfile.TemporaryDirectory() as temporary:
                root = Path(temporary)
                html = root / "index.html"
                manifest = root / ".nip5a-manifest.json"
                html.write_text(
                    f"<!doctype html><script>{marker}</script>",
                    encoding="utf-8",
                )
                MODULE.write_manifest(html, manifest)
                with self.assertRaisesRegex(ValueError, "forbidden authority"):
                    MODULE.verify_package(html, manifest)

    def test_verify_rejects_app_owned_relay_markers(self) -> None:
        for marker in MODULE.FORBIDDEN_RELAY_MARKERS:
            with self.subTest(marker=marker), tempfile.TemporaryDirectory() as temporary:
                root = Path(temporary)
                html = root / "index.html"
                manifest = root / ".nip5a-manifest.json"
                html.write_text(
                    f"<!doctype html><script>{marker}</script>",
                    encoding="utf-8",
                )
                MODULE.write_manifest(html, manifest)
                with self.assertRaisesRegex(ValueError, "forbidden app relay"):
                    MODULE.verify_package(html, manifest)

    def test_verify_rejects_bad_aggregate(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            html = root / "index.html"
            manifest = root / ".nip5a-manifest.json"
            html.write_text("<!doctype html>", encoding="utf-8")
            event = MODULE.build_manifest(html)
            MODULE.tags_named(event, "x")[0][1] = "0" * 64
            manifest.write_text(json.dumps(event), encoding="utf-8")
            with self.assertRaisesRegex(ValueError, "aggregate hash"):
                MODULE.verify_package(html, manifest)


if __name__ == "__main__":
    unittest.main()
