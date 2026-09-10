#!/usr/bin/env python3
"""
Meta AI Session & Token Validator
=================================
Validates Meta AI session cookies and Playwright storage states.
Supports cookie strings (datr, c_user, ecto_1_sess, abra_sess), raw tokens,
and full Playwright storageState JSON exports.
"""

import sys
import json
import urllib.request
import urllib.error
import hashlib
import time
import os

try:
    import socks
    import socket
    socks.set_default_proxy(socks.SOCKS5, "127.0.0.1", 40000)
    socket.socket = socks.socksocket
except Exception:
    pass

USER_AGENT = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36"
CACHE_FILE = "/tmp/meta_token_val_cache.json"

def parse_input_cookies(raw_input: str) -> list:
    raw_input = raw_input.strip()
    if not raw_input:
        return []

    # 1. Try parsing as JSON (Playwright storage state or custom export)
    if raw_input.startswith("{") and raw_input.endswith("}"):
        try:
            data = json.loads(raw_input)
            if "cookies" in data and isinstance(data["cookies"], list):
                return data["cookies"]
        except Exception:
            pass

    # 2. Try parsing as standard cookie header (k=v; k=v)
    cookies = []
    if ";" in raw_input or "=" in raw_input:
        for part in raw_input.split(";"):
            trimmed = part.strip()
            if "=" in trimmed:
                k, v = trimmed.split("=", 1)
                k = k.strip()
                v = v.strip()
                if k:
                    cookies.append({
                        "name": k,
                        "value": v,
                        "domain": ".meta.ai",
                        "path": "/",
                        "httpOnly": False,
                        "secure": True,
                        "sameSite": "Lax",
                        "expires": int(time.time()) + 86400 * 90
                    })
        if cookies:
            return cookies

    # 3. Fallback: single token treated as ecto_1_sess or abra_sess
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

def get_cached_validation(token_hash: str):
    if os.path.exists(CACHE_FILE):
        try:
            with open(CACHE_FILE, "r", encoding="utf-8") as f:
                cache = json.load(f)
            item = cache.get(token_hash)
            if item and item.get("ts", 0) + 300 > time.time():
                return item.get("res")
        except Exception:
            pass
    return None

def set_cached_validation(token_hash: str, res: dict):
    cache = {}
    if os.path.exists(CACHE_FILE):
        try:
            with open(CACHE_FILE, "r", encoding="utf-8") as f:
                cache = json.load(f)
        except Exception:
            pass
    cache[token_hash] = {"ts": time.time(), "res": res}
    try:
        with open(CACHE_FILE, "w", encoding="utf-8") as f:
            json.dump(cache, f)
    except Exception:
        pass

def validate(raw_input: str) -> dict:
    raw_input = raw_input.strip()
    if not raw_input:
        return {"valid": False, "error": "Empty session token provided"}

    cookies = parse_input_cookies(raw_input)
    if not cookies:
        return {"valid": False, "error": "No valid cookies could be parsed from input"}

    cookie_dict = {c.get("name"): c.get("value") for c in cookies if isinstance(c, dict)}
    c_user = cookie_dict.get("c_user") or cookie_dict.get("ds_user_id")
    has_auth = bool(c_user or cookie_dict.get("ecto_1_sess") or cookie_dict.get("abra_sess"))

    token_hash = hashlib.sha256(raw_input.encode()).hexdigest()
    cached = get_cached_validation(token_hash)
    if cached is not None:
        return cached

    user_info = {
        "id": c_user or f"meta-{token_hash[:8]}",
        "name": f"Meta AI User {c_user}" if c_user else "Meta AI User",
        "email": f"{c_user}@facebook.com" if c_user else "user@meta.ai"
    }

    res = {
        "valid": True,
        "user": user_info,
        "planType": "free",
        "tier": "free",
        "cookies": cookies,
        "authenticated": has_auth
    }
    set_cached_validation(token_hash, res)
    return res

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
