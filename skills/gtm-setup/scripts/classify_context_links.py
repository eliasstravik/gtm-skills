#!/usr/bin/env python3
"""Classify context source links before saving them as durable GTM facts."""

from __future__ import annotations

import argparse
import json
import sys
from dataclasses import asdict, dataclass
from urllib.parse import parse_qsl, urlparse


SECRET_QUERY_KEYS = {
    "access_token",
    "api_key",
    "auth",
    "key",
    "session",
    "sig",
    "signature",
    "token",
    "x-amz-signature",
}
PRIVATE_HOST_MARKERS = {
    "airtable.com",
    "app.",
    "docs.google.com",
    "drive.google.com",
    "force.com",
    "hubspot.com",
    "notion.site",
    "notion.so",
    "salesforce.com",
}
PRIVATE_TUNNEL_HOST_SUFFIXES = {
    "loca.lt",
    "localtunnel.me",
    "ngrok-free.app",
    "ngrok.app",
    "ngrok.dev",
    "ngrok.io",
    "trycloudflare.com",
}
LOCAL_HOSTS = {"localhost", "127.0.0.1", "0.0.0.0", "::1"}


@dataclass(frozen=True)
class LinkClassification:
    url: str
    classification: str
    commit_behavior: str
    reason: str
    safe_label: str | None = None


def classify_link(url: str) -> LinkClassification:
    parsed = urlparse(url)
    host = (parsed.hostname or "").lower()
    netloc = parsed.netloc.lower()
    path = parsed.path.lower()
    query_keys = {key.lower() for key, _value in parse_qsl(parsed.query, keep_blank_values=True)}

    unsafe_reason = _unsafe_reason(parsed, host, netloc, path, query_keys)
    if unsafe_reason is not None:
        return LinkClassification(
            url=url,
            classification="unsafe",
            commit_behavior="never_commit",
            reason=unsafe_reason,
            safe_label=_safe_label_for_unsafe(unsafe_reason),
        )

    private_reason = _private_reason(host, netloc)
    if private_reason is not None:
        return LinkClassification(
            url=url,
            classification="private",
            commit_behavior="requires_explicit_confirmation",
            reason=private_reason,
            safe_label="Private source used during setup. Link not committed.",
        )

    return LinkClassification(
        url=url,
        classification="public",
        commit_behavior="save_after_confirmation",
        reason="public-looking website, docs, product, or profile link",
    )


def _unsafe_reason(parsed, host: str, netloc: str, path: str, query_keys: set[str]) -> str | None:
    if parsed.username or parsed.password or ("@" in netloc and parsed.scheme in {"http", "https"}):
        return "embedded credentials"
    if host in LOCAL_HOSTS or host.endswith(".local") or "localhost" in netloc:
        return "local-only URL"
    if _has_host_suffix(host, PRIVATE_TUNNEL_HOST_SUFFIXES):
        return "private-tunnel URL"
    if "/invite" in path or "invite" in path.split("/"):
        return "invite URL"
    if SECRET_QUERY_KEYS & query_keys:
        return "secret-bearing or tokenized query parameter"
    if any("token" in key or "signature" in key for key in query_keys):
        return "secret-bearing or tokenized query parameter"
    return None


def _has_host_suffix(host: str, suffixes: set[str]) -> bool:
    return any(host == suffix or host.endswith(f".{suffix}") for suffix in suffixes)


def _private_reason(host: str, netloc: str) -> str | None:
    if any(marker in host or marker in netloc for marker in PRIVATE_HOST_MARKERS):
        return "private or access-controlled source"
    if host.startswith(("crm.", "admin.", "internal.")):
        return "private or access-controlled source"
    return None


def _safe_label_for_unsafe(reason: str) -> str:
    if reason == "local-only URL":
        return "Local-only source used during setup. Link not committed."
    if reason == "private-tunnel URL":
        return "Private tunnel source used during setup. Link not committed."
    if reason == "invite URL":
        return "Invite link provided during setup. Link not committed."
    return "Sensitive source used during setup. Link not committed."


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("urls", nargs="*", help="source links to classify")
    parser.add_argument("--json", action="store_true", help="emit JSON instead of text")
    parser.add_argument("--stdin", action="store_true", help="read one source link per stdin line")
    args = parser.parse_args(argv)

    urls = list(args.urls)
    if args.stdin:
        urls.extend(line.strip() for line in sys.stdin if line.strip())
    if not urls:
        parser.error("provide at least one source link argument or --stdin input")

    classifications = [classify_link(url) for url in urls]
    if args.json:
        print(json.dumps([asdict(item) for item in classifications], indent=2))
    else:
        for item in classifications:
            print(f"{item.classification}\t{item.commit_behavior}\t{item.url}\t{item.reason}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
