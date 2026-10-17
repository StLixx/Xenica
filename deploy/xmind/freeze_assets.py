#!/usr/bin/env python3
"""冻结已采集的 XMind 原生资源；只复制本地文件，不发起网络请求。"""

from __future__ import annotations

import argparse
import hashlib
import json
import posixpath
import re
import shutil
from datetime import datetime, timezone
from pathlib import Path, PurePosixPath
from xml.etree import ElementTree

IMPORT_PATTERNS = (
    re.compile(r"""\bfrom\s*(["'`])([^"'`]+)\1"""),
    re.compile(r"""\bimport\s*(["'`])([^"'`]+)\1"""),
    re.compile(r"""\bimport\s*\(\s*(["'`])([^"'`$]+)\1\s*\)"""),
)
CONSTANT_PATTERN = re.compile(
    r"""\bconst\s+([A-Z][A-Z0-9_]*)\s*=\s*(["'`])([^"'`$]+)\2"""
)
VARIABLE_IMPORT_PATTERN = re.compile(r"\bimport\s*\(\s*([A-Z][A-Z0-9_]*)\s*\)")
RELEASE_PATTERN = re.compile(r"""SENTRY_RELEASE\s*=\s*\{\s*id\s*:\s*["'`]([^"'`]+)["'`]""")
ICON_NAME_PATTERN = re.compile(r"[A-Za-z0-9][A-Za-z0-9_-]{0,100}")
SNOWBIRD = PurePosixPath("assets/snowbird-resource/0.0.5")
STYLESHEETS = (
    "vendor-gantt.ZktEL8qG.css",
    "src.4449evAu.css",
    "workbook-global-config-ready.L2U1UY4w.css",
    "vendor-fw-icon.Ic8Z9ndC.css",
)


def digest(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def local_path(reference: str, importer: str = "") -> str | None:
    """只解析同源明确路径；动态模板、bare specifier 与外部 URL 不扩展。"""
    if not reference.startswith(("./", "../", "/")):
        return None
    if "?" in reference or "#" in reference or "\\" in reference:
        raise ValueError(f"不支持带查询或转义的本地资源：{reference}")
    name = posixpath.normpath(
        reference.lstrip("/") if reference.startswith("/")
        else posixpath.join(posixpath.dirname(importer), reference)
    )
    if name in ("", ".", "..") or name.startswith("../"):
        raise ValueError(f"资源路径越界：{reference}")
    return name


def explicit_imports(text: str) -> set[str]:
    references = {match.group(2) for pattern in IMPORT_PATTERNS for match in pattern.finditer(text)}
    constants = {match.group(1): match.group(3) for match in CONSTANT_PATTERN.finditer(text)}
    for match in VARIABLE_IMPORT_PATTERN.finditer(text):
        if match.group(1) not in constants:
            raise ValueError(f"未解析的宿主 import 常量：{match.group(1)}")
        references.add(constants[match.group(1)])
    return references


def checked_file(source: Path, name: str) -> Path:
    path = source.joinpath(*PurePosixPath(name).parts)
    if path.is_symlink() or any(parent.is_symlink() for parent in path.parents if parent != source.parent):
        raise ValueError(f"禁止通过符号链接读取：{name}")
    if not path.is_file() or not path.resolve().is_relative_to(source):
        raise ValueError(f"必需资源未采集或越界：{name}")
    return path


def collect(source: Path, native: Path) -> tuple[dict[str, str], list[str]]:
    native_text = native.read_text(encoding="utf-8")
    roots = sorted({
        name for reference in explicit_imports(native_text)
        if (name := local_path(reference)) is not None
    })
    if not roots:
        raise ValueError("native.js 中没有明确的原生模块入口")
    pending = list(roots)
    files: dict[str, str] = {}
    while pending:
        name = pending.pop()
        if name in files:
            continue
        path = checked_file(source, name)
        files[name] = "native-import-root" if name in roots else "module-import"
        if path.suffix != ".js":
            continue
        for reference in explicit_imports(path.read_text(encoding="utf-8")):
            dependency = local_path(reference, name)
            if dependency is not None:
                pending.append(dependency)
    for name in STYLESHEETS:
        checked_file(source, name)
        files[name] = "native-stylesheet"
    snowbird = source.joinpath(*SNOWBIRD.parts)
    if not snowbird.is_dir() or snowbird.is_symlink():
        raise ValueError("没有已采集的 Snowbird 0.0.5 资源子树")
    for path in sorted(snowbird.rglob("*")):
        if path.is_symlink():
            raise ValueError(f"Snowbird 含符号链接：{path.relative_to(source)}")
        if path.is_file():
            name = path.relative_to(source).as_posix()
            checked_file(source, name)
            files[name] = "cached-snowbird"
    return files, roots


def freeze(source: Path, destination: Path, native: Path, source_version: str | None) -> dict:
    if destination.exists() or destination.is_symlink():
        raise ValueError("目标必须是全新且不存在的私有目录")
    if destination.is_relative_to(source) or source.is_relative_to(destination):
        raise ValueError("来源与目标目录不得互相包含")
    if any((parent / ".git").exists() for parent in (destination, *destination.parents)):
        raise ValueError("第三方资源目标不得位于 Git 工作树内")
    files, roots = collect(source, native)
    icon_source = checked_file(source, "source-icons.json")
    icon_bytes = icon_source.read_bytes()
    icons = json.loads(icon_bytes)
    if not isinstance(icons, dict):
        raise ValueError("source-icons.json 必须是名称到 SVG 文本的对象")
    for name, svg in icons.items():
        if not isinstance(name, str) or not ICON_NAME_PATTERN.fullmatch(name) or not isinstance(svg, str):
            raise ValueError("图标名称或 SVG 文本不合法")
        root = ElementTree.fromstring(svg)
        if root.tag != "{http://www.w3.org/2000/svg}svg":
            raise ValueError(f"图标不是 SVG 根元素：{name}")
    release_ids: set[str] = set()
    for name in files:
        if name.endswith(".js"):
            release_ids.update(RELEASE_PATTERN.findall(checked_file(source, name).read_text(encoding="utf-8")))
    if not source_version and len(release_ids) != 1:
        raise ValueError("来源版本不唯一，请用 --source-version 指定可审计版本")
    records = []
    destination.mkdir(parents=True, exist_ok=False)
    for name in sorted(files):
        source_file = checked_file(source, name)
        target = destination.joinpath(*PurePosixPath(name).parts)
        target.parent.mkdir(parents=True, exist_ok=True)
        source_hash = digest(source_file.read_bytes())
        shutil.copyfile(source_file, target)
        content = target.read_bytes()
        if digest(content) != source_hash:
            raise ValueError(f"复制期间来源变化或校验失败：{name}")
        records.append({"path": name, "source_path": name, "sha256": source_hash,
                        "size": len(content), "reason": files[name]})
    icon_hash = digest(icon_bytes)
    (destination / "icons").mkdir()
    for name, svg in sorted(icons.items()):
        content = svg.encode("utf-8")
        icon_path = f"icons/{name}.svg"
        destination.joinpath(icon_path).write_bytes(content)
        records.append({"path": icon_path, "source_path": "source-icons.json",
                        "source_sha256": icon_hash, "source_key": name,
                        "sha256": digest(content), "size": len(content),
                        "reason": "captured-source-icon"})
    manifest = {
        "schema": 1,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "source_version": source_version or f"sentry:{next(iter(release_ids))}",
        "source_release_ids": sorted(release_ids),
        "source_capture": source.name,
        "host_native_sha256": digest(native.read_bytes()),
        "roots": roots,
        "coverage": {
            "policy": "exact local static and dynamic imports; complete cached Snowbird subtree",
            "remote_fetches": 0,
            "unresolved_dynamic_expressions": "not expanded",
            "snowbird": "complete cached subtree; upstream completeness unverified",
        },
        "files": sorted(records, key=lambda item: item["path"]),
    }
    manifest["inventory_sha256"] = digest(json.dumps(manifest["files"], sort_keys=True,
                                                   separators=(",", ":")).encode())
    (destination / "asset-manifest.json").write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return manifest


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source", required=True, type=Path, help="Infra 已采集私有资源目录")
    parser.add_argument("--dest", required=True, type=Path, help="全新、位于 Git 外的私有冻结目录")
    parser.add_argument("--native", type=Path, default=Path(__file__).parent / "web/native.js")
    parser.add_argument("--source-version", help="覆盖自动识别的 Sentry release 版本标识")
    args = parser.parse_args()
    try:
        if args.dest.is_symlink():
            raise ValueError("目标不得是符号链接")
        result = freeze(args.source.resolve(strict=True), args.dest.absolute().resolve(),
                        args.native.resolve(strict=True), args.source_version)
    except (ValueError, OSError, json.JSONDecodeError, ElementTree.ParseError) as error:
        parser.exit(1, f"冻结失败：{error}\n")
    print(json.dumps({"destination": str(args.dest), "files": len(result["files"]),
                      "bytes": sum(item["size"] for item in result["files"]),
                      "source_version": result["source_version"],
                      "inventory_sha256": result["inventory_sha256"]}, ensure_ascii=False))


if __name__ == "__main__":
    main()
