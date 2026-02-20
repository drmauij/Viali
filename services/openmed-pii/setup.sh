#!/usr/bin/env bash
# OpenMed PII Sidecar — VPS Setup Script
# Run as root or with sudo on the target VPS.

set -euo pipefail

SERVICE_DIR="/opt/openmed-pii"
VENV_DIR="$SERVICE_DIR/venv"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

echo "==> Creating service directory..."
mkdir -p "$SERVICE_DIR"

echo "==> Setting up Python virtual environment..."
python3 -m venv "$VENV_DIR"

echo "==> Installing dependencies..."
"$VENV_DIR/bin/pip" install --upgrade pip
"$VENV_DIR/bin/pip" install -r "$SCRIPT_DIR/requirements.txt"

echo "==> Copying application files..."
cp "$SCRIPT_DIR/main.py" "$SERVICE_DIR/main.py"

echo "==> Installing systemd unit..."
cp "$SCRIPT_DIR/openmed-pii.service" /etc/systemd/system/openmed-pii.service
systemctl daemon-reload
systemctl enable openmed-pii

echo "==> Starting service (first run downloads models — may take a few minutes)..."
systemctl start openmed-pii

echo "==> Waiting for health check..."
for i in {1..30}; do
  if curl -sf http://localhost:5050/health > /dev/null 2>&1; then
    echo "==> Service is healthy!"
    curl -s http://localhost:5050/health | python3 -m json.tool
    exit 0
  fi
  sleep 2
done

echo "==> Service did not become healthy within 60s. Check logs:"
echo "    journalctl -u openmed-pii -f"
exit 1
