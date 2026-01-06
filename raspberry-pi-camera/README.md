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

## Security Considerations

- **Config file permissions**: The installer sets `config.env` to `chmod 600` (owner read/write only) to protect S3 credentials
- **Log file permissions**: The log file is also protected (`chmod 600`) to prevent credential exposure in logs
- **Credential rotation**: Consider rotating S3 access keys periodically
- **Scoped IAM credentials**: Create dedicated S3 credentials with minimal permissions (write access to `cameras/` prefix only)
- **Network security**: Ensure the Raspberry Pi is on a secure network segment

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
