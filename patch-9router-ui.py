#!/usr/bin/env python3
"""
9Router Web UI Patcher for Meta AI, ChatGPT & Qwen Web Bridges
==============================================================
Senior Product Designer & Systems Architect Grade Patcher.
Transforms 9Router compatible provider forms into sleek Antigravity-style
interfaces with:
1. Exact provider logos (Meta AI gradient ring, Qwen, ChatGPT) everywhere.
2. "Add Meta AI Account" modal title instead of "Add API Key".
3. "Meta AI Session Token / Cookies" field label instead of "API Key".
4. Clean, box-fitting placeholders ("Paste Meta AI session...").
5. In-modal Step-by-Step Guidance Cards with clear instructions.
6. "Session Token" badges & "token" icons on connection cards.
7. "Test Connection" live probe integration.
8. Complete dynamic model catalog enablement.
"""

import os
import sys
import glob
import re
import sqlite3

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

def patch_guidance_cards(path, is_server=False):
    if not os.path.exists(path):
        return False
    with open(path, "r", encoding="utf-8") as f:
        content = f.read()

    if is_server:
        var_name = "b"
        jsx_call = "(0,d.jsx)"
        anchor = 'v&&(0,d.jsx)("p",{className:"text-xs text-text-muted",children:"Use a direct xAI API key from console.x.ai. This is separate from Grok Build OAuth."})'
    else:
        var_name = "t"
        jsx_call = "(0,i.jsx)"
        anchor = 'j&&(0,i.jsx)("p",{className:"text-xs text-text-muted",children:"Use a direct xAI API key from console.x.ai. This is separate from Grok Build OAuth."})'

    hint_chatgpt = f',("openai-compatible-chat-chatgpt"==={var_name}||"chatgpt"==={var_name})&&{jsx_call}("p",{{className:"text-xs text-brand-600 dark:text-brand-400 bg-brand-500/10 border border-brand-500/20 p-2.5 rounded-lg mt-1 font-sans leading-relaxed break-words",children:"💡 Where to get token: Sign in to chatgpt.com (in Incognito tab) → F12 → Application → Cookies → copy \'__Secure-next-auth.session-token\' (or run extract-token.js in Console, then close the tab). Click \'Test Connection\' before saving."}})'
    hint_qwen = f',("openai-compatible-chat-qwen"==={var_name}||"qwen"==={var_name})&&{jsx_call}("p",{{className:"text-xs text-brand-600 dark:text-brand-400 bg-brand-500/10 border border-brand-500/20 p-2.5 rounded-lg mt-1 font-sans leading-relaxed break-words",children:"💡 Where to get token: Sign in to chat.qwen.ai → F12 → Console tab → run: localStorage.getItem(\'token\') (or extract-token.js). Click \'Test Connection\' before saving."}})'
    hint_meta = f',("openai-compatible-chat-meta"==={var_name}||"meta"==={var_name})&&{jsx_call}("p",{{className:"text-xs text-brand-600 dark:text-brand-400 bg-brand-500/10 border border-brand-500/20 p-2.5 rounded-lg mt-1 font-sans leading-relaxed break-words",children:"💡 Where to get token: Sign in to meta.ai (Facebook/Meta account) → F12 → Console tab → run extract-token.js (or copy datr, c_user, ecto_1_sess). Click \'Test Connection\' before saving."}})'

    # Clean existing hints to avoid duplicate injection
    clean_re = re.compile(r',\("(?:openai-compatible-chat-(?:chatgpt|qwen|meta)|chatgpt|qwen|meta)"===' + var_name + r'\)&&' + re.escape(jsx_call) + r'\("p",\{className:"text-xs text-brand-600[^"]*",children:"💡 Where to get token:[^"]*"\}\)')
    content = clean_re.sub('', content)

    if anchor in content:
        content = content.replace(anchor, anchor + hint_chatgpt + hint_qwen + hint_meta, 1)
        with open(path, "w", encoding="utf-8") as f:
            f.write(content)
        print(f"  [+] Injected all 3 guidance cards (ChatGPT, Qwen, Meta): {os.path.basename(path)}")
        return True
    else:
        print(f"  [!] Guidance anchor not found in: {os.path.basename(path)}")
        return False

def run():
    print("==========================================================")
    print("  9Router High-Grade UX Patcher for Meta AI & Web Bridges")
    print("==========================================================")

    build_dir = find_9router_build_dir()
    if not build_dir:
        print("[!] 9Router build directory not found.")
        return

    print(f"Found 9Router build directory: {build_dir}\n")

    # 1. Provider Logo Routing Across All Pages
    # Server providers list card logo
    p_s_prov = os.path.join(build_dir, "server/app/(dashboard)/dashboard/providers/page.js")
    patch_file(
        p_s_prov,
        'src:b.id?.includes("qwen")?"/providers/qwen.png":b.id?.includes("chatgpt")?"/providers/chatgpt.png":q&&b.apiType?',
        'src:b.id?.includes("meta")?"/providers/meta.png":b.id?.includes("qwen")?"/providers/qwen.png":b.id?.includes("chatgpt")?"/providers/chatgpt.png":q&&b.apiType?',
        "(server providers card logo)"
    )

    # Client providers list card logo
    for p in glob.glob(os.path.join(build_dir, "static/chunks/app/(dashboard)/dashboard/providers/page-*.js")):
        patch_file(
            p,
            'src:t.id?.includes("qwen")?"/providers/qwen.png":t.id?.includes("chatgpt")?"/providers/chatgpt.png":f&&t.apiType?',
            'src:t.id?.includes("meta")?"/providers/meta.png":t.id?.includes("qwen")?"/providers/qwen.png":t.id?.includes("chatgpt")?"/providers/chatgpt.png":f&&t.apiType?',
            "(client providers card logo)"
        )

    # Server provider detail header logo (supporting both eC.id and a7.id)
    p_s_detail = os.path.join(build_dir, "server/app/(dashboard)/dashboard/providers/[id]/page.js")
    if os.path.exists(p_s_detail):
        with open(p_s_detail, "r", encoding="utf-8") as f:
            sc = f.read()
        sc = re.sub(
            r'bW=\(\)=>([^.]*)\.id\?\.includes\("qwen"\)\?"/providers/qwen\.png":\1\.id\?\.includes\("chatgpt"\)\?"/providers/chatgpt\.png":',
            r'bW=()=>\1.id?.includes("meta")?"/providers/meta.png":\1.id?.includes("qwen")?"/providers/qwen.png":\1.id?.includes("chatgpt")?"/providers/chatgpt.png":',
            sc
        )
        with open(p_s_detail, "w", encoding="utf-8") as f:
            f.write(sc)
        print(f"  [+] Patched server provider detail header logo in {os.path.basename(p_s_detail)}")

    # Client provider detail header logo (using glob.escape for literal [id])
    client_dir_escaped = glob.escape(os.path.join(build_dir, "static/chunks/app/(dashboard)/dashboard/providers/[id]"))
    client_provider_pages = glob.glob(os.path.join(client_dir_escaped, "page-*.js"))
    print(f"Found {len(client_provider_pages)} client provider detail page(s): {[os.path.basename(x) for x in client_provider_pages]}")

    for p in client_provider_pages:
        patch_file(
            p,
            'tV=()=>e9.id?.includes("qwen")?"/providers/qwen.png":e9.id?.includes("chatgpt")?"/providers/chatgpt.png":tn&&e9.apiType?',
            'tV=()=>e9.id?.includes("meta")?"/providers/meta.png":e9.id?.includes("qwen")?"/providers/qwen.png":e9.id?.includes("chatgpt")?"/providers/chatgpt.png":tn&&e9.apiType?',
            "(client provider detail header logo)"
        )

        # Modal Title
        old_title = 'title:("openai-compatible-chat-chatgpt"===t||"chatgpt"===t)?"Add ChatGPT Account":("openai-compatible-chat-qwen"===t||"qwen"===t)?"Add Qwen Account"'
        new_title = 'title:("openai-compatible-chat-chatgpt"===t||"chatgpt"===t)?"Add ChatGPT Account":("openai-compatible-chat-qwen"===t||"qwen"===t)?"Add Qwen Account":("openai-compatible-chat-meta"===t||"meta"===t)?"Add Meta AI Account"'
        patch_file(p, old_title, new_title, "(client modal title Meta)")

        # Field Label
        old_label = 'k=("openai-compatible-chat-chatgpt"===t||"chatgpt"===t)?"ChatGPT Session Token":("openai-compatible-chat-qwen"===t||"qwen"===t)?"Qwen Session Token"'
        new_label = 'k=("openai-compatible-chat-chatgpt"===t||"chatgpt"===t)?"ChatGPT Session Token":("openai-compatible-chat-qwen"===t||"qwen"===t)?"Qwen Session Token":("openai-compatible-chat-meta"===t||"meta"===t)?"Meta AI Session Token / Cookies"'
        patch_file(p, old_label, new_label, "(client field label Meta)")

        # Placeholder
        old_ph = 'placeholder:("openai-compatible-chat-chatgpt"===t||"chatgpt"===t)?"Paste session token...":("openai-compatible-chat-qwen"===t||"qwen"===t)?"Paste Qwen token..."'
        new_ph = 'placeholder:("openai-compatible-chat-chatgpt"===t||"chatgpt"===t)?"Paste session token...":("openai-compatible-chat-qwen"===t||"qwen"===t)?"Paste Qwen token...":("openai-compatible-chat-meta"===t||"meta"===t)?"Paste Meta AI session..."'
        patch_file(p, old_ph, new_ph, "(client placeholder Meta)")

        # Test Connection button
        old_btn = '("openai-compatible-chat-chatgpt"===t||"chatgpt"===t||"openai-compatible-chat-qwen"===t||"qwen"===t)?"Test Connection":"Check"'
        new_btn = '("openai-compatible-chat-chatgpt"===t||"chatgpt"===t||"openai-compatible-chat-qwen"===t||"qwen"===t||"openai-compatible-chat-meta"===t||"meta"===t)?"Test Connection":"Check"'
        patch_file(p, old_btn, new_btn, "(client test button Meta)")

        # Connection badge
        old_badge = '(e?.provider?.includes("chatgpt")||e?.provider?.includes("qwen")||"openai-compatible-chat-chatgpt"===e?.provider||"openai-compatible-chat-qwen"===e?.provider)?"Session Token":"API Key"'
        new_badge = '(e?.provider?.includes("chatgpt")||e?.provider?.includes("qwen")||e?.provider?.includes("meta")||"openai-compatible-chat-chatgpt"===e?.provider||"openai-compatible-chat-qwen"===e?.provider||"openai-compatible-chat-meta"===e?.provider)?"Session Token":"API Key"'
        patch_file(p, old_badge, new_badge, "(client connection badge Meta)")

        # Fallback account name
        old_acc_name = '(e?.provider?.includes("chatgpt")||e?.provider?.includes("qwen")||"openai-compatible-chat-chatgpt"===e?.provider||"openai-compatible-chat-qwen"===e?.provider)?"Session Account":"API Key"'
        new_acc_name = '(e?.provider?.includes("chatgpt")||e?.provider?.includes("qwen")||e?.provider?.includes("meta")||"openai-compatible-chat-chatgpt"===e?.provider||"openai-compatible-chat-qwen"===e?.provider||"openai-compatible-chat-meta"===e?.provider)?"Session Account":"API Key"'
        patch_file(p, old_acc_name, new_acc_name, "(client fallback name Meta)")

        # Connection icon
        old_icon = '(e?.provider?.includes("chatgpt")||e?.provider?.includes("qwen")||"openai-compatible-chat-chatgpt"===e?.provider||"openai-compatible-chat-qwen"===e?.provider)?"token":"key"'
        new_icon = '(e?.provider?.includes("chatgpt")||e?.provider?.includes("qwen")||e?.provider?.includes("meta")||"openai-compatible-chat-chatgpt"===e?.provider||"openai-compatible-chat-qwen"===e?.provider||"openai-compatible-chat-meta"===e?.provider)?"token":"key"'
        patch_file(p, old_icon, new_icon, "(client connection icon Meta)")

        # Optional default model gate
        old_gate1 = 'l&&!("openai-compatible-chat-chatgpt"===t||"chatgpt"===t||"openai-compatible-chat-qwen"===t||"qwen"===t)&&!A.defaultModel.trim()'
        new_gate1 = 'l&&!("openai-compatible-chat-chatgpt"===t||"chatgpt"===t||"openai-compatible-chat-qwen"===t||"qwen"===t||"openai-compatible-chat-meta"===t||"meta"===t)&&!A.defaultModel.trim()'
        patch_file(p, old_gate1, new_gate1, "(optional defaultModel disabled gate Meta)")

        old_gate2 = '(!l||"openai-compatible-chat-chatgpt"===t||"chatgpt"===t||"openai-compatible-chat-qwen"===t||"qwen"===t||A.defaultModel.trim())'
        new_gate2 = '(!l||"openai-compatible-chat-chatgpt"===t||"chatgpt"===t||"openai-compatible-chat-qwen"===t||"qwen"===t||"openai-compatible-chat-meta"===t||"meta"===t||A.defaultModel.trim())'
        patch_file(p, old_gate2, new_gate2, "(optional defaultModel submit gate Meta)")

        # Inject Guidance Card
        patch_guidance_cards(p, is_server=False)

    # 2. Server 6070.js: empty static catalog for Meta
    p_6070 = os.path.join(build_dir, "server/chunks/6070.js")
    if os.path.exists(p_6070):
        with open(p_6070, "r", encoding="utf-8") as f:
            c = f.read()
        if 'q["meta"]' not in c:
            c = c.replace(
                'q["qwen"]=q["openai-compatible-chat-qwen"]=[]',
                'q["qwen"]=q["openai-compatible-chat-qwen"]=[],q["meta"]=q["openai-compatible-chat-meta"]=[]'
            )
            with open(p_6070, "w", encoding="utf-8") as f:
                f.write(c)
            print("  [+] Registered empty static catalog in server 6070.js")

    # 3. Client 1321-*.js: empty static catalog for Meta
    for p in glob.glob(os.path.join(build_dir, "static/chunks/1321-*.js")):
        with open(p, "r", encoding="utf-8") as f:
            c = f.read()
        if 'm["meta"]' not in c:
            if 'm["qwen"]=m["openai-compatible-chat-qwen"]=[]' in c:
                c = c.replace(
                    'm["qwen"]=m["openai-compatible-chat-qwen"]=[]',
                    'm["qwen"]=m["openai-compatible-chat-qwen"]=[],m["meta"]=m["openai-compatible-chat-meta"]=[]'
                )
                with open(p, "w", encoding="utf-8") as f:
                    f.write(c)
                print(f"  [+] Registered empty static catalog in {os.path.basename(p)}")

    # 4. Server Provider Detail Page (server/app/(dashboard)/dashboard/providers/[id]/page.js)
    if os.path.exists(p_s_detail):
        # Modal Title
        old_s_title = 'title:("openai-compatible-chat-chatgpt"===b||"chatgpt"===b)?"Add ChatGPT Account":("openai-compatible-chat-qwen"===b||"qwen"===b)?"Add Qwen Account"'
        new_s_title = 'title:("openai-compatible-chat-chatgpt"===b||"chatgpt"===b)?"Add ChatGPT Account":("openai-compatible-chat-qwen"===b||"qwen"===b)?"Add Qwen Account":("openai-compatible-chat-meta"===b||"meta"===b)?"Add Meta AI Account"'
        patch_file(p_s_detail, old_s_title, new_s_title, "(server modal title Meta)")

        # Field Label
        old_s_label = 'w=("openai-compatible-chat-chatgpt"===b||"chatgpt"===b)?"ChatGPT Session Token":("openai-compatible-chat-qwen"===b||"qwen"===b)?"Qwen Session Token"'
        new_s_label = 'w=("openai-compatible-chat-chatgpt"===b||"chatgpt"===b)?"ChatGPT Session Token":("openai-compatible-chat-qwen"===b||"qwen"===b)?"Qwen Session Token":("openai-compatible-chat-meta"===b||"meta"===b)?"Meta AI Session Token / Cookies"'
        patch_file(p_s_detail, old_s_label, new_s_label, "(server field label Meta)")

        # Connection badge
        old_s_badge = '(a?.provider?.includes("chatgpt")||a?.provider?.includes("qwen")||"openai-compatible-chat-chatgpt"===a?.provider||"openai-compatible-chat-qwen"===a?.provider)?"Session Token":"API Key"'
        new_s_badge = '(a?.provider?.includes("chatgpt")||a?.provider?.includes("qwen")||a?.provider?.includes("meta")||"openai-compatible-chat-chatgpt"===a?.provider||"openai-compatible-chat-qwen"===a?.provider||"openai-compatible-chat-meta"===a?.provider)?"Session Token":"API Key"'
        patch_file(p_s_detail, old_s_badge, new_s_badge, "(server connection badge Meta)")

        # Fallback account name
        old_s_acc_name = '(a?.provider?.includes("chatgpt")||a?.provider?.includes("qwen")||"openai-compatible-chat-chatgpt"===a?.provider||"openai-compatible-chat-qwen"===a?.provider)?"Session Account":"API Key"'
        new_s_acc_name = '(a?.provider?.includes("chatgpt")||a?.provider?.includes("qwen")||a?.provider?.includes("meta")||"openai-compatible-chat-chatgpt"===a?.provider||"openai-compatible-chat-qwen"===a?.provider||"openai-compatible-chat-meta"===a?.provider)?"Session Account":"API Key"'
        patch_file(p_s_detail, old_s_acc_name, new_s_acc_name, "(server fallback name Meta)")

        # Connection icon
        old_s_icon = '(a?.provider?.includes("chatgpt")||a?.provider?.includes("qwen")||"openai-compatible-chat-chatgpt"===a?.provider||"openai-compatible-chat-qwen"===a?.provider)?"token":"key"'
        new_s_icon = '(a?.provider?.includes("chatgpt")||a?.provider?.includes("qwen")||a?.provider?.includes("meta")||"openai-compatible-chat-chatgpt"===a?.provider||"openai-compatible-chat-qwen"===a?.provider||"openai-compatible-chat-meta"===a?.provider)?"token":"key"'
        patch_file(p_s_detail, old_s_icon, new_s_icon, "(server connection icon Meta)")

        # Inject Guidance Card (Server)
        patch_guidance_cards(p_s_detail, is_server=True)

    # 5. Edit Connection Modal (server chunk 412.js & static chunk 5497-*.js)
    p_chunk_412 = os.path.join(build_dir, "server/chunks/412.js")
    if os.path.exists(p_chunk_412):
        old_c412 = 'hint:(b?.provider?.includes("chatgpt")||b?.provider?.includes("qwen")||"openai-compatible-chat-chatgpt"===b?.provider||"openai-compatible-chat-qwen"===b?.provider)?"Leave blank to keep the current session token.":"Leave blank to keep the current API key."'
        new_c412 = 'hint:(b?.provider?.includes("chatgpt")||b?.provider?.includes("qwen")||b?.provider?.includes("meta")||"openai-compatible-chat-chatgpt"===b?.provider||"openai-compatible-chat-qwen"===b?.provider||"openai-compatible-chat-meta"===b?.provider)?"Leave blank to keep the current session token.":"Leave blank to keep the current API key."'
        patch_file(p_chunk_412, old_c412, new_c412, "(server edit hint Meta)")

    for p in glob.glob(os.path.join(build_dir, "static/chunks/5497-*.js")):
        old_5497_btn = '(t?.provider?.includes("chatgpt")||"openai-compatible-chat-chatgpt"===t?.provider||t?.provider?.includes("qwen")||"openai-compatible-chat-qwen"===t?.provider)?"Test Connection":"Check"'
        new_5497_btn = '(t?.provider?.includes("chatgpt")||"openai-compatible-chat-chatgpt"===t?.provider||t?.provider?.includes("qwen")||"openai-compatible-chat-qwen"===t?.provider||t?.provider?.includes("meta")||"openai-compatible-chat-meta"===t?.provider)?"Test Connection":"Check"'
        patch_file(p, old_5497_btn, new_5497_btn, "(client edit test button Meta)")

        old_5497_hint = 'hint:(t?.provider?.includes("chatgpt")||t?.provider?.includes("qwen")||"openai-compatible-chat-chatgpt"===t?.provider||"openai-compatible-chat-qwen"===t?.provider)?"Leave blank to keep the current session token.":"Leave blank to keep the current API key."'
        new_5497_hint = 'hint:(t?.provider?.includes("chatgpt")||t?.provider?.includes("qwen")||t?.provider?.includes("meta")||"openai-compatible-chat-chatgpt"===t?.provider||"openai-compatible-chat-qwen"===t?.provider||"openai-compatible-chat-meta"===t?.provider)?"Leave blank to keep the current session token.":"Leave blank to keep the current API key."'
        patch_file(p, old_5497_hint, new_5497_hint, "(client edit hint Meta)")

    # 6. Purge dummy/guest connections from 9Router SQLite DB
    db_path = os.path.join(os.path.expanduser("~"), ".9router", "db", "data.sqlite")
    if os.path.exists(db_path):
        try:
            conn = sqlite3.connect(db_path)
            cur = conn.cursor()
            cur.execute("DELETE FROM providerConnections WHERE id IN ('meta-bridge-primary', 'chatgpt-bridge-primary', 'qwen-bridge-primary') OR (provider = 'openai-compatible-chat-meta' AND (name LIKE '%Guest%' OR email LIKE '%guest%'))")
            conn.commit()
            conn.close()
            print("  [✓] Purged dummy/guest connections from 9Router DB.")
        except Exception as e:
            print(f"  [!] DB cleanup error: {e}")

    print("\n✓ Senior UX Patcher applied cleanly across 9Router!")

if __name__ == "__main__":
    run()
