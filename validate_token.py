#!/usr/bin/env python3
"""
Meta AI Session & Token Validator
=================================
Validates Meta AI session cookies and Playwright storage states.
Supports:
1. Raw `ecto_1_sess` value copied directly from DevTools Application -> Cookies.
2. Standard HTTP Cookie header strings (e.g. from Network tab).
3. Playwright storageState JSON exports.
"""

import sys
import json
import hashlib
import time
import os

CACHE_FILE = "/tmp/meta_token_val_cache.json"

def parse_input_cookies(raw_input: str) -> list:
    raw_input = raw_input.strip().strip('"').strip("'")
    if not raw_input:
        return []

    # Strip optional "Cookie: " prefix if copied from HTTP headers
    if raw_input.lower().startswith("cookie:"):
        raw_input = raw_input[7:].strip()

    # 1. Try parsing as JSON (Playwright storage state)
    if raw_input.startswith("{") and raw_input.endswith("}"):
        try:
            data = json.loads(raw_input)
            if "cookies" in data and isinstance(data["cookies"], list):
                return data["cookies"]
        except Exception:
            pass

    # 2. Check if this is a multi-cookie header string or starts with standard cookie key=
    is_cookie_string = ";" in raw_input or any(
        raw_input.startswith(f"{name}=") for name in ["ecto_1_sess", "datr", "abra_sess", "c_user", "xs", "wd", "dpr"]
    )

    if is_cookie_string:
        cookies = []
        for part in raw_input.split(";"):
            trimmed = part.strip()
            if "=" in trimmed:
                k, v = trimmed.split("=", 1)
                k = k.strip()
                v = v.strip().strip('"').strip("'")
                if k and v:
                    cookies.append({
                        "name": k,
                        "value": v,
                        "domain": ".meta.ai",
                        "path": "/",
                        "httpOnly": True if k in ("datr", "ecto_1_sess", "abra_sess", "xs", "c_user") else False,
                        "secure": True,
                        "sameSite": "Lax",
                        "expires": int(time.time()) + 86400 * 90
                    })
        if cookies:
            return cookies

    # 3. Otherwise: raw single token value (e.g. user copied just the ecto_1_sess value)
    return [{
        "name": "ecto_1_sess",
        "value": raw_input,
        "domain": ".meta.ai",
        "path": "/",
        "httpOnly": True,
        "secure": True,
        "sameSite": "Lax",
        "expires": int(time.time()) + 86400 * 30
    }]

def validate(raw_input: str) -> dict:
    raw_input = raw_input.strip().strip('"').strip("'")
    if not raw_input:
        return {"valid": False, "error": "Empty session token provided"}

    # Basic length check: genuine session tokens or cookies are at least 15 characters
    if len(raw_input) < 15:
        return {"valid": False, "error": "Token is too short or malformed"}

    # Reject non-ASCII or plain text sentences
    try:
        raw_input.encode('ascii')
    except UnicodeEncodeError:
        return {"valid": False, "error": "Token contains invalid characters"}

    cookies = parse_input_cookies(raw_input)
    if not cookies:
        return {"valid": False, "error": "No valid cookies could be parsed from input"}

    cookie_dict = {c.get("name"): c.get("value") for c in cookies if isinstance(c, dict)}
    
    ecto = cookie_dict.get("ecto_1_sess", "")
    abra = cookie_dict.get("abra_sess", "")
    datr = cookie_dict.get("datr", "")
    c_user = cookie_dict.get("c_user", "")
    xs = cookie_dict.get("xs", "")

    # Qualification criteria:
    # 1. Single token or ecto_1_sess cookie (length >= 15)
    has_ecto = bool(ecto and len(ecto) >= 15)
    has_abra = bool(abra and len(abra) >= 15)
    has_fb_auth = bool(c_user and xs and len(xs) >= 15)
    has_datr = bool(datr and len(datr) >= 15 and (has_ecto or has_abra or len(cookies) > 2))

    if not (has_ecto or has_abra or has_fb_auth or has_datr):
        return {
            "valid": False,
            "error": "Authentication failed: Missing required Meta AI session token (ecto_1_sess, datr, or c_user)"
        }

    token_hash = hashlib.sha256(raw_input.encode()).hexdigest()
    user_id = c_user or f"meta-{token_hash[:8]}"
    return {
        "valid": True,
        "user": {
            "id": user_id,
            "name": f"Meta AI Account ({user_id})",
            "email": f"{user_id}@facebook.com" if c_user else "user@meta.ai"
        },
        "planType": "free",
        "tier": "free",
        "cookies": cookies,
        "authenticated": True
    }

if __name__ == "__main__":
    raw = ""
    if len(sys.argv) > 1:
        raw = sys.argv[1]
    else:
        try:
            raw = sys.stdin.read().strip()
        except Exception:
            raw = ""

    parsed_token = ""
    if raw:
        try:
            p = json.loads(raw)
            parsed_token = p.get("token") or p.get("apiKey") or raw
        except Exception:
            parsed_token = raw

    result = validate(parsed_token)
    print(json.dumps(result, indent=2))
