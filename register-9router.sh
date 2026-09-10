#!/usr/bin/env bash
set -e

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "=========================================================="
echo "  Registering Meta AI Web Bridge in 9Router"
echo "=========================================================="

python3 "$PROJECT_DIR/register_db.py"

# Patch 9Router UI to support Meta AI dynamic models and Add Account modal
if [ -f "$PROJECT_DIR/patch-9router-ui.py" ]; then
    echo "Applying Antigravity-style UI enhancements to 9Router web interface..."
    python3 "$PROJECT_DIR/patch-9router-ui.py" || true
fi

if command -v systemctl &> /dev/null; then
    if systemctl is-active --quiet 9router; then
        echo "Restarting 9router.service to apply changes..."
        systemctl restart 9router
        echo "✓ 9Router restarted successfully."
    fi
fi

echo ""
echo "=========================================================="
echo "✓ Meta AI Web Bridge is now connected to 9Router!"
echo "Model ID prefix in 9Router: openai-compatible-chat-meta/<model>"
echo "Available models: meta/meta-ai, meta/llama-3.3-70b, meta/llama-3.1-405b, meta/meta-ai-thinking, meta/auto"
echo "=========================================================="
