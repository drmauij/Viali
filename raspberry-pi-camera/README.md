# Viali Camera Capture for Raspberry Pi

Automated vital signs monitor capture system for integration with Viali anesthesia records.

## Hardware Requirements

- Raspberry Pi Zero 2 W (or any Raspberry Pi with WiFi)
- Raspberry Pi Camera Module OR USB Webcam
- MicroSD card (8GB+)
- Power supply

## Quick Start

### 1. Prepare Raspberry Pi

1. Download [Raspberry Pi Imager](https://www.raspberrypi.com/software/)
2. Flash "Raspberry Pi OS Lite (64-bit)" to SD card
3. In Imager settings (gear icon):
   - Enable SSH
   - Set username: `pi`
   - Set password
   - Configure WiFi (SSID + password)
4. Insert SD card and power on Pi

### 2. Connect and Install

```bash
# SSH into your Pi
ssh pi@raspberrypi.local

# Download the installation files
# (copy files from this folder to Pi, or git clone)

# Run installer
chmod +x install.sh
./install.sh
```

### 3. Configure

Edit the configuration file:

```bash
nano /home/pi/camera-capture/config.env
```

Required settings:
- `CAMERA_ID` - Unique ID for this camera (e.g., `cam-or-1`)
- `S3_ACCESS_KEY` - From your Exoscale account
- `S3_SECRET_KEY` - From your Exoscale account
- `S3_BUCKET` - Your Viali bucket name

### 4. Start the Service

```bash
sudo systemctl enable viali-camera.service
sudo systemctl start viali-camera.service
```

## Configuration Options

| Setting | Default | Description |
|---------|---------|-------------|
| CAMERA_ID | cam-or-1 | Unique identifier for this camera |
| CAPTURE_INTERVAL_SECONDS | 300 | Time between captures (5 min) |
| IMAGE_QUALITY | 85 | JPEG quality (1-100) |
| IMAGE_WIDTH | 1920 | Image width in pixels |
| IMAGE_HEIGHT | 1080 | Image height in pixels |
| CAMERA_TYPE | pi | `pi` for Pi Camera, `usb` for USB webcam |

## Troubleshooting

### Check Service Status
```bash
sudo systemctl status viali-camera.service
```

### View Logs
```bash
# Application log
tail -f /home/pi/camera-capture/capture.log

# System log
sudo journalctl -u viali-camera.service -f
```

### Test Camera
```bash
# For Pi Camera
libcamera-still -o test.jpg

# For USB Camera
python3 -c "import cv2; cap=cv2.VideoCapture(0); ret,frame=cap.read(); cv2.imwrite('test.jpg',frame)"
```

### Common Issues

**Camera not found**
- Pi Camera: Enable in `raspi-config` under Interface Options
- USB Camera: Check `lsusb` output

**S3 upload fails**
- Verify credentials in config.env
- Check internet connection: `ping google.com`
- Images are saved locally and uploaded when connection is restored

**Service won't start**
- Check logs for errors
- Verify Python dependencies: `pip3 list | grep boto3`

## Remote Diagnostics with Raspberry Pi Connect

[Raspberry Pi Connect](https://www.raspberrypi.com/software/connect/) provides free, secure remote access to your camera Pis from anywhere via web browser - no VPN or port forwarding needed.

### Why Use Pi Connect?

- **Troubleshoot remotely**: Access any camera Pi from your office or home
- **Check image quality**: View captured images directly on the Pi
- **Monitor logs**: Watch capture script logs in real-time
- **Adjust settings**: Tune camera exposure, focus, and configuration
- **Restart services**: Recover from issues without physical access

### Setup

1. **During installation**, answer "y" when prompted to install Raspberry Pi Connect

2. **Sign in** (one-time setup on each Pi):
   ```bash
   rpi-connect signin
   ```
   This displays a URL and verification code. Visit the URL on any device, sign in with your Raspberry Pi ID, and enter the code.

3. **Access remotely** at [connect.raspberrypi.com](https://connect.raspberrypi.com):
   - See all your connected Pis in one dashboard
   - Click "Connect via" → "Remote shell" for terminal access
   - Click "Connect via" → "Screen sharing" for desktop access (Desktop OS only)

### Useful Diagnostic Commands

Once connected via remote shell, use these commands to diagnose issues:

```bash
# Check service status
sudo systemctl status viali-camera.service

# View live logs
tail -f /home/pi/camera-capture/capture.log

# Check last 50 log entries
tail -n 50 /home/pi/camera-capture/capture.log

# View recent captured images
ls -la /home/pi/camera-capture/pending_uploads/

# Test camera capture manually
cd /home/pi/camera-capture && python3 -c "
import cv2
cap = cv2.VideoCapture(0)
ret, frame = cap.read()
cv2.imwrite('test-capture.jpg', frame)
cap.release()
print('Test image saved: test-capture.jpg')
"

# View test image dimensions
file test-capture.jpg

# Check network connectivity
ping -c 3 sos-ch-gva-2.exo.io

# Check disk space
df -h

# Check available memory
free -h

# Restart the capture service
sudo systemctl restart viali-camera.service

# Check S3 credentials are set
grep -E "^S3_" /home/pi/camera-capture/config.env | sed 's/=.*/=***/'
```

### Manual Installation (if skipped during setup)

```bash
sudo apt-get update
sudo apt-get install -y rpi-connect
rpi-connect signin
```

### Requirements

- Raspberry Pi OS Bookworm or newer
- Raspberry Pi 4, Pi 5, or Pi Zero 2 W
- Internet connection

## Security Considerations

- **Config file permissions**: The installer sets `config.env` to `chmod 600` (owner read/write only) to protect S3 credentials
- **Log file permissions**: The log file is also protected (`chmod 600`) to prevent credential exposure in logs
- **Credential rotation**: Consider rotating S3 access keys periodically
- **Scoped IAM credentials**: Create dedicated S3 credentials with minimal permissions (write access to `cameras/` prefix only)
- **Network security**: Ensure the Raspberry Pi is on a secure network segment
- **Pi Connect security**: Uses end-to-end encryption; access requires your Raspberry Pi ID authentication

## How It Works

1. Camera captures image every X seconds
2. Image is timestamped and uploaded to S3: `cameras/{CAMERA_ID}/{timestamp}.jpg`
3. If upload fails, image is saved locally for later retry
4. Viali app fetches images by camera ID for OCR processing

## File Structure

```
/home/pi/camera-capture/
├── capture.py          # Main capture script
├── config.env          # Your configuration
├── capture.log         # Application logs
└── pending_uploads/    # Images waiting for upload
```
