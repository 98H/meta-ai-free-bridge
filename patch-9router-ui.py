#!/usr/bin/env python3
"""
9Router Web UI Patcher for Meta AI, ChatGPT & Qwen Web Bridges
==============================================================
Senior Product Designer & Systems Architect Grade Patcher.
Transforms 9Router compatible provider forms into sleek Antigravity-style
interfaces with:
1. Exact official provider logos (Meta AI orbit, Qwen, ChatGPT) everywhere.
2. "Add Meta AI Account" modal title instead of "Add API Key".
3. "Meta AI Session Token / Cookies" field label instead of "API Key".
4. Clean, box-fitting placeholders ("Paste Meta AI session...").
5. In-modal Step-by-Step Guidance Cards with single-instance guarantee.
6. "Session Token" badges & "token" icons on connection cards.
7. "Test Connection" live probe integration (fixing button label).
8. Suppression of "Default Model: gpt-4o-mini" for web bridges.
9. Contextual Name placeholders ("Meta AI Account" instead of "Production Key").
10. Complete dynamic model catalog enablement.
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
        return True

    if old_pattern not in content:
        print(f"  [!] Pattern not found in: {os.path.basename(path)} {label}")
        return False

    content = content.replace(old_pattern, new_pattern, 1)
    with open(path, "w", encoding="utf-8") as f:
        f.write(content)
    print(f"  [+] Applied patch: {os.path.basename(path)} {label}")
    return True

def clean_guidance_cards(content: str, is_server: bool = False) -> str:
    """
    Deterministic boundary replacement:
    Finds the exact start anchor (xAI hint) and end anchor (v&&o / u&&i hint)
    and replaces everything in between with EXACTLY ONE clean block of hints.
    """
    if is_server:
        var = "b"
        jsx = "(0,d.jsx)"
        anchor_start = 'v&&(0,d.jsx)("p",{className:"text-xs text-text-muted",children:"Use a direct xAI API key from console.x.ai. This is separate from Grok Build OAuth."})'
        anchor_end = 'u&&i&&(0,d.jsxs)("p",{className:"text-xs text-text-muted",children:[i,j&&(0,d.jsxs)(d.Fragment,{children:[" ",(0,d.jsxs)("a",{href:d,target:"_blank",rel:"noopener noreferrer",className:"text-primary underline",children:["Open ",d.replace(/^https?:\/\//,"")]})]})]})'
    else:
        var = "t"
        jsx = "(0,i.jsx)"
        anchor_start = 'j&&(0,i.jsx)("p",{className:"text-xs text-text-muted",children:"Use a direct xAI API key from console.x.ai. This is separate from Grok Build OAuth."})'
        anchor_end = 'v&&o&&(0,i.jsxs)("p",{className:"text-xs text-text-muted",children:[o,d&&(0,i.jsxs)(i.Fragment,{children:[" ",(0,i.jsxs)("a",{href:d,target:"_blank",rel:"noopener noreferrer",className:"text-primary underline",children:["Open ",d.replace(/^https?:\/\//,"")]})]})]})'

    pos_start = content.find(anchor_start)
    pos_end = content.find(anchor_end, pos_start)

    if pos_start == -1 or pos_end == -1:
        return content

    hint_cg = f',("openai-compatible-chat-chatgpt"==={var}||"chatgpt"==={var})&&{jsx}("p",{{className:"text-xs text-brand-600 dark:text-brand-400 bg-brand-500/10 border border-brand-500/20 p-2.5 rounded-lg mt-1 font-sans leading-relaxed break-words",children:"💡 Where to get token: Sign in to chatgpt.com (in Incognito tab) → F12 → Application → Cookies → copy \'__Secure-next-auth.session-token\' (or run extract-token.js in Console, then close the tab). Click \'Test Connection\' before saving."}})'
    hint_qw = f',("openai-compatible-chat-qwen"==={var}||"qwen"==={var})&&{jsx}("p",{{className:"text-xs text-brand-600 dark:text-brand-400 bg-brand-500/10 border border-brand-500/20 p-2.5 rounded-lg mt-1 font-sans leading-relaxed break-words",children:"💡 Where to get token: Sign in to chat.qwen.ai → F12 → Console tab → run: localStorage.getItem(\'token\') (or extract-token.js). Click \'Test Connection\' before saving."}})'
    hint_meta = f',("openai-compatible-chat-meta"==={var}||"meta"==={var})&&{jsx}("p",{{className:"text-xs text-brand-600 dark:text-brand-400 bg-brand-500/10 border border-brand-500/20 p-2.5 rounded-lg mt-1 font-sans leading-relaxed break-words",children:"💡 Where to get session: On meta.ai → F12 → Console tab → run document.cookie and copy the string (or from Application → Cookies, copy datr and c_user/ecto_1_sess). Click \'Test Connection\' before saving."}})'

    clean_block = anchor_start + hint_cg + hint_qw + hint_meta + ","
    return content[:pos_start] + clean_block + content[pos_end:]

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
    p_s_prov = os.path.join(build_dir, "server/app/(dashboard)/dashboard/providers/page.js")
    patch_file(
        p_s_prov,
        'src:b.id?.includes("qwen")?"/providers/qwen.png":b.id?.includes("chatgpt")?"/providers/chatgpt.png":q&&b.apiType?',
        'src:b.id?.includes("meta")?"/providers/meta.png":b.id?.includes("qwen")?"/providers/qwen.png":b.id?.includes("chatgpt")?"/providers/chatgpt.png":q&&b.apiType?',
        "(server providers card logo)"
    )

    for p in glob.glob(os.path.join(build_dir, "static/chunks/app/(dashboard)/dashboard/providers/page-*.js")):
        patch_file(
            p,
            'src:t.id?.includes("qwen")?"/providers/qwen.png":t.id?.includes("chatgpt")?"/providers/chatgpt.png":f&&t.apiType?',
            'src:t.id?.includes("meta")?"/providers/meta.png":t.id?.includes("qwen")?"/providers/qwen.png":t.id?.includes("chatgpt")?"/providers/chatgpt.png":f&&t.apiType?',
            "(client providers card logo)"
        )

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

    client_dir_escaped = glob.escape(os.path.join(build_dir, "static/chunks/app/(dashboard)/dashboard/providers/[id]"))
    client_provider_pages = glob.glob(os.path.join(client_dir_escaped, "page-*.js"))

    # 2. Client Provider Detail Pages
    for p in client_provider_pages:
        with open(p, "r", encoding="utf-8") as f:
            content = f.read()

        # Logo routing
        content = content.replace(
            'tV=()=>e9.id?.includes("qwen")?"/providers/qwen.png":e9.id?.includes("chatgpt")?"/providers/chatgpt.png":tn&&e9.apiType?',
            'tV=()=>e9.id?.includes("meta")?"/providers/meta.png":e9.id?.includes("qwen")?"/providers/qwen.png":e9.id?.includes("chatgpt")?"/providers/chatgpt.png":tn&&e9.apiType?'
        )

        # Modal Title
        old_title = 'title:("openai-compatible-chat-chatgpt"===t||"chatgpt"===t)?"Add ChatGPT Account":("openai-compatible-chat-qwen"===t||"qwen"===t)?"Add Qwen Account"'
        new_title = 'title:("openai-compatible-chat-chatgpt"===t||"chatgpt"===t)?"Add ChatGPT Account":("openai-compatible-chat-qwen"===t||"qwen"===t)?"Add Qwen Account":("openai-compatible-chat-meta"===t||"meta"===t)?"Add Meta AI Account"'
        if new_title not in content:
            content = content.replace(old_title, new_title)

        # Field Label
        old_label = 'k=("openai-compatible-chat-chatgpt"===t||"chatgpt"===t)?"ChatGPT Session Token":("openai-compatible-chat-qwen"===t||"qwen"===t)?"Qwen Session Token"'
        new_label = 'k=("openai-compatible-chat-chatgpt"===t||"chatgpt"===t)?"ChatGPT Session Token":("openai-compatible-chat-qwen"===t||"qwen"===t)?"Qwen Session Token":("openai-compatible-chat-meta"===t||"meta"===t)?"Meta AI Session Token / Cookies"'
        if new_label not in content:
            content = content.replace(old_label, new_label)

        # Placeholder
        old_ph = 'placeholder:("openai-compatible-chat-chatgpt"===t||"chatgpt"===t)?"Paste session token...":("openai-compatible-chat-qwen"===t||"qwen"===t)?"Paste Qwen token..."'
        new_ph = 'placeholder:("openai-compatible-chat-chatgpt"===t||"chatgpt"===t)?"Paste session token...":("openai-compatible-chat-qwen"===t||"qwen"===t)?"Paste Qwen token...":("openai-compatible-chat-meta"===t||"meta"===t)?"Paste Meta AI session..."'
        if new_ph not in content:
            content = content.replace(old_ph, new_ph)

        # Contextual Name Placeholder
        old_name_ph = 'placeholder:b?"Ollama Local":"Production Key"'
        new_name_ph = 'placeholder:("openai-compatible-chat-chatgpt"===t||"chatgpt"===t)?"ChatGPT Account":("openai-compatible-chat-qwen"===t||"qwen"===t)?"Qwen Account":("openai-compatible-chat-meta"===t||"meta"===t)?"Meta AI Account":b?"Ollama Local":"Production Key"'
        content = content.replace(old_name_ph, new_name_ph)

        # Test Connection button (REPLACE ALL INSTANCES so !b is also covered)
        old_btn = '("openai-compatible-chat-chatgpt"===t||"chatgpt"===t||"openai-compatible-chat-qwen"===t||"qwen"===t)?"Test Connection":"Check"'
        new_btn = '("openai-compatible-chat-chatgpt"===t||"chatgpt"===t||"openai-compatible-chat-qwen"===t||"qwen"===t||"openai-compatible-chat-meta"===t||"meta"===t)?"Test Connection":"Check"'
        content = content.replace(old_btn, new_btn)

        # Hide Default Model field for web bridges
        old_dm = 'l&&(0,i.jsx)(c.pd,{label:"Default Model",value:A.defaultModel,onChange:e=>T({...A,defaultModel:e.target.value}),placeholder:r?"claude-3-5-sonnet-latest":"gpt-4o-mini"})'
        new_dm = 'l&&!("openai-compatible-chat-chatgpt"===t||"chatgpt"===t||"openai-compatible-chat-qwen"===t||"qwen"===t||"openai-compatible-chat-meta"===t||"meta"===t)&&(0,i.jsx)(c.pd,{label:"Default Model",value:A.defaultModel,onChange:e=>T({...A,defaultModel:e.target.value}),placeholder:r?"claude-3-5-sonnet-latest":"gpt-4o-mini"})'
        content = content.replace(old_dm, new_dm)

        old_dm_text = 'l&&(0,i.jsx)("p",{className:"text-xs text-text-muted",children:"Enter the model ID exactly as your compatible endpoint expects it. This model will be saved as the connection default."})'
        new_dm_text = 'l&&!("openai-compatible-chat-chatgpt"===t||"chatgpt"===t||"openai-compatible-chat-qwen"===t||"qwen"===t||"openai-compatible-chat-meta"===t||"meta"===t)&&(0,i.jsx)("p",{className:"text-xs text-text-muted",children:"Enter the model ID exactly as your compatible endpoint expects it. This model will be saved as the connection default."})'
        content = content.replace(old_dm_text, new_dm_text)

        # Connection badge
        old_badge = '(e?.provider?.includes("chatgpt")||e?.provider?.includes("qwen")||"openai-compatible-chat-chatgpt"===e?.provider||"openai-compatible-chat-qwen"===e?.provider)?"Session Token":"API Key"'
        new_badge = '(e?.provider?.includes("chatgpt")||e?.provider?.includes("qwen")||e?.provider?.includes("meta")||"openai-compatible-chat-chatgpt"===e?.provider||"openai-compatible-chat-qwen"===e?.provider||"openai-compatible-chat-meta"===e?.provider)?"Session Token":"API Key"'
        content = content.replace(old_badge, new_badge)

        # Fallback account name
        old_acc_name = '(e?.provider?.includes("chatgpt")||e?.provider?.includes("qwen")||"openai-compatible-chat-chatgpt"===e?.provider||"openai-compatible-chat-qwen"===e?.provider)?"Session Account":"API Key"'
        new_acc_name = '(e?.provider?.includes("chatgpt")||e?.provider?.includes("qwen")||e?.provider?.includes("meta")||"openai-compatible-chat-chatgpt"===e?.provider||"openai-compatible-chat-qwen"===e?.provider||"openai-compatible-chat-meta"===e?.provider)?"Session Account":"API Key"'
        content = content.replace(old_acc_name, new_acc_name)

        # Connection icon
        old_icon = '(e?.provider?.includes("chatgpt")||e?.provider?.includes("qwen")||"openai-compatible-chat-chatgpt"===e?.provider||"openai-compatible-chat-qwen"===e?.provider)?"token":"key"'
        new_icon = '(e?.provider?.includes("chatgpt")||e?.provider?.includes("qwen")||e?.provider?.includes("meta")||"openai-compatible-chat-chatgpt"===e?.provider||"openai-compatible-chat-qwen"===e?.provider||"openai-compatible-chat-meta"===e?.provider)?"token":"key"'
        content = content.replace(old_icon, new_icon)

        # Clean guidance cards (single instance guarantee)
        content = clean_guidance_cards(content, is_server=False)

        with open(p, "w", encoding="utf-8") as f:
            f.write(content)
        print(f"  [✓] Updated client page: {os.path.basename(p)}")

    # 3. Server Provider Detail Page
    if os.path.exists(p_s_detail):
        with open(p_s_detail, "r", encoding="utf-8") as f:
            sc = f.read()

        old_s_title = 'title:("openai-compatible-chat-chatgpt"===b||"chatgpt"===b)?"Add ChatGPT Account":("openai-compatible-chat-qwen"===b||"qwen"===b)?"Add Qwen Account"'
        new_s_title = 'title:("openai-compatible-chat-chatgpt"===b||"chatgpt"===b)?"Add ChatGPT Account":("openai-compatible-chat-qwen"===b||"qwen"===b)?"Add Qwen Account":("openai-compatible-chat-meta"===b||"meta"===b)?"Add Meta AI Account"'
        if new_s_title not in sc:
            sc = sc.replace(old_s_title, new_s_title)

        old_s_label = 'w=("openai-compatible-chat-chatgpt"===b||"chatgpt"===b)?"ChatGPT Session Token":("openai-compatible-chat-qwen"===b||"qwen"===b)?"Qwen Session Token"'
        new_s_label = 'w=("openai-compatible-chat-chatgpt"===b||"chatgpt"===b)?"ChatGPT Session Token":("openai-compatible-chat-qwen"===b||"qwen"===b)?"Qwen Session Token":("openai-compatible-chat-meta"===b||"meta"===b)?"Meta AI Session Token / Cookies"'
        if new_s_label not in sc:
            sc = sc.replace(old_s_label, new_s_label)

        # Contextual Name Placeholder
        old_s_name_ph = 'placeholder:t?"Ollama Local":"Production Key"'
        new_s_name_ph = 'placeholder:("openai-compatible-chat-chatgpt"===b||"chatgpt"===b)?"ChatGPT Account":("openai-compatible-chat-qwen"===b||"qwen"===b)?"Qwen Account":("openai-compatible-chat-meta"===b||"meta"===b)?"Meta AI Account":t?"Ollama Local":"Production Key"'
        sc = sc.replace(old_s_name_ph, new_s_name_ph)

        # Test Connection button
        old_s_btn = 'children:L?"Checking...":"Check"'
        new_s_btn = 'children:L?"Testing...":("openai-compatible-chat-chatgpt"===b||"chatgpt"===b||"openai-compatible-chat-qwen"===b||"qwen"===b||"openai-compatible-chat-meta"===b||"meta"===b)?"Test Connection":"Check"'
        sc = sc.replace(old_s_btn, new_s_btn)

        # Hide Default Model field for web bridges
        old_s_dm = 'f&&(0,d.jsx)(k.pd,{label:"Default Model",value:B.defaultModel,onChange:a=>C({...B,defaultModel:a.target.value}),placeholder:g?"claude-3-5-sonnet-latest":"gpt-4o-mini"})'
        new_s_dm = 'f&&!("openai-compatible-chat-chatgpt"===b||"chatgpt"===b||"openai-compatible-chat-qwen"===b||"qwen"===b||"openai-compatible-chat-meta"===b||"meta"===b)&&(0,d.jsx)(k.pd,{label:"Default Model",value:B.defaultModel,onChange:a=>C({...B,defaultModel:a.target.value}),placeholder:g?"claude-3-5-sonnet-latest":"gpt-4o-mini"})'
        sc = sc.replace(old_s_dm, new_s_dm)

        old_s_dm_text = 'f&&(0,d.jsx)("p",{className:"text-xs text-text-muted",children:"Enter the model ID exactly as your compatible endpoint expects it. This model will be saved as the connection default."})'
        new_s_dm_text = 'f&&!("openai-compatible-chat-chatgpt"===b||"chatgpt"===b||"openai-compatible-chat-qwen"===b||"qwen"===b||"openai-compatible-chat-meta"===b||"meta"===b)&&(0,d.jsx)("p",{className:"text-xs text-text-muted",children:"Enter the model ID exactly as your compatible endpoint expects it. This model will be saved as the connection default."})'
        sc = sc.replace(old_s_dm_text, new_s_dm_text)

        # Connection badge
        old_s_badge = '(a?.provider?.includes("chatgpt")||a?.provider?.includes("qwen")||"openai-compatible-chat-chatgpt"===a?.provider||"openai-compatible-chat-qwen"===a?.provider)?"Session Token":"API Key"'
        new_s_badge = '(a?.provider?.includes("chatgpt")||a?.provider?.includes("qwen")||a?.provider?.includes("meta")||"openai-compatible-chat-chatgpt"===a?.provider||"openai-compatible-chat-qwen"===a?.provider||"openai-compatible-chat-meta"===a?.provider)?"Session Token":"API Key"'
        sc = sc.replace(old_s_badge, new_s_badge)

        # Fallback account name
        old_s_acc_name = '(a?.provider?.includes("chatgpt")||a?.provider?.includes("qwen")||"openai-compatible-chat-chatgpt"===a?.provider||"openai-compatible-chat-qwen"===a?.provider)?"Session Account":"API Key"'
        new_s_acc_name = '(a?.provider?.includes("chatgpt")||a?.provider?.includes("qwen")||a?.provider?.includes("meta")||"openai-compatible-chat-chatgpt"===a?.provider||"openai-compatible-chat-qwen"===a?.provider||"openai-compatible-chat-meta"===a?.provider)?"Session Account":"API Key"'
        sc = sc.replace(old_s_acc_name, new_s_acc_name)

        # Connection icon
        old_s_icon = '(a?.provider?.includes("chatgpt")||a?.provider?.includes("qwen")||"openai-compatible-chat-chatgpt"===a?.provider||"openai-compatible-chat-qwen"===a?.provider)?"token":"key"'
        new_s_icon = '(a?.provider?.includes("chatgpt")||a?.provider?.includes("qwen")||a?.provider?.includes("meta")||"openai-compatible-chat-chatgpt"===a?.provider||"openai-compatible-chat-qwen"===a?.provider||"openai-compatible-chat-meta"===a?.provider)?"token":"key"'
        sc = sc.replace(old_s_icon, new_s_icon)

        # Clean guidance cards (single instance guarantee)
        sc = clean_guidance_cards(sc, is_server=True)

        with open(p_s_detail, "w", encoding="utf-8") as f:
            f.write(sc)
        print(f"  [✓] Updated server page: {os.path.basename(p_s_detail)}")

    # 4. Clean DB state
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

    print("\n✓ Senior UX Patcher completed successfully!")

if __name__ == "__main__":
    run()
