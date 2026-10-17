"""Inspect the dedicated XMind HTTPS route; change it only with explicit --apply."""
import argparse
from concurrent.futures import ThreadPoolExecutor
from contextlib import contextmanager
from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path
import re
import socket
import subprocess
import sys

sys.dont_write_bytecode = True
DOMAIN = "xmind.truebigsand.top"
UPSTREAM = "http://100.100.1.202:3055"
PUBLIC_IP = "139.224.197.51"
TEMPLATE_ID = 27
TEMPLATE_DOMAIN = "penpot.truebigsand.top"
BEGIN = "# BEGIN XENICA XMIND"
END = "# END XENICA XMIND"
SETTINGS = {"client_max_body_size": "33m", "proxy_read_timeout": "120s",
            "proxy_send_timeout": "120s", "proxy_buffering": "off"}


class EdgeError(ValueError):
    pass


@contextmanager
def ipv4_network():
    original = socket.getaddrinfo
    def ipv4(host, port, family=0, type=0, proto=0, flags=0):
        return original(host, port, socket.AF_INET, type, proto, flags)
    socket.getaddrinfo = ipv4
    try:
        yield
    finally:
        socket.getaddrinfo = original


def certificate_public(certificate):
    pem = certificate.get("pem")
    if not isinstance(pem, str):
        raise EdgeError("HTTPS template certificate is unavailable")
    result = subprocess.run(["openssl", "x509", "-noout", "-checkend", "604800",
                             "-checkhost", DOMAIN, "-ext", "subjectAltName", "-dates"],
                            input=pem, text=True, capture_output=True)
    if result.returncode:
        raise EdgeError("Certificate does not cover XMind or expires within seven days")
    names = re.findall(r"DNS:([^,\s]+)", result.stdout)
    if not names:
        raise EdgeError("Certificate SAN is missing")
    return {"id": certificate["id"], "sans": names, "expires": certificate.get("expireDate")}


def website_list(panel):
    items = []
    page = 1
    while True:
        result = panel("/websites/search", {"page": page, "pageSize": 100,
                                           "orderBy": "created_at", "order": "ascending"})
        if not isinstance(result, dict) or not isinstance(result.get("items"), list):
            raise EdgeError("Cannot inspect existing websites")
        items.extend(result["items"])
        if len(items) >= result.get("total", len(items)):
            break
        if not result["items"] or page >= 100:
            raise EdgeError("Website inventory is incomplete")
        page += 1
    return list({item["id"]: item for item in items}.values())


def normalized_domain(value):
    return str(value).lower().rstrip(".")


def target_site(details):
    matches = []
    for site in details:
        domains = {normalized_domain(d.get("domain", "")) for d in site.get("domains", [])}
        domains.add(normalized_domain(site.get("primaryDomain", "")))
        if DOMAIN in domains:
            if normalized_domain(site.get("primaryDomain")) != DOMAIN:
                raise EdgeError("XMind is already a secondary domain of another website")
            matches.append(site)
        elif site.get("alias") == "xmind":
            raise EdgeError("The dedicated xmind alias is already used by another website")
    if len(matches) > 1:
        raise EdgeError("Multiple websites already claim the XMind domain")
    if matches:
        site = matches[0]
        domains = {normalized_domain(d.get("domain", "")) for d in site.get("domains", [])}
        if domains - {DOMAIN}:
            raise EdgeError("Existing XMind website contains unrelated domains")
        if site.get("type") != "proxy" or site.get("proxy") != UPSTREAM:
            raise EdgeError("Existing XMind website points elsewhere; refusing to overwrite it")
        return site
    return None


def check_dns(records):
    if records and (len(records) != 1 or records[0].get("type") != "A"
                    or normalized_domain(records[0].get("name")) != DOMAIN
                    or records[0].get("content") != PUBLIC_IP or records[0].get("proxied") is not False):
        raise EdgeError("Existing XMind DNS differs; refusing to overwrite it")


def inspect(panel, cf):
    sites = website_list(panel)
    # Include secondary domains, which are absent from the search response.
    with ThreadPoolExecutor(max_workers=4) as workers:
        details = list(workers.map(lambda item: panel("/websites/" + str(item["id"])), sites))
    template = next((site for site in details if site["id"] == TEMPLATE_ID), None)
    if (not template or template.get("primaryDomain") != TEMPLATE_DOMAIN
            or template.get("type") != "proxy" or template.get("protocol") != "HTTPS"
            or not template.get("webSiteSSLId") or not template.get("webSiteGroupId")):
        raise EdgeError("Verified HTTPS template changed; inspect before deploying")
    certificate = certificate_public(panel("/websites/ssl/" + str(template["webSiteSSLId"])))
    existing = target_site(details)
    if existing and (existing.get("protocol") != "HTTPS"
                     or existing.get("webSiteSSLId") != certificate["id"]):
        raise EdgeError("Existing XMind HTTPS configuration differs; inspect before changing it")
    zones = cf("/zones?name=truebigsand.top")
    if len(zones) != 1:
        raise EdgeError("DNS zone is ambiguous")
    endpoint = "/zones/" + zones[0]["id"] + "/dns_records"
    records = cf(endpoint + "?name=" + DOMAIN)
    check_dns(records)
    body = {"type": "proxy", "alias": "xmind", "remark": "Private XMind native editor",
            "proxy": UPSTREAM, "webSiteGroupID": template["webSiteGroupId"],
            "domains": [{"domain": DOMAIN, "port": 80}], "appType": "installed",
            "enableSSL": True, "websiteSSLID": certificate["id"], "IPV6": False}
    desired_dns = {"type": "A", "name": DOMAIN, "content": PUBLIC_IP, "ttl": 300, "proxied": False}
    return {"domain": DOMAIN, "upstream": UPSTREAM, "website_action": "reuse" if existing else "create",
            "website_id": existing["id"] if existing else None, "certificate": certificate,
            "website_create_fields": body, "dns_action": "reuse" if records else "create",
            "desired_dns": desired_dns, "dns_endpoint": endpoint}


def _advance_depth(line, depth):
    quote = None
    escaped = False
    for char in line:
        if escaped:
            escaped = False
        elif char == "\\":
            escaped = True
        elif quote:
            if char == quote:
                quote = None
        elif char in ("'", '"'):
            quote = char
        elif char == "#":
            break
        elif char == "{":
            depth += 1
        elif char == "}":
            depth -= 1
            if depth < 0:
                raise EdgeError("Unbalanced dedicated website configuration")
    return depth


def configure(content):
    # Manage only server-level directives. Preserve location-level settings.
    if not isinstance(content, str):
        raise EdgeError("Website configuration is unavailable")
    content = re.sub(r"(?ms)^[ \t]*" + re.escape(BEGIN) + r"\n.*?^[ \t]*" + re.escape(END) + r"\n?", "", content)
    lines = content.splitlines(keepends=True)
    servers = [i for i, line in enumerate(lines) if re.fullmatch(r"\s*server\s*\{\s*(?:#.*)?\n?", line)]
    if len(servers) != 1:
        raise EdgeError("Expected one dedicated server configuration")
    start = servers[0]
    depth = 0
    output = []
    for index, line in enumerate(lines):
        at_server = index > start and depth == 1
        if at_server and any(re.match(r"\s*" + key + r"\s+", line) for key in SETTINGS):
            if not re.fullmatch(r"\s*[a-z_]+\s+[^;{}]+;\s*(?:#.*)?\n?", line):
                raise EdgeError("Cannot safely edit existing server directive")
        else:
            output.append(line)
        depth = _advance_depth(line, depth)
        if index == start:
            output.append("    " + BEGIN + "\n")
            output.extend(f"    {key} {value};\n" for key, value in SETTINGS.items())
            output.append("    if ($scheme = http) { return 308 https://$host$request_uri; }\n")
            output.append("    " + END + "\n")
    if depth != 0:
        raise EdgeError("Unbalanced dedicated website configuration")
    return "".join(output)


def check_proxy(panel, website_id):
    proxies = panel("/websites/proxies", {"id": website_id})
    if not isinstance(proxies, list) or not proxies:
        raise EdgeError("Dedicated upstream proxy is missing")
    if any(proxy.get("proxyPass") != UPSTREAM for proxy in proxies):
        raise EdgeError("Dedicated website has an unexpected upstream proxy")
    if not any("proxy_set_header Host $host;" in proxy.get("content", "")
               and "proxy_http_version 1.1;" in proxy.get("content", "") for proxy in proxies):
        raise EdgeError("Dedicated proxy must preserve Host and HTTP/1.1")


def public_plan(plan):
    return {key: value for key, value in plan.items() if key != "dns_endpoint"}


def provision(panel, cf, apply=False, state=Path("/var/lib/xmind-ops")):
    plan = inspect(panel, cf)
    if not apply:
        return {"applied": False, **public_plan(plan)}
    if plan["website_action"] == "create":
        panel("/websites", plan["website_create_fields"], "POST")
        plan = inspect(panel, cf)
        if not plan["website_id"]:
            raise EdgeError("Created website did not appear in inventory")
    ident = plan["website_id"]
    check_proxy(panel, ident)
    original = panel("/websites/" + str(ident) + "/config/openresty")
    content = original.get("content")
    if not isinstance(content, str) or not re.search(r"\blisten\s+443\s+ssl\b", content):
        raise EdgeError("Dedicated HTTPS listener is missing")
    updated = configure(content)
    state = Path(state)
    state.mkdir(parents=True, exist_ok=True, mode=0o700)
    state.chmod(0o700)
    original_file = state / ("edge-original-" + str(ident) + ".json")
    if not original_file.exists():
        with original_file.open("x") as target:
            original_file.chmod(0o600)
            json.dump(original, target)
    if updated != content:
        panel("/websites/nginx/update", {"id": ident, "content": updated}, "POST")
    check = panel("/websites/" + str(ident) + "/config/openresty")
    if check.get("content") != updated:
        raise EdgeError("Saved dedicated website configuration differs")
    if plan["dns_action"] == "create":
        cf(plan["dns_endpoint"], plan["desired_dns"], "POST")
    records = cf(plan["dns_endpoint"] + "?name=" + DOMAIN)
    if not records:
        raise EdgeError("Dedicated DNS record was not created")
    check_dns(records)
    result = {"applied": True, **public_plan(plan),
              "config_sha256": hashlib.sha256(updated.encode()).hexdigest(),
              "recorded": datetime.now(timezone.utc).isoformat()}
    record = state / "edge.json"
    with record.open("w") as target:
        record.chmod(0o600)
        json.dump(result, target, indent=2)
    return result


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--apply", action="store_true", help="Create only the verified dedicated route")
    parser.add_argument("--helpers", type=Path, default=Path("/var/lib/penpot-ops"))
    parser.add_argument("--state", type=Path, default=Path("/var/lib/xmind-ops"))
    args = parser.parse_args()
    try:
        sys.path.insert(0, str(args.helpers.resolve()))
        from access import panel, cf
        with ipv4_network():
            result = provision(panel, cf, args.apply, args.state)
        print(json.dumps(result, ensure_ascii=False, indent=2))
    except EdgeError as exc:
        parser.exit(1, str(exc) + "\n")
    except Exception as exc:
        # Helper/API failures may contain sensitive response data.
        parser.exit(1, "Dedicated route inspection failed (" + type(exc).__name__ + ")\n")


if __name__ == "__main__":
    main()
