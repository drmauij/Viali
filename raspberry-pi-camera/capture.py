#!/usr/bin/env python3
"""
Viali Camera Capture Service for Raspberry Pi
Captures images from a connected camera and uploads to Exoscale S3 storage.

Requirements:
- picamera2 (for Raspberry Pi Camera Module)
- boto3 (for S3 uploads)
- python-dotenv (for config loading)

Install: pip3 install picamera2 boto3 python-dotenv
"""

import os
import sys
import time
import json
import logging
from datetime import datetime
from pathlib import Path

try:
    import boto3
    from botocore.config import Config
except ImportError:
    print("ERROR: boto3 not installed. Run: pip3 install boto3")
    sys.exit(1)

try:
    from dotenv import load_dotenv
except ImportError:
    print("ERROR: python-dotenv not installed. Run: pip3 install python-dotenv")
    sys.exit(1)

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s',
    handlers=[
        logging.StreamHandler(),
        logging.FileHandler('/home/pi/camera-capture/capture.log')
    ]
)
logger = logging.getLogger(__name__)

CONFIG_FILE = Path(__file__).parent / "config.env"
FALLBACK_IMAGE_DIR = Path(__file__).parent / "pending_uploads"

class CameraCapture:
    def __init__(self):
        load_dotenv(CONFIG_FILE)
        
        self.camera_id = os.getenv("CAMERA_ID", "cam-unknown")
        self.capture_interval = int(os.getenv("CAPTURE_INTERVAL_SECONDS", "300"))
        self.image_quality = int(os.getenv("IMAGE_QUALITY", "85"))
        self.image_width = int(os.getenv("IMAGE_WIDTH", "1920"))
        self.image_height = int(os.getenv("IMAGE_HEIGHT", "1080"))
        
        self.s3_endpoint = os.getenv("S3_ENDPOINT")
        self.s3_access_key = os.getenv("S3_ACCESS_KEY")
        self.s3_secret_key = os.getenv("S3_SECRET_KEY")
        self.s3_bucket = os.getenv("S3_BUCKET")
        self.s3_region = os.getenv("S3_REGION", "ch-dk-2")
        
        self.s3_client = None
        self.camera = None
        
        FALLBACK_IMAGE_DIR.mkdir(exist_ok=True)
        
    def validate_config(self):
        """Validate required configuration."""
        missing = []
        if not self.s3_endpoint:
            missing.append("S3_ENDPOINT")
        if not self.s3_access_key:
            missing.append("S3_ACCESS_KEY")
        if not self.s3_secret_key:
            missing.append("S3_SECRET_KEY")
        if not self.s3_bucket:
            missing.append("S3_BUCKET")
        if not self.camera_id or self.camera_id == "cam-unknown":
            missing.append("CAMERA_ID")
            
        if missing:
            logger.error(f"Missing required configuration: {', '.join(missing)}")
            logger.error(f"Please edit {CONFIG_FILE}")
            return False
        return True
    
    def init_s3(self):
        """Initialize S3 client for Exoscale."""
        try:
            self.s3_client = boto3.client(
                's3',
                endpoint_url=self.s3_endpoint,
                aws_access_key_id=self.s3_access_key,
                aws_secret_access_key=self.s3_secret_key,
                region_name=self.s3_region,
                config=Config(signature_version='s3v4')
            )
            self.s3_client.list_buckets()
            logger.info("S3 connection successful")
            return True
        except Exception as e:
            logger.error(f"S3 connection failed: {e}")
            return False
    
    def init_camera(self):
        """Initialize the Raspberry Pi camera."""
        try:
            from picamera2 import Picamera2
            self.camera = Picamera2()
            config = self.camera.create_still_configuration(
                main={"size": (self.image_width, self.image_height)}
            )
            self.camera.configure(config)
            self.camera.start()
            time.sleep(2)
            logger.info(f"Camera initialized at {self.image_width}x{self.image_height}")
            return True
        except ImportError:
            logger.error("picamera2 not installed. Run: sudo apt install python3-picamera2")
            return False
        except Exception as e:
            logger.error(f"Camera initialization failed: {e}")
            return False
    
    def capture_image(self):
        """Capture an image and return the file path."""
        timestamp = datetime.now().strftime("%Y-%m-%dT%H-%M-%S")
        filename = f"{timestamp}.jpg"
        local_path = FALLBACK_IMAGE_DIR / filename
        
        try:
            self.camera.capture_file(str(local_path))
            logger.info(f"Captured image: {filename}")
            return local_path, timestamp
        except Exception as e:
            logger.error(f"Capture failed: {e}")
            return None, None
    
    def upload_to_s3(self, local_path, timestamp):
        """Upload image to S3 storage."""
        s3_key = f"cameras/{self.camera_id}/{timestamp}.jpg"
        
        try:
            with open(local_path, 'rb') as f:
                self.s3_client.put_object(
                    Bucket=self.s3_bucket,
                    Key=s3_key,
                    Body=f,
                    ContentType='image/jpeg',
                    Metadata={
                        'camera_id': self.camera_id,
                        'captured_at': timestamp,
                        'source': 'viali-raspberry-pi'
                    }
                )
            logger.info(f"Uploaded to S3: {s3_key}")
            os.remove(local_path)
            return True
        except Exception as e:
            logger.error(f"Upload failed: {e}")
            logger.info(f"Image saved locally for later upload: {local_path}")
            return False
    
    def upload_pending(self):
        """Upload any pending images from failed uploads."""
        pending_files = list(FALLBACK_IMAGE_DIR.glob("*.jpg"))
        if not pending_files:
            return
            
        logger.info(f"Found {len(pending_files)} pending uploads")
        for file_path in pending_files:
            timestamp = file_path.stem
            if self.upload_to_s3(file_path, timestamp):
                logger.info(f"Uploaded pending image: {file_path.name}")
    
    def run(self):
        """Main capture loop."""
        logger.info("=" * 50)
        logger.info("Viali Camera Capture Service Starting")
        logger.info(f"Camera ID: {self.camera_id}")
        logger.info(f"Capture interval: {self.capture_interval} seconds")
        logger.info("=" * 50)
        
        if not self.validate_config():
            sys.exit(1)
            
        if not self.init_s3():
            logger.warning("S3 not available - will store images locally")
            
        if not self.init_camera():
            sys.exit(1)
        
        try:
            while True:
                self.upload_pending()
                
                local_path, timestamp = self.capture_image()
                if local_path:
                    self.upload_to_s3(local_path, timestamp)
                
                logger.info(f"Next capture in {self.capture_interval} seconds")
                time.sleep(self.capture_interval)
                
        except KeyboardInterrupt:
            logger.info("Shutting down...")
        finally:
            if self.camera:
                self.camera.stop()
                self.camera.close()


class USBCameraCapture(CameraCapture):
    """Alternative capture class for USB webcams instead of Pi Camera."""
    
    def init_camera(self):
        """Initialize USB camera using OpenCV."""
        try:
            import cv2
            self.camera = cv2.VideoCapture(0)
            self.camera.set(cv2.CAP_PROP_FRAME_WIDTH, self.image_width)
            self.camera.set(cv2.CAP_PROP_FRAME_HEIGHT, self.image_height)
            
            if not self.camera.isOpened():
                raise Exception("Could not open USB camera")
                
            logger.info(f"USB camera initialized at {self.image_width}x{self.image_height}")
            return True
        except ImportError:
            logger.error("OpenCV not installed. Run: pip3 install opencv-python-headless")
            return False
        except Exception as e:
            logger.error(f"USB camera initialization failed: {e}")
            return False
    
    def capture_image(self):
        """Capture an image from USB camera."""
        import cv2
        
        timestamp = datetime.now().strftime("%Y-%m-%dT%H-%M-%S")
        filename = f"{timestamp}.jpg"
        local_path = FALLBACK_IMAGE_DIR / filename
        
        try:
            ret, frame = self.camera.read()
            if not ret:
                raise Exception("Failed to read frame")
            
            cv2.imwrite(str(local_path), frame, [cv2.IMWRITE_JPEG_QUALITY, self.image_quality])
            logger.info(f"Captured image: {filename}")
            return local_path, timestamp
        except Exception as e:
            logger.error(f"Capture failed: {e}")
            return None, None


if __name__ == "__main__":
    camera_type = os.getenv("CAMERA_TYPE", "pi").lower()
    
    if camera_type == "usb":
        logger.info("Using USB camera mode")
        capture = USBCameraCapture()
    else:
        logger.info("Using Raspberry Pi camera mode")
        capture = CameraCapture()
    
    capture.run()
