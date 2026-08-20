#!/usr/bin/env python3

from __future__ import annotations

import argparse
import hashlib
import json
import re
from pathlib import Path


NAPPLET_KIND = 35129
NAPPLET_TYPE = "rageofempires"
REQUIRED_CAPABILITIES = ("identity", "outbox", "storage")
FORBIDDEN_AUTHORITY_MARKERS = (
    "PrivateKeySigner",
    "identity.signEvent",
    "napplet.identity.signEvent",
    "window.nostr",
    "globalThis.nostr",
)
FORBIDDEN_RELAY_MARKERS = (
    "applesauce-relay",
    "WebSocket",
)
STYLESHEET_TAG = '<link rel="stylesheet" href="styles.css">'
NOSTR_SCRIPT_TAG = '<script src="aoe_nostr.js"></script>'
EXTERNAL_SUBRESOURCE = re.compile(
    r"<(?:script|img|audio|video|source|link)\b[^>]*\b(?:src|href)="
    r"[\"'](?!data:|#)([^\"']+)[\"']",
    re.IGNORECASE,
)


def sha256_bytes(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def aggregate_hash(path_tags: list[list[str]]) -> str:
    lines = sorted(f"{tag[2]} {tag[1]}\n" for tag in path_tags)
    return sha256_bytes("".join(lines).encode("utf-8"))


def prepare_shell(
    template_path: Path,
    styles_path: Path,
    nostr_path: Path,
    output_path: Path,
) -> None:
    template = template_path.read_text(encoding="utf-8")
    if template.count(STYLESHEET_TAG) != 1:
        raise ValueError("shell must contain exactly one stylesheet tag")
    if template.count(NOSTR_SCRIPT_TAG) != 1:
        raise ValueError("shell must contain exactly one Nostr script tag")
    styles = styles_path.read_text(encoding="utf-8").replace(
        "</style", "<\\/style"
    )
    nostr = nostr_path.read_text(encoding="utf-8").replace(
        "</script", "<\\/script"
    )
    rendered = template.replace(
        STYLESHEET_TAG, f"<style>\n{styles}\n</style>"
    ).replace(NOSTR_SCRIPT_TAG, f"<script>\n{nostr}\n</script>")
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(rendered, encoding="utf-8", newline="\n")


def build_manifest(html_path: Path) -> dict[str, object]:
    html_hash = sha256_bytes(html_path.read_bytes())
    paths = [["path", "/index.html", html_hash]]
    return {
        "kind": NAPPLET_KIND,
        "content": "",
        "tags": [
            ["d", NAPPLET_TYPE],
            *paths,
            ["x", aggregate_hash(paths), "aggregate"],
            *[["requires", capability] for capability in REQUIRED_CAPABILITIES],
            ["title", "Rage of Empires"],
            [
                "description",
                "Two-player skirmish reconstruction for a NIP-5D runtime.",
            ],
            ["source", "https://github.com/jodobear/rageofempires"],
        ],
    }


def write_manifest(html_path: Path, output_path: Path) -> None:
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(
        json.dumps(build_manifest(html_path), indent=2) + "\n",
        encoding="utf-8",
        newline="\n",
    )


def tags_named(manifest: dict[str, object], name: str) -> list[list[str]]:
    tags = manifest.get("tags")
    if not isinstance(tags, list):
        raise ValueError("manifest tags must be a list")
    return [tag for tag in tags if isinstance(tag, list) and tag[:1] == [name]]


def verify_package(html_path: Path, manifest_path: Path) -> None:
    html = html_path.read_text(encoding="utf-8")
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    if manifest.get("kind") != NAPPLET_KIND:
        raise ValueError(f"manifest kind must be {NAPPLET_KIND}")
    external_reference = EXTERNAL_SUBRESOURCE.search(html)
    if external_reference:
        reference = external_reference.group(1)
        raise ValueError(f"external runtime subresource remains: {reference}")
    for marker in FORBIDDEN_AUTHORITY_MARKERS:
        if marker in html:
            raise ValueError(
                f"napplet contains forbidden authority marker: {marker}"
            )
    for marker in FORBIDDEN_RELAY_MARKERS:
        if marker in html:
            raise ValueError(
                f"napplet contains forbidden app relay marker: {marker}"
            )
    package_files = sorted(
        path.name for path in html_path.parent.iterdir() if path.is_file()
    )
    expected_files = sorted([html_path.name, manifest_path.name])
    if package_files != expected_files:
        raise ValueError(
            f"napplet package has unexpected files: {package_files}"
        )
    path_tags = tags_named(manifest, "path")
    expected_path = ["path", "/index.html", sha256_bytes(html_path.read_bytes())]
    if path_tags != [expected_path]:
        raise ValueError("manifest /index.html hash does not match artifact")
    aggregate_tags = tags_named(manifest, "x")
    expected_aggregate = ["x", aggregate_hash(path_tags), "aggregate"]
    if aggregate_tags != [expected_aggregate]:
        raise ValueError("manifest aggregate hash does not match path tags")
    capabilities = tuple(tag[1] for tag in tags_named(manifest, "requires"))
    if capabilities != REQUIRED_CAPABILITIES:
        raise ValueError(
            "manifest requires tags must be identity, outbox, storage"
        )


def parser() -> argparse.ArgumentParser:
    root = argparse.ArgumentParser()
    commands = root.add_subparsers(dest="command", required=True)
    prepare = commands.add_parser("prepare-shell")
    prepare.add_argument("--template", type=Path, required=True)
    prepare.add_argument("--styles", type=Path, required=True)
    prepare.add_argument("--nostr", type=Path, required=True)
    prepare.add_argument("--output", type=Path, required=True)
    manifest = commands.add_parser("manifest")
    manifest.add_argument("--html", type=Path, required=True)
    manifest.add_argument("--output", type=Path, required=True)
    verify = commands.add_parser("verify")
    verify.add_argument("--html", type=Path, required=True)
    verify.add_argument("--manifest", type=Path, required=True)
    return root


def main() -> None:
    arguments = parser().parse_args()
    if arguments.command == "prepare-shell":
        prepare_shell(
            arguments.template,
            arguments.styles,
            arguments.nostr,
            arguments.output,
        )
    elif arguments.command == "manifest":
        write_manifest(arguments.html, arguments.output)
    else:
        verify_package(arguments.html, arguments.manifest)


if __name__ == "__main__":
    main()
