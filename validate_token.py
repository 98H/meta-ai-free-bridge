#!/usr/bin/env python3
"""
Meta AI Session & Token Validator
=================================
Validates Meta AI session cookies and Playwright storage states.
Rejects malformed, incomplete, or gibberish tokens.
Supports cookie strings (ecto_1_sess, datr, c_user, abra_sess),
raw cryptographic tokens, and Playwright storageState JSON exports.
"""

import sys
import json
import re
import hashlib
import time
import os

CACHE_FILE = "/tmp/meta_token_val_cache.json"

def parse_input_cookies(raw_input: str) -> list:
    raw_input = raw_input.strip()
    if not raw_input:
        return []

    # 1. Try parsing as JSON (Playwright storage state)
    if raw_input.startswith("{") and raw_input.endswith("}"):
        try:
            data = json.loads(raw_input)
            if "cookies" in data and isinstance(data["cookies"], list):
                return data["cookies"]
        except Exception:
            pass

    # 2. Try parsing as standard cookie header (k=v; k=v)
    cookies = []
    if "=" in raw_input:
        for part in raw_input.split(";"):
            trimmed = part.strip()
            if "=" in trimmed:
                k, v = trimmed.split("=", 1)
                k = k.strip()
                v = v.strip().strip('"')
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

    # 3. If raw single token (e.g. ecto_1_sess value)
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

    # Basic length check: no legitimate Meta AI session token or cookie is under 15 characters
    if len(raw_input) < 15:
        return {"valid": False, "error": "Token is too short or malformed"}

    token_hash = hashlib.sha256(raw_input.encode()).hexdigest()
    cached = get_cached_validation(token_hash)
    if cached is not None:
        return cached

    cookies = parse_input_cookies(raw_input)
    if not cookies:
        res = {"valid": False, "error": "No valid cookies could be parsed from input"}
        set_cached_validation(token_hash, res)
        return res

    cookie_dict = {c.get("name"): c.get("value") for c in cookies if isinstance(c, dict)}
    
    # Check for Meta AI specific credentials
    ecto = cookie_dict.get("ecto_1_sess", "")
    abra = cookie_dict.get("abra_sess", "")
    datr = cookie_dict.get("datr", "")
    c_user = cookie_dict.get("c_user", "") or cookie_dict.get("ds_user_id", "")
    xs = cookie_dict.get("xs", "")

    # Qualification criteria:
    # Option 1: ecto_1_sess or abra_sess present and >= 20 chars
    has_ecto = bool(ecto and len(ecto) >= 20 and re.match(r'^[A-Za-z0-9_\-\.\:\=\+\/]+$', ecto))
    has_abra = bool(abra and len(abra) >= 20 and re.match(r'^[A-Za-z0-9_\-\.\:\=\+\/]+$', abra))
    
    # Option 2: Facebook user session: c_user (numeric >= 5 digits) + xs (session secret >= 15 chars)
    has_fb_auth = bool(c_user and c_user.isdigit() and len(c_user) >= 5 and xs and len(xs) >= 15)

    # Option 3: Valid datr (>= 20 chars) + at least some session token
    has_datr_session = bool(datr and len(datr) >= 20 and (has_ecto or has_abra or has_fb_auth or len(cookies) > 2))

    if not (has_ecto or has_abra or has_fb_auth or has_datr_session):
        # Check if single token provided that looks like a valid ecto token
        if len(cookies) == 1 and cookies[0]["name"] == "ecto_1_sess":
            val = cookies[0]["value"]
            if len(val) >= 25 and re.match(r'^[A-Za-z0-9_\-\.\:\=\+\/]+$', val):
                # Accept as raw session token
                has_ecto = True

    if not (has_ecto or has_abra or has_fb_auth or has_datr_session):
        res = {
            "valid": False,
            "error": "Authentication failed: Missing required Meta AI cookies (ecto_1_sess, datr, or c_user+xs)"
        }
        set_cached_validation(token_hash, res)
        return res

    user_id = c_user or f"meta-{token_hash[:8]}"
    user_info = {
        "id": user_id,
        "name": f"Meta AI Account ({user_id})",
        "email": f"{user_id}@facebook.com" if c_user else "user@meta.ai"
    }

    res = {
        "valid": True,
        "user": user_info,
        "planType": "free",
        "tier": "free",
        "cookies": cookies,
        "authenticated": True
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
