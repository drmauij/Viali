#!/bin/bash
# Viali Camera Capture - Raspberry Pi Installation Script
# Run this script on your Raspberry Pi to set up automatic camera capture

set -e

echo "============================================"
echo "Viali Camera Capture Installation"
echo "============================================"
echo ""

# Check if running on Raspberry Pi
if [ ! -f /proc/device-tree/model ]; then
    echo "Warning: This doesn't appear to be a Raspberry Pi"
    read -p "Continue anyway? (y/n) " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        exit 1
    fi
fi

# Create installation directory
INSTALL_DIR="/home/pi/camera-capture"
echo "Creating installation directory: $INSTALL_DIR"
mkdir -p "$INSTALL_DIR"

# Copy files
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
echo "Copying files..."
cp "$SCRIPT_DIR/capture.py" "$INSTALL_DIR/"
cp "$SCRIPT_DIR/config.env.template" "$INSTALL_DIR/"

# Check if config already exists
if [ ! -f "$INSTALL_DIR/config.env" ]; then
    cp "$SCRIPT_DIR/config.env.template" "$INSTALL_DIR/config.env"
    # Set restrictive permissions on config file (contains S3 credentials)
    chmod 600 "$INSTALL_DIR/config.env"
    echo ""
    echo "IMPORTANT: Edit $INSTALL_DIR/config.env with your settings!"
    echo ""
else
    # Ensure existing config has proper permissions
    chmod 600 "$INSTALL_DIR/config.env"
fi

# Set restrictive permissions on log file
touch "$INSTALL_DIR/capture.log"
chmod 600 "$INSTALL_DIR/capture.log"

# Install Python dependencies
echo "Installing Python dependencies..."
pip3 install --user boto3 python-dotenv

# Check camera type and install appropriate library
read -p "Are you using a Raspberry Pi Camera Module? (y/n) " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    echo "Installing picamera2..."
    sudo apt-get update
    sudo apt-get install -y python3-picamera2
else
    echo "Installing OpenCV for USB camera..."
    pip3 install --user opencv-python-headless
    # Update config to use USB camera
    sed -i 's/CAMERA_TYPE=pi/CAMERA_TYPE=usb/' "$INSTALL_DIR/config.env"
fi

# Create systemd service
echo "Creating systemd service..."
sudo tee /etc/systemd/system/viali-camera.service > /dev/null << EOF
[Unit]
Description=Viali Camera Capture Service
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=pi
WorkingDirectory=$INSTALL_DIR
ExecStart=/usr/bin/python3 $INSTALL_DIR/capture.py
Restart=always
RestartSec=60
Environment=PYTHONUNBUFFERED=1

[Install]
WantedBy=multi-user.target
EOF

# Set permissions
sudo chmod 644 /etc/systemd/system/viali-camera.service
chmod +x "$INSTALL_DIR/capture.py"

# Reload systemd
sudo systemctl daemon-reload

# Install Raspberry Pi Connect for remote diagnostics
echo ""
echo "============================================"
echo "Raspberry Pi Connect (Remote Diagnostics)"
echo "============================================"
echo ""
read -p "Install Raspberry Pi Connect for remote access? (y/n) " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    echo "Installing Raspberry Pi Connect..."
    sudo apt-get update
    sudo apt-get install -y rpi-connect
    echo ""
    echo "Raspberry Pi Connect installed!"
    echo "To enable remote access, run: rpi-connect signin"
    echo "Then access your Pi at: https://connect.raspberrypi.com"
fi

echo ""
echo "============================================"
echo "Installation Complete!"
echo "============================================"
echo ""
echo "Next steps:"
echo ""
echo "1. Edit your configuration:"
echo "   nano $INSTALL_DIR/config.env"
echo ""
echo "2. Set your CAMERA_ID (e.g., cam-or-1)"
echo "3. Set your S3 credentials from Exoscale"
echo ""
echo "4. Enable and start the service:"
echo "   sudo systemctl enable viali-camera.service"
echo "   sudo systemctl start viali-camera.service"
echo ""
echo "5. Check status:"
echo "   sudo systemctl status viali-camera.service"
echo ""
echo "6. View logs:"
echo "   tail -f $INSTALL_DIR/capture.log"
echo "   # or"
echo "   sudo journalctl -u viali-camera.service -f"
echo ""
echo "7. (Optional) Set up Raspberry Pi Connect for remote diagnostics:"
echo "   rpi-connect signin"
echo "   # Then access at: https://connect.raspberrypi.com"
echo ""
