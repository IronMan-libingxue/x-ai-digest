#!/usr/bin/env python3

import argparse
import json
from pathlib import Path

import browser_cookie3


def parse_args():
    parser = argparse.ArgumentParser(
        description="Export logged-in X/Twitter Chrome cookies to a Playwright storage state file."
    )
    parser.add_argument("--output", required=True, help="Output path for Playwright storage state JSON")
    return parser.parse_args()


def same_site_for(cookie):
    rest = getattr(cookie, "_rest", {}) or {}
    raw = rest.get("SameSite") or rest.get("samesite")
    if not raw:
        return "Lax"
    raw = str(raw).lower()
    if raw == "none":
        return "None"
    if raw == "strict":
        return "Strict"
    return "Lax"


def to_playwright_cookie(cookie):
    expires = getattr(cookie, "expires", None)
    return {
        "name": cookie.name,
        "value": cookie.value,
        "domain": cookie.domain,
        "path": cookie.path or "/",
        "expires": float(expires) if expires else -1,
        "httpOnly": bool("HttpOnly" in (getattr(cookie, "_rest", {}) or {})),
        "secure": bool(cookie.secure),
        "sameSite": same_site_for(cookie),
    }


def main():
    args = parse_args()
    output_path = Path(args.output)
    output_path.parent.mkdir(parents=True, exist_ok=True)

    jar = browser_cookie3.chrome(domain_name="x.com")
    cookies = [to_playwright_cookie(cookie) for cookie in jar if cookie.value]
    if not cookies:
        raise SystemExit("No x.com cookies found in local Chrome profile.")

    state = {"cookies": cookies, "origins": []}
    output_path.write_text(json.dumps(state, indent=2))
    print(f"Wrote {len(cookies)} cookies to {output_path}")


if __name__ == "__main__":
    main()
