#!/usr/bin/env bash
set -e

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ACCOUNTS_DIR="$PROJECT_DIR/accounts"
ACCOUNTS_FILE="$PROJECT_DIR/accounts.json"
mkdir -p "$ACCOUNTS_DIR"

echo "=========================================================="
echo "  Meta AI Web Bridge - Account Registration"
echo "=========================================================="
echo ""
echo "💡 Step-by-Step Instructions to Extract Meta AI Session:"
echo "  1. Sign in to https://www.meta.ai in your browser (via Facebook / Instagram / Meta Account)."
echo "  2. Open Developer Tools (F12 or Cmd+Option+I) -> 'Console'."
echo "  3. Paste extract-token.js or copy your session cookies (datr, c_user, ecto_1_sess, etc.)."
echo "  4. Paste the extracted JSON or cookie string below."
echo "=========================================================="
echo ""

read -p "Enter unique account identifier (e.g. meta1, fb_work): " ACC_ID
if [ -z "$ACC_ID" ]; then
    echo "Error: Account identifier cannot be empty."
    exit 1
fi

read -p "Enter friendly account name (e.g. Meta AI Personal): " ACC_NAME
if [ -z "$ACC_NAME" ]; then
    ACC_NAME="Meta Account $ACC_ID"
fi

read -p "Account Tier [free / paid] (default: free): " TIER
TIER=${TIER:-free}

echo ""
echo "Paste session payload (JSON export or cookie string) and press Enter:"
read -s TOKEN
echo ""

if [ -z "$TOKEN" ]; then
    echo "Error: Session token cannot be empty."
    exit 1
fi

STORAGE_PATH="$ACCOUNTS_DIR/${ACC_ID}_storage.json"

echo "Validating token and saving browser session cookies..."
VALIDATION_RES=$(python3 "$PROJECT_DIR/validate_token.py" <<< "{\"token\": $(python3 -c "import json, sys; print(json.dumps('''$TOKEN'''))")}")

python3 - <<EOF
import json, sys

try:
    res = json.loads('''$VALIDATION_RES''')
except Exception:
    res = {}

cookies = res.get('cookies')
if not cookies:
    sys.path.append('$PROJECT_DIR')
    from validate_token import parse_input_cookies
    cookies = parse_input_cookies('''$TOKEN''')

storage = {
    'cookies': cookies,
    'origins': [
        {
            'origin': 'https://www.meta.ai',
            'localStorage': []
        }
    ]
}

with open('$STORAGE_PATH', 'w', encoding='utf-8') as f:
    json.dump(storage, f, indent=2)

if res.get('valid'):
    u = res.get('user', {})
    print(f"✓ Session validated successfully! User: {u.get('name')} ({u.get('email')}) | Plan: {res.get('planType')}")
else:
    print(f"[!] Warning: Validation note: {res.get('error')}. Cookies saved anyway.")
EOF

chmod 600 "$STORAGE_PATH"

python3 - <<EOF
import json, os
path = '$ACCOUNTS_FILE'
accounts = []
if os.path.exists(path):
    try:
        with open(path, 'r', encoding='utf-8') as f:
            accounts = json.load(f)
    except Exception:
        accounts = []

accounts = [a for a in accounts if a.get('id') != '$ACC_ID']
accounts.append({
    'id': '$ACC_ID',
    'name': '$ACC_NAME',
    'tier': '$TIER',
    'storagePath': '$STORAGE_PATH',
    'enabled': True,
    'models': ['muse-spark-1.3', 'muse-spark', 'muse-code', 'muse-glimmer', 'muse-spark-thinking', 'meta-ai', 'auto']
})
with open(path, 'w', encoding='utf-8') as f:
    json.dump(accounts, f, indent=2)
print('✓ Account added to accounts.json successfully!')
EOF

chmod 600 "$ACCOUNTS_FILE"

if command -v systemctl &> /dev/null && systemctl is-active --quiet meta-ai-bridge; then
    systemctl restart meta-ai-bridge
    echo "✓ meta-ai-bridge.service restarted. New account is now ACTIVE in pool!"
else
    echo "✓ Account saved. When bridge runs, it will be included in rotation pool."
fi

echo "=========================================================="
echo "Setup complete! Verify service health with: ./test-bridge.sh"
echo "=========================================================="
