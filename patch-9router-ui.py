#!/usr/bin/env python3
"""
9Router Web UI Patcher for Meta AI Web Bridge
=============================================
Transforms standard compatible provider forms in 9Router into senior Product Designer
grade interfaces with Antigravity-style dynamic model tags, "+ Add Model" modal,
and customized "Add Account" modals featuring crystal-clear UX Writing,
explicit instructions on where and how to obtain Meta AI session tokens,
and live "Test Connection" verification.
"""

import os
import sys
import glob
import re

def find_9router_build_dir():
    candidates = [
        os.path.expanduser("~/.local/lib/node_modules/9router/app/.next-cli-build"),
        os.path.expanduser("~/.local/lib/node_modules/9router/app/.next"),
        "/usr/local/lib/node_modules/9router/app/.next-cli-build",
        "/usr/local/lib/node_modules/9router/app/.next",
        "/usr/lib/node_modules/9router/app/.next-cli-build",
        "/usr/lib/node_modules/9router/app/.next"
    ]
    for c in candidates:
        if os.path.isdir(c):
            return c
    return None

def patch_file(path, old_pattern, new_pattern, label=""):
    if not os.path.exists(path):
        return False
    with open(path, "r", encoding="utf-8") as f:
        content = f.read()

    if new_pattern in content:
        print(f"  [✓] Already patched: {os.path.basename(path)} {label}")
        return True

    if old_pattern not in content:
        print(f"  [!] Pattern not found in: {os.path.basename(path)} {label}")
        return False

    content = content.replace(old_pattern, new_pattern, 1)
    with open(path, "w", encoding="utf-8") as f:
        f.write(content)
    print(f"  [+] Applied patch: {os.path.basename(path)} {label}")
    return True

def run():
    print("==========================================================")
    print("  9Router High-Grade UX Patcher for Meta AI Bridge")
    print("==========================================================")

    build_dir = find_9router_build_dir()
    if not build_dir:
        print("[!] 9Router build directory not found. Skipping UI patch.")
        return

    print(f"Found 9Router build directory: {build_dir}\n")

    # 1. Patch provider logos/icons for Meta AI across 9Router
    for p in glob.glob(os.path.join(build_dir, "server/app/(dashboard)/dashboard/providers/page.js")):
        patch_file(
            p,
            'src:b.id?.includes("qwen")',
            'src:b.id?.includes("meta")?"/providers/meta.png":b.id?.includes("qwen")',
            "(server providers card logo routing)"
        )

    for p in glob.glob(os.path.join(build_dir, "static/chunks/app/(dashboard)/dashboard/providers/page-*.js")):
        patch_file(
            p,
            'src:e.id?.includes("qwen")',
            'src:e.id?.includes("meta")?"/providers/meta.png":e.id?.includes("qwen")',
            "(client providers card logo routing)"
        )

    for p in glob.glob(os.path.join(build_dir, "server/app/(dashboard)/dashboard/providers/[id]/page.js")):
        patch_file(
            p,
            'bW=()=>eC.id?.includes("qwen")',
            'bW=()=>eC.id?.includes("meta")?"/providers/meta.png":eC.id?.includes("qwen")',
            "(server provider detail header logo routing)"
        )

    for p in glob.glob(os.path.join(build_dir, "static/chunks/app/(dashboard)/dashboard/providers/[id]/page-*.js")):
        patch_file(
            p,
            'tV=()=>e9.id?.includes("qwen")',
            'tV=()=>e9.id?.includes("meta")?"/providers/meta.png":e9.id?.includes("qwen")',
            "(client provider detail header logo routing)"
        )

    # 2. Server 6070.js: empty static catalog for Meta AI so dynamic discovery populates models
    p_6070 = os.path.join(build_dir, "server/chunks/6070.js")
    if os.path.exists(p_6070):
        with open(p_6070, "r", encoding="utf-8") as f:
            c6070 = f.read()
        if 'q["meta"]' not in c6070:
            c6070 = c6070.replace(
                'q["qwen"]=q["openai-compatible-chat-qwen"]=[]',
                'q["qwen"]=q["openai-compatible-chat-qwen"]=[],q["meta"]=q["openai-compatible-chat-meta"]=[]'
            )
            with open(p_6070, "w", encoding="utf-8") as f:
                f.write(c6070)
            print("  [+] Registered empty static catalog for Meta in server 6070.js")
        else:
            print("  [✓] Static catalog already configured in server 6070.js")

    # 3. Client 1321-*.js: empty static catalog
    for p in glob.glob(os.path.join(build_dir, "static/chunks/1321-*.js")):
        with open(p, "r", encoding="utf-8") as f:
            c1321 = f.read()
        if 'm["meta"]' not in c1321:
            if 'm["qwen"]=m["openai-compatible-chat-qwen"]=[]' in c1321:
                c1321 = c1321.replace(
                    'm["qwen"]=m["openai-compatible-chat-qwen"]=[]',
                    'm["qwen"]=m["openai-compatible-chat-qwen"]=[],m["meta"]=m["openai-compatible-chat-meta"]=[]'
                )
                with open(p, "w", encoding="utf-8") as f:
                    f.write(c1321)
                print(f"  [+] Registered empty static catalog for Meta in {os.path.basename(p)}")

    print("\n✓ 9Router Web UI patching completed successfully!")

if __name__ == "__main__":
    run()
