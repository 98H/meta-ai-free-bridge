#!/usr/bin/env bash
set -e

echo "=========================================================="
echo "  Meta AI Web Bridge - Automated Turnkey Installer & Setup"
echo "=========================================================="

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$PROJECT_DIR"

# 1. Check & Install Bun runtime
BUN_BIN="$(which bun 2>/dev/null || echo "$HOME/.bun/bin/bun")"
if [ ! -x "$BUN_BIN" ]; then
    echo "[1/5] Bun runtime not found. Installing Bun..."
    curl -fsSL https://bun.sh/install | bash
    BUN_BIN="$HOME/.bun/bin/bun"
fi

echo "[1/5] Bun runtime ready: $($BUN_BIN --version)"

# 2. Install Project Dependencies
echo "[2/5] Installing project dependencies..."
$BUN_BIN install

# 3. Ensure Playwright Chromium is available
echo "[3/5] Checking Playwright Chromium browser..."
if [ ! -d "$HOME/.cache/ms-playwright" ] && ! command -v google-chrome &> /dev/null; then
    echo "Installing Playwright Chromium engine & system dependencies..."
    $BUN_BIN x playwright install --with-deps chromium
else
    echo "Chromium engine ready."
fi

# 4. Initialize accounts configuration
echo "[4/5] Initializing accounts configuration..."
mkdir -p "$PROJECT_DIR/accounts"
chmod 700 "$PROJECT_DIR/accounts"

if [ ! -f "$PROJECT_DIR/accounts.json" ]; then
    if [ -f "$PROJECT_DIR/accounts.example.json" ]; then
        cp "$PROJECT_DIR/accounts.example.json" "$PROJECT_DIR/accounts.json"
        echo "Created accounts.json from template."
    else
        echo "[]" > "$PROJECT_DIR/accounts.json"
    fi
fi
chmod 600 "$PROJECT_DIR/accounts.json"

# Make scripts executable
chmod +x "$PROJECT_DIR"/*.sh "$PROJECT_DIR"/*.py 2>/dev/null || true

# 5. Systemd Service Setup
if [ "$(id -u)" -eq 0 ]; then
    echo "[5/5] Configuring systemd background service (meta-ai-bridge.service)..."
    SERVICE_FILE="/etc/systemd/system/meta-ai-bridge.service"

    cat <<EOF > "$SERVICE_FILE"
[Unit]
Description=Meta AI Web Bridge for 9Router and OpenAI API
After=network.target

[Service]
Type=simple
User=root
WorkingDirectory=$PROJECT_DIR
ExecStart=$BUN_BIN run server.ts
Restart=always
RestartSec=5
Environment=PORT=17843

[Install]
WantedBy=multi-user.target
EOF

    systemctl daemon-reload
    systemctl enable meta-ai-bridge
    systemctl restart meta-ai-bridge
    echo "✓ Systemd service 'meta-ai-bridge' is now enabled and running on port 17843!"
else
    echo "[5/5] Non-root user detected. To run as systemd service, run as root."
    echo "You can launch the server in foreground using: $BUN_BIN run server.ts"
fi

# 6. Verification
echo "Verifying bridge service..."
sleep 4
if curl -s http://127.0.0.1:17843/healthz | grep -q '"status":"ok"'; then
    echo "✓ Bridge is active and healthy!"
else
    echo "[!] Bridge is starting up."
fi

echo ""
echo "=========================================================="
echo "  Installation Complete!"
echo "  - Add an account:   ./add-account.sh"
echo "  - Register 9Router: ./register-9router.sh"
echo "  - Test endpoint:    ./test-bridge.sh"
echo "=========================================================="
