# Card Reader Bridge - Design

## Overview

Windows system tray app (.exe) that polls a USB smart card reader for Swiss eCH-0064 insurance cards, reads patient data, POSTs it to the Viali API, and opens the patient page in the default browser.

## Architecture

Single Python script (`bridge.py`) packaged as .exe via PyInstaller. Three threads:

1. **Card polling thread** - checks for card insertion every N seconds, reads EF.ID + EF.AD, sends data to main thread
2. **API thread** - POSTs card data to `{VIALI_URL}/api/card-reader/lookup`, opens returned URL in browser
3. **System tray UI** - icon with status colors (green/yellow/red), right-click menu: Status, Quit

## Data Flow

```
Card inserted
  -> SELECT MF (3F00)
  -> SELECT EF.ID (2F06), READ BINARY 84 bytes
     -> Parse TLV: tag 0x80 (name), 0x82 (DOB), 0x83 (AHV), 0x84 (sex)
  -> SELECT EF.AD (2F07), READ BINARY 95 bytes
     -> Parse TLV: tag 0x90-0x94 (state, insurer, BAG#, card#, expiry)
  -> Map to API format:
       healthInsuranceNumber = AHV number (tag 0x83)
       surname = family name (tag 0x80, before comma)
       firstName = given name (tag 0x80, after comma)
       birthday = YYYY-MM-DD (tag 0x82)
       sex = M/F (tag 0x84: 1->M, 2->F)
  -> POST /api/card-reader/lookup (Bearer token auth)
  -> Open returned URL in default browser
  -> Wait for card removal before reading again
```

## Tech Stack

- **pyscard** - smart card communication (uses Windows WinSCard.dll)
- **pystray + Pillow** - system tray icon
- **requests** - HTTP client
- **PyInstaller** - package as single .exe

## Config File (`config.env`, next to .exe)

```
VIALI_URL=https://use.viali.app
VIALI_TOKEN=your-card-reader-token-here
PREFERRED_READER=
POLL_INTERVAL_SECONDS=1
```

## Error Handling

- No reader found -> yellow tray icon, tooltip "No reader detected"
- Card read failure -> retry once, then skip
- API unreachable -> red tray icon, retry on next card
- API 401 -> red icon, "Invalid token - check config"
- Rate limited (429) -> wait and retry
- Debounce: ignore same card for 5 seconds after successful read

## System Tray States

| State | Icon Color | Tooltip |
|-------|-----------|---------|
| Ready, waiting for card | Green | "Viali Card Reader - Ready" |
| No reader detected | Yellow | "Viali Card Reader - No reader" |
| API error / bad token | Red | "Viali Card Reader - Error: ..." |
| Reading card | Blue | "Viali Card Reader - Reading..." |

## Files

```
card-reader/
  bridge.py           # Main application
  config.env.template # Config template (already exists)
  config.env          # User config (not committed)
  requirements.txt    # Python dependencies (update existing)
  discover.py         # Discovery tool (already exists)
  build.bat           # PyInstaller build script for Windows
  venv/               # Virtual environment (not committed)
```
