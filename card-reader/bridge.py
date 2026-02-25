#!/usr/bin/env python3
"""
Viali Card Reader Bridge

Reads Swiss eCH-0064 insurance cards and opens the matching patient in Viali.
Runs as a system tray application on Windows.

Prerequisites:
    pip install pyscard pystray Pillow requests
    (On Windows: WinSCard.dll is built-in)
    (On Linux: sudo apt install pcscd pcsc-tools libpcsclite-dev swig)
"""

import os
import sys
import time
import threading
import webbrowser
import logging
from pathlib import Path

import requests as http_requests

try:
    from smartcard.System import readers
    from smartcard.Exceptions import CardConnectionException, NoCardException
except ImportError:
    print("ERROR: pyscard not installed. Run: pip install pyscard")
    sys.exit(1)

try:
    import pystray
    from PIL import Image, ImageDraw
except ImportError:
    print("ERROR: pystray/Pillow not installed. Run: pip install pystray Pillow")
    sys.exit(1)


# ---------------------------------------------------------------------------
# Logging
# ---------------------------------------------------------------------------

log = logging.getLogger("viali-bridge")
log.setLevel(logging.INFO)
handler = logging.StreamHandler(sys.stdout)
handler.setFormatter(logging.Formatter("%(asctime)s [%(levelname)s] %(message)s", datefmt="%H:%M:%S"))
log.addHandler(handler)


# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------

def find_config_path():
    """Find config.env next to the script or .exe."""
    if getattr(sys, 'frozen', False):
        base = Path(sys.executable).parent
    else:
        base = Path(__file__).parent
    return base / "config.env"


def load_config():
    """Load config from config.env file."""
    config_path = find_config_path()
    config = {
        "VIALI_URL": "https://use.viali.app",
        "VIALI_TOKEN": "",
        "PREFERRED_READER": "",
        "POLL_INTERVAL_SECONDS": "1",
    }

    if not config_path.exists():
        log.warning(f"Config file not found: {config_path}")
        log.warning("Copy config.env.template to config.env and fill in your values.")
        return config

    with open(config_path, "r") as f:
        for line in f:
            line = line.strip()
            if not line or line.startswith("#"):
                continue
            if "=" in line:
                key, value = line.split("=", 1)
                config[key.strip()] = value.strip()

    return config


# ---------------------------------------------------------------------------
# eCH-0064 TLV Parsing
# ---------------------------------------------------------------------------

def parse_ech0064_tlv(data, field_defs):
    """Parse eCH-0064 TLV structure (0x65 container with tagged fields).

    field_defs: list of (tag, field_name) tuples
    Returns dict of field_name -> decoded bytes value.
    """
    result = {}
    raw = bytes(data)

    if len(raw) < 2 or raw[0] != 0x65:
        return result

    offset = 2  # skip 0x65 + length byte

    for expected_tag, field_name in field_defs:
        if offset >= len(raw):
            break
        tag = raw[offset]
        offset += 1
        if offset >= len(raw):
            break
        length = raw[offset]
        offset += 1
        if offset + length > len(raw):
            break
        value = raw[offset:offset + length]
        offset += length
        result[field_name] = value

    return result


def read_card_data(connection):
    """Read eCH-0064 patient data from a connected Swiss insurance card.

    Returns dict with patient fields, or None on failure.
    """
    def send(apdu):
        data, sw1, sw2 = connection.transmit(apdu)
        return data, sw1, sw2

    def select_file(file_id):
        return send([0x00, 0xA4, 0x00, 0x00, len(file_id)] + file_id)

    def read_binary(length):
        if length <= 255:
            return send([0x00, 0xB0, 0x00, 0x00, length])
        else:
            return send([0x00, 0xB0, 0x00, 0x00, 0x00,
                        (length >> 8) & 0xFF, length & 0xFF])

    # Select MF
    _, sw1, sw2 = select_file([0x3F, 0x00])
    if sw1 != 0x90:
        log.error(f"Failed to select MF: SW={sw1:02X}{sw2:02X}")
        return None

    # Read EF.ID (2F06) — 84 bytes: name, DOB, AHV number, sex
    _, sw1, sw2 = select_file([0x2F, 0x06])
    if sw1 != 0x90:
        log.error(f"Failed to select EF.ID: SW={sw1:02X}{sw2:02X}")
        return None

    id_data, sw1, sw2 = read_binary(84)
    if sw1 == 0x6C:
        id_data, sw1, sw2 = read_binary(sw2)
    if sw1 != 0x90 or not id_data:
        log.error(f"Failed to read EF.ID: SW={sw1:02X}{sw2:02X}")
        return None

    id_fields = parse_ech0064_tlv(id_data, [
        (0x80, "name"),
        (0x82, "dob"),
        (0x83, "ahv"),
        (0x84, "sex"),
    ])

    # Read EF.AD (2F07) — 95 bytes: state, insurer, BAG#, card#, expiry
    _, sw1, sw2 = select_file([0x2F, 0x07])
    if sw1 != 0x90:
        log.error(f"Failed to select EF.AD: SW={sw1:02X}{sw2:02X}")
        return None

    ad_data, sw1, sw2 = read_binary(95)
    if sw1 == 0x6C:
        ad_data, sw1, sw2 = read_binary(sw2)
    if sw1 != 0x90 or not ad_data:
        log.error(f"Failed to read EF.AD: SW={sw1:02X}{sw2:02X}")
        return None

    ad_fields = parse_ech0064_tlv(ad_data, [
        (0x90, "state"),
        (0x91, "insurer"),
        (0x92, "bag_number"),
        (0x93, "card_number"),
        (0x94, "expiry"),
    ])

    # Decode and map fields
    patient = {}

    # Name: "Family,Given" format
    if "name" in id_fields:
        name_str = id_fields["name"].decode("utf-8", errors="replace").strip()
        parts = name_str.split(",", 1)
        patient["surname"] = parts[0].strip()
        patient["firstName"] = parts[1].strip() if len(parts) > 1 else ""

    # DOB: YYYYMMDD -> YYYY-MM-DD
    if "dob" in id_fields:
        dob = id_fields["dob"].decode("utf-8", errors="replace").strip()
        if len(dob) == 8:
            patient["birthday"] = f"{dob[:4]}-{dob[4:6]}-{dob[6:8]}"

    # AHV number
    if "ahv" in id_fields:
        patient["healthInsuranceNumber"] = id_fields["ahv"].decode("utf-8", errors="replace").strip()

    # Sex: 1=male, 2=female
    if "sex" in id_fields and len(id_fields["sex"]) > 0:
        sex_byte = id_fields["sex"][0]
        patient["sex"] = "M" if sex_byte == 1 else "F" if sex_byte == 2 else "O"

    # Insurance name
    if "insurer" in ad_fields:
        patient["insuranceName"] = ad_fields["insurer"].decode("utf-8", errors="replace").strip()

    # Card number
    if "card_number" in ad_fields:
        patient["cardNumber"] = ad_fields["card_number"].decode("utf-8", errors="replace").strip()

    return patient


# ---------------------------------------------------------------------------
# API Client
# ---------------------------------------------------------------------------

def post_card_data(config, patient_data):
    """POST card data to Viali API and return the response.

    Returns (success, url_or_error_message).
    """
    url = config["VIALI_URL"].rstrip("/") + "/api/card-reader/lookup"
    token = config["VIALI_TOKEN"]

    if not token or token == "your-card-reader-token-here":
        return False, "No API token configured"

    headers = {
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json",
    }

    payload = {"cardData": patient_data}

    try:
        resp = http_requests.post(url, json=payload, headers=headers, timeout=10)

        if resp.status_code == 200:
            data = resp.json()
            full_url = config["VIALI_URL"].rstrip("/") + data.get("url", "")
            return True, full_url

        if resp.status_code == 401:
            msg = resp.json().get("message", "Unauthorized")
            return False, f"Auth error: {msg}"

        if resp.status_code == 429:
            retry_after = resp.headers.get("Retry-After", "30")
            return False, f"Rate limited, retry in {retry_after}s"

        return False, f"API error: HTTP {resp.status_code}"

    except http_requests.exceptions.ConnectionError:
        return False, "Cannot connect to Viali server"
    except http_requests.exceptions.Timeout:
        return False, "Request timed out"
    except Exception as e:
        return False, f"Request failed: {e}"


# ---------------------------------------------------------------------------
# System Tray Icon
# ---------------------------------------------------------------------------

class TrayIcon:
    """Manages the system tray icon and status."""

    COLORS = {
        "green": (76, 175, 80),
        "yellow": (255, 193, 7),
        "red": (244, 67, 54),
        "blue": (33, 150, 243),
    }

    def __init__(self):
        self.icon = None
        self.tooltip = "Viali Card Reader - Starting..."
        self.color = "green"
        self._stop_event = threading.Event()

    def _create_image(self, color_name):
        """Create a simple colored circle icon."""
        r, g, b = self.COLORS.get(color_name, self.COLORS["green"])
        img = Image.new("RGBA", (64, 64), (0, 0, 0, 0))
        draw = ImageDraw.Draw(img)
        draw.ellipse([4, 4, 60, 60], fill=(r, g, b, 255))
        draw.text((20, 14), "V", fill=(255, 255, 255, 255))
        return img

    def set_status(self, color, tooltip):
        """Update tray icon color and tooltip."""
        self.color = color
        self.tooltip = tooltip
        if self.icon:
            self.icon.icon = self._create_image(color)
            self.icon.title = tooltip

    def stop(self):
        """Signal the tray to stop."""
        self._stop_event.set()
        if self.icon:
            self.icon.stop()

    def run(self, on_quit):
        """Run the tray icon (blocks until stopped)."""
        menu = pystray.Menu(
            pystray.MenuItem("Status", lambda: None, enabled=False),
            pystray.Menu.SEPARATOR,
            pystray.MenuItem("Quit", lambda icon, item: on_quit()),
        )

        self.icon = pystray.Icon(
            "viali-card-reader",
            self._create_image(self.color),
            self.tooltip,
            menu,
        )

        self.icon.run()


# ---------------------------------------------------------------------------
# Card Polling Loop
# ---------------------------------------------------------------------------

class CardReaderBridge:
    """Main bridge application. Polls for cards, reads data, posts to API."""

    def __init__(self):
        self.config = load_config()
        self.tray = TrayIcon()
        self.running = True
        self.last_card_ahv = None
        self.last_card_time = 0

    def find_reader(self):
        """Find a suitable smart card reader."""
        available = readers()
        if not available:
            return None

        preferred = self.config.get("PREFERRED_READER", "").strip()
        if preferred:
            for reader in available:
                if preferred.lower() in str(reader).lower():
                    return reader

        return available[0]

    def is_card_present(self, reader):
        """Check if a card is currently in the reader."""
        try:
            connection = reader.createConnection()
            connection.connect()
            connection.disconnect()
            return True
        except (NoCardException, CardConnectionException):
            return False

    def poll_loop(self):
        """Main polling loop - runs in a separate thread."""
        poll_interval = float(self.config.get("POLL_INTERVAL_SECONDS", "1"))
        card_was_present = False

        while self.running:
            try:
                reader = self.find_reader()
                if not reader:
                    self.tray.set_status("yellow", "Viali Card Reader - No reader detected")
                    time.sleep(poll_interval * 5)
                    continue

                card_present = self.is_card_present(reader)

                if card_present and not card_was_present:
                    # Card just inserted
                    self.tray.set_status("blue", "Viali Card Reader - Reading card...")
                    log.info("Card detected, reading...")

                    try:
                        connection = reader.createConnection()
                        connection.connect()
                        patient = read_card_data(connection)
                        connection.disconnect()
                    except Exception as e:
                        log.error(f"Card read error: {e}")
                        patient = None

                    if patient:
                        ahv = patient.get("healthInsuranceNumber", "")
                        now = time.time()

                        # Debounce: skip if same card within 5 seconds
                        if ahv == self.last_card_ahv and (now - self.last_card_time) < 5:
                            log.info("Same card, skipping (debounce)")
                        else:
                            self.last_card_ahv = ahv
                            self.last_card_time = now

                            name = f"{patient.get('firstName', '')} {patient.get('surname', '')}"
                            log.info(f"Card read: {name} (AHV: {ahv})")

                            success, result = post_card_data(self.config, patient)
                            if success:
                                log.info(f"Opening: {result}")
                                webbrowser.open(result)
                                self.tray.set_status("green", f"Viali Card Reader - {name}")
                            else:
                                log.error(f"API error: {result}")
                                self.tray.set_status("red", f"Viali Card Reader - {result}")
                    else:
                        log.warning("Could not read card data")
                        self.tray.set_status("red", "Viali Card Reader - Card read failed")

                elif not card_present and card_was_present:
                    # Card removed
                    log.info("Card removed")
                    self.tray.set_status("green", "Viali Card Reader - Ready")

                elif not card_present and not card_was_present:
                    if self.tray.color != "green" or "Ready" not in self.tray.tooltip:
                        self.tray.set_status("green", "Viali Card Reader - Ready")

                card_was_present = card_present

            except Exception as e:
                log.error(f"Poll error: {e}")
                self.tray.set_status("red", f"Viali Card Reader - Error: {e}")

            time.sleep(poll_interval)

    def quit(self):
        """Stop the bridge."""
        log.info("Shutting down...")
        self.running = False
        self.tray.stop()

    def run(self):
        """Start the bridge."""
        token = self.config.get("VIALI_TOKEN", "")
        if not token or token == "your-card-reader-token-here":
            log.error("No API token configured. Edit config.env and set VIALI_TOKEN.")
            log.error(f"Config file: {find_config_path()}")
            self.tray.set_status("red", "Viali Card Reader - No token configured")
        else:
            url = self.config["VIALI_URL"].rstrip("/") + "/api/card-reader/health"
            try:
                resp = http_requests.get(url, headers={
                    "Authorization": f"Bearer {token}"
                }, timeout=5)
                if resp.status_code == 200:
                    log.info("API connection OK")
                    self.tray.set_status("green", "Viali Card Reader - Ready")
                elif resp.status_code == 401:
                    log.error("Invalid API token")
                    self.tray.set_status("red", "Viali Card Reader - Invalid token")
                else:
                    log.warning(f"API health check: HTTP {resp.status_code}")
                    self.tray.set_status("yellow", "Viali Card Reader - API warning")
            except Exception as e:
                log.warning(f"Cannot reach API: {e}")
                self.tray.set_status("yellow", "Viali Card Reader - API unreachable")

        poll_thread = threading.Thread(target=self.poll_loop, daemon=True)
        poll_thread.start()

        log.info("Viali Card Reader Bridge started")
        self.tray.run(on_quit=self.quit)


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    bridge = CardReaderBridge()
    bridge.run()
