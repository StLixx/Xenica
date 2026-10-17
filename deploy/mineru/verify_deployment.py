"""Verify the exact deployed MinerU binary, static assets, service and access gate."""
import argparse
import hashlib
import json
from pathlib import Path
import urllib.error
import urllib.request


def sha(path):
    with path.open("rb") as source:
        return hashlib.file_digest(source, "sha256").hexdigest()


def verify(public):
    root = Path(__file__).resolve().parent
    app = Path("/var/lib/mineru/app")
    manifest = json.loads((app / "deployment.json").read_text())
    if sha(app / "mineru-server") != manifest["binary_sha256"]:
        raise ValueError("Runtime binary differs from candidate")
    for name, digest in manifest["files"].items():
        relative = Path(name)
        if relative.is_absolute() or ".." in relative.parts:
            raise ValueError("Unsafe asset manifest")
        if sha(app / "web" / relative) != digest or sha(root / "web/dist" / relative) != digest:
            raise ValueError("Deployed web assets differ from current build")
    for name in ["mineru.service", "mineru-backup.service", "mineru-backup.timer"]:
        if sha(root / name) != sha(Path("/etc/systemd/system") / name):
            raise ValueError("Service unit differs from checkout")
    for name in ["index.html"] + [p for p in manifest["files"] if p.endswith((".js", ".css"))]:
        request = urllib.request.Request(public + "/" + ("" if name == "index.html" else name), headers={"Accept-Encoding": "identity"})
        with urllib.request.urlopen(request, timeout=30) as response:
            content = response.read()
        if hashlib.sha256(content).hexdigest() != manifest["files"][name]:
            raise ValueError("Public asset differs from deployed artifact")
    with urllib.request.urlopen(public + "/api/health", timeout=20) as response:
        health = json.load(response)
    if health.get("ok") is not True or health.get("provider_configured") is not True:
        raise ValueError("Production health or provider is unavailable")
    docid = Path("/var/lib/mineru-ops/qa-document-id.txt").read_text().strip()
    rejected = []
    for path in ["/api/me", "/api/documents", "/api/favorites", "/api/provider/status", "/api/documents/" + docid, "/api/documents/" + docid + "/original", "/api/documents/" + docid + "/assets/images/unknown.jpg", "/api/documents/" + docid + "/export?format=json"]:
        try:
            urllib.request.urlopen(public + path, timeout=20)
        except urllib.error.HTTPError as error:
            if error.code == 401:
                rejected.append(path.replace(docid, "{owned-document}"))
                continue
        raise ValueError("Anonymous request was not rejected")
    identity = {"binary_sha256": manifest["binary_sha256"], "web_manifest_sha256": manifest["web_manifest_sha256"]}
    return {"schema": 1, "public": public, **identity, "product_id": hashlib.sha256(json.dumps(identity, sort_keys=True).encode()).hexdigest(), "assets_verified": len(manifest["files"]), "checks": {"source_build_equals_runtime": True, "public_assets_equal": True, "certificate_verified": True, "health": True, "service_units_equal": True, "anonymous_rejections": rejected}, "status": "deployed-awaiting-user-acceptance"}


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--public", default="https://mineru.truebigsand.top")
    parser.add_argument("--output", type=Path)
    args = parser.parse_args()
    result = verify(args.public.rstrip("/"))
    text = json.dumps(result, ensure_ascii=False, indent=2) + "\n"
    if args.output:
        args.output.write_text(text)
    print(text)
