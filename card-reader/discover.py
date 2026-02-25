#!/usr/bin/env python3
"""
Smart Card Discovery Tool for Viali Insurance Card Reader

Explores a chip-based insurance card's file structure and dumps readable data.
Used to reverse-engineer the card format before building the bridge application.

Prerequisites (Linux):
    sudo apt install pcscd pcsc-tools libpcsclite-dev swig
    pip install pyscard

Usage:
    python discover.py
"""

import sys
import struct

try:
    from smartcard.System import readers
    from smartcard.util import toHexString, toBytes
    from smartcard.Exceptions import CardConnectionException, NoCardException
    from smartcard.ATR import ATR
except ImportError:
    print("ERROR: pyscard not installed. Run: pip install pyscard")
    print("On Linux, also install: sudo apt install pcscd pcsc-tools libpcsclite-dev swig")
    sys.exit(1)


# ---------------------------------------------------------------------------
# APDU helpers
# ---------------------------------------------------------------------------

def send_apdu(connection, apdu, label=""):
    """Send an APDU command and return (data, sw1, sw2)."""
    try:
        data, sw1, sw2 = connection.transmit(apdu)
        return data, sw1, sw2
    except CardConnectionException as e:
        if label:
            print(f"  [{label}] Transmission error: {e}")
        return [], 0x6F, 0x00


def select_file(connection, file_id):
    """SELECT a file by ID (2 bytes). Returns (data, sw1, sw2)."""
    hi = (file_id >> 8) & 0xFF
    lo = file_id & 0xFF
    apdu = [0x00, 0xA4, 0x00, 0x0C, 0x02, hi, lo]
    return send_apdu(connection, apdu, f"SELECT {file_id:04X}")


def select_file_with_fci(connection, file_id):
    """SELECT a file by ID requesting FCI response. Returns (data, sw1, sw2)."""
    hi = (file_id >> 8) & 0xFF
    lo = file_id & 0xFF
    apdu = [0x00, 0xA4, 0x00, 0x00, 0x02, hi, lo]
    return send_apdu(connection, apdu, f"SELECT FCI {file_id:04X}")


def select_child_df(connection, df_id):
    """SELECT child DF under current DF (P1=01). Returns (data, sw1, sw2)."""
    hi = (df_id >> 8) & 0xFF
    lo = df_id & 0xFF
    apdu = [0x00, 0xA4, 0x01, 0x00, 0x02, hi, lo]
    return send_apdu(connection, apdu, f"SELECT CHILD DF {df_id:04X}")


def select_child_ef(connection, ef_id):
    """SELECT child EF under current DF (P1=02). Returns (data, sw1, sw2)."""
    hi = (ef_id >> 8) & 0xFF
    lo = ef_id & 0xFF
    apdu = [0x00, 0xA4, 0x02, 0x00, 0x02, hi, lo]
    return send_apdu(connection, apdu, f"SELECT CHILD EF {ef_id:04X}")


def select_by_path_from_mf(connection, path_bytes):
    """SELECT by absolute path from MF (P1=08). path_bytes is list of byte pairs.
    e.g. [0x3F, 0x00, 0xDF, 0x03, 0x00, 0x1C] for MF/DF03/001C."""
    apdu = [0x00, 0xA4, 0x08, 0x00, len(path_bytes)] + path_bytes
    path_str = " ".join(f"{b:02X}" for b in path_bytes)
    return send_apdu(connection, apdu, f"SELECT PATH {path_str}")


def select_by_path_from_current(connection, path_bytes):
    """SELECT by relative path from current DF (P1=09). path_bytes is list of byte pairs."""
    apdu = [0x00, 0xA4, 0x09, 0x00, len(path_bytes)] + path_bytes
    path_str = " ".join(f"{b:02X}" for b in path_bytes)
    return send_apdu(connection, apdu, f"SELECT REL PATH {path_str}")


def read_binary(connection, offset=0, length=0):
    """READ BINARY from current file. If length=0, tries 256 bytes."""
    le = length if length > 0 else 0  # 0 means 256 in short APDU
    off_hi = (offset >> 8) & 0x7F
    off_lo = offset & 0xFF
    apdu = [0x00, 0xB0, off_hi, off_lo, le]
    return send_apdu(connection, apdu, f"READ BINARY offset={offset} len={length}")


def read_record(connection, record_num, length=0):
    """READ RECORD by record number. If length=0, tries 256 bytes."""
    le = length if length > 0 else 0
    apdu = [0x00, 0xB2, record_num, 0x04, le]
    return send_apdu(connection, apdu, f"READ RECORD #{record_num}")


def get_response(connection, length):
    """GET RESPONSE for data pending after a command."""
    apdu = [0x00, 0xC0, 0x00, 0x00, length]
    return send_apdu(connection, apdu, "GET RESPONSE")


# ---------------------------------------------------------------------------
# Data decoding
# ---------------------------------------------------------------------------

def try_decode(data):
    """Try multiple encodings and return readable strings."""
    if not data:
        return {}
    byte_data = bytes(data)
    results = {}

    results["hex"] = toHexString(data)

    for enc in ("ascii", "latin-1", "utf-8"):
        try:
            decoded = byte_data.decode(enc, errors="replace")
            printable = "".join(c if c.isprintable() or c in "\n\r\t" else "." for c in decoded)
            if any(c.isalpha() for c in printable):
                results[enc] = printable
        except Exception:
            pass

    return results


def parse_tlv(data, depth=0):
    """Parse BER-TLV structures. Returns list of (tag, length, value, children)."""
    results = []
    i = 0
    raw = bytes(data) if not isinstance(data, bytes) else data

    while i < len(raw):
        if raw[i] == 0x00 or raw[i] == 0xFF:
            i += 1
            continue

        # Parse tag
        tag_start = i
        tag_byte1 = raw[i]
        i += 1
        if (tag_byte1 & 0x1F) == 0x1F:
            while i < len(raw) and (raw[i] & 0x80):
                i += 1
            if i < len(raw):
                i += 1
        tag = raw[tag_start:i]

        if i >= len(raw):
            break

        # Parse length
        len_byte = raw[i]
        i += 1
        if len_byte < 0x80:
            length = len_byte
        elif len_byte == 0x81:
            if i >= len(raw):
                break
            length = raw[i]
            i += 1
        elif len_byte == 0x82:
            if i + 1 >= len(raw):
                break
            length = (raw[i] << 8) | raw[i + 1]
            i += 2
        else:
            break

        if i + length > len(raw):
            length = len(raw) - i

        value = raw[i:i + length]
        i += length

        # Check if constructed (bit 6 of first tag byte set)
        is_constructed = bool(tag[0] & 0x20)
        children = []
        if is_constructed and length > 0:
            try:
                children = parse_tlv(value, depth + 1)
            except Exception:
                pass

        tag_hex = toHexString(list(tag)).replace(" ", "")
        results.append({
            "tag": tag_hex,
            "length": length,
            "value": list(value),
            "children": children,
        })

    return results


def print_tlv(tlv_list, indent=0):
    """Pretty-print parsed TLV structures."""
    prefix = "  " * indent
    for entry in tlv_list:
        tag = entry["tag"]
        length = entry["length"]
        value = entry["value"]
        children = entry["children"]

        decoded = try_decode(value)
        ascii_str = decoded.get("ascii", decoded.get("latin-1", ""))

        if children:
            print(f"{prefix}[{tag}] len={length} (constructed)")
            print_tlv(children, indent + 1)
        else:
            print(f"{prefix}[{tag}] len={length}: {toHexString(value)}")
            if ascii_str:
                print(f"{prefix}  -> text: {ascii_str}")


# ---------------------------------------------------------------------------
# Known file IDs for insurance cards
# ---------------------------------------------------------------------------

KNOWN_FILES = {
    # ISO 7816 standard
    0x3F00: "MF (Master File)",
    0x2F00: "EF.DIR",
    0x2F01: "EF.ATR",

    # German eGK (elektronische Gesundheitskarte)
    0xD000: "DF.HCA (eGK root)",
    0xD001: "EF.GDO (Global Data Objects)",
    0xD002: "EF.Version",
    0xD003: "EF.StatusVD",
    0xD010: "EF.PD (Patient Data - eGK)",
    0xD011: "EF.VD (Insurance Data - eGK)",

    # Swiss KVG / insurance card
    0x5001: "DF.Insurance (Swiss)",
    0x5011: "EF.Insured Person",
    0x5012: "EF.Insurance Info",
    0x5021: "EF.Card Info",

    # Common DF/EF ranges
    0x0001: "EF.0001",
    0x0002: "EF.0002",
    0x0003: "EF.0003",
    0x0004: "EF.0004",
    0x0005: "EF.0005",
    0x0006: "EF.0006",
    0x0007: "EF.0007",
    0x0008: "EF.0008",
    0x0009: "EF.0009",
    0x000A: "EF.000A",
    0x000B: "EF.000B",
    0x000C: "EF.000C",
    0x000D: "EF.000D",
    0x000E: "EF.000E",
    0x000F: "EF.000F",
    0x0010: "EF.0010",
    0x0011: "EF.0011",
    0x0012: "EF.0012",
    0x0013: "EF.0013",
    0x0014: "EF.0014",
    0x0015: "EF.0015",
    0x0016: "EF.0016",
    0x0017: "EF.0017",
    0x0018: "EF.0018",
    0x0019: "EF.0019",
    0x001A: "EF.001A",
    0x001B: "EF.001B",
    0x001C: "EF.001C",
    0x001D: "EF.001D",
    0x001E: "EF.001E",
    0x001F: "EF.001F",

    # Additional common application IDs
    0x1000: "DF.1000",
    0x1001: "EF.1001",
    0x2000: "DF.2000",
    0x2001: "EF.2001",
    0x3000: "DF.3000",
    0x3001: "EF.3001",
    0x4000: "DF.4000",
    0x5000: "DF.5000",
    0x6000: "DF.6000",
    0x7000: "DF.7000",
    0x7001: "EF.7001",
    0x7002: "EF.7002",
    0x7F00: "DF.7F00",
    0x7F01: "EF.7F01",
    0x7F10: "DF.PKCS15",
    0x7F20: "DF.7F20",
}

# Common AIDs (Application Identifiers) to try SELECT by name
KNOWN_AIDS = {
    "D27600000102":   "German eGK root",
    "D27600014407":   "German eGK HCA v4.x",
    "A000000003":     "Visa",
    "A000000004":     "Mastercard",
    "D276000025":     "OpenPGP",
    "A0000003974349546F303031": "Swiss health insurance",
}


# ---------------------------------------------------------------------------
# Discovery logic
# ---------------------------------------------------------------------------

def select_by_aid(connection, aid_hex, label):
    """SELECT by Application ID (AID)."""
    aid_bytes = toBytes(aid_hex)
    apdu = [0x00, 0xA4, 0x04, 0x00, len(aid_bytes)] + list(aid_bytes)
    data, sw1, sw2 = send_apdu(connection, apdu, f"SELECT AID {label}")
    return data, sw1, sw2


def read_file_contents(connection, file_id, label):
    """Try to read the contents of the currently selected file."""
    results = []

    # Try READ BINARY at multiple offsets
    offset = 0
    all_data = []
    while offset < 4096:
        chunk_size = 256 if offset == 0 else 128
        data, sw1, sw2 = read_binary(connection, offset, chunk_size if chunk_size < 256 else 0)

        if sw1 == 0x6C:
            # Wrong length - retry with correct length
            data, sw1, sw2 = read_binary(connection, offset, sw2)

        if sw1 == 0x61:
            # More data available - get response
            data, sw1, sw2 = get_response(connection, sw2)

        if sw1 == 0x90 and sw2 == 0x00 and data:
            all_data.extend(data)
            offset += len(data)
            if len(data) < chunk_size:
                break
        elif sw1 == 0x6B:
            # Offset out of range
            break
        else:
            break

    if all_data:
        results.append(("BINARY", all_data))

    # Try READ RECORD for record-based files
    for rec_num in range(1, 16):
        data, sw1, sw2 = read_record(connection, rec_num)

        if sw1 == 0x6C:
            data, sw1, sw2 = read_record(connection, rec_num, sw2)

        if sw1 == 0x61:
            data, sw1, sw2 = get_response(connection, sw2)

        if sw1 == 0x90 and sw2 == 0x00 and data:
            results.append((f"RECORD #{rec_num}", data))
        elif sw1 == 0x6A and sw2 == 0x83:
            # Record not found - no more records
            break
        elif sw1 == 0x69 and sw2 == 0x86:
            # Command not allowed (wrong file type for records)
            break

    return results


def sw_description(sw1, sw2):
    """Return human-readable description of status word."""
    sw = (sw1 << 8) | sw2
    descriptions = {
        0x9000: "OK",
        0x6982: "Security status not satisfied (need PIN/auth)",
        0x6985: "Conditions of use not satisfied",
        0x6986: "Command not allowed (no current EF)",
        0x6A82: "File not found",
        0x6A83: "Record not found",
        0x6A86: "Incorrect P1P2",
        0x6A88: "Referenced data not found",
        0x6B00: "Wrong parameters (offset outside EF)",
        0x6D00: "INS not supported",
        0x6E00: "CLA not supported",
    }
    if sw1 == 0x61:
        return f"{sw2} bytes available (use GET RESPONSE)"
    if sw1 == 0x6C:
        return f"Wrong Le, correct length is {sw2}"
    return descriptions.get(sw, f"Unknown ({sw1:02X}{sw2:02X})")


def check_pin_retries(connection, pin_ref):
    """Check remaining PIN retries without using an attempt.
    Send VERIFY with empty data - card responds with 63Cx where x = retries left."""
    apdu = [0x00, 0x20, 0x00, pin_ref]
    data, sw1, sw2 = send_apdu(connection, apdu, f"CHECK PIN {pin_ref:02X}")
    if sw1 == 0x63 and (sw2 & 0xF0) == 0xC0:
        return sw2 & 0x0F  # remaining retries
    if sw1 == 0x69 and sw2 == 0x83:
        return 0  # PIN blocked
    if sw1 == 0x69 and sw2 == 0x84:
        return -2  # reference data not usable
    if sw1 == 0x6A and sw2 == 0x88:
        return -1  # PIN reference not found
    if sw1 == 0x90 and sw2 == 0x00:
        return 99  # already verified (no PIN needed)
    return -1  # unknown / not supported


def verify_pin(connection, pin_ref, pin_bytes):
    """Send VERIFY PIN command. pin_bytes is the PIN as a list of bytes.
    Returns (success, sw1, sw2)."""
    # Pad PIN to 8 bytes with 0xFF (standard ISO 7816 padding)
    padded = list(pin_bytes) + [0xFF] * (8 - len(pin_bytes))
    apdu = [0x00, 0x20, 0x00, pin_ref, 0x08] + padded[:8]
    data, sw1, sw2 = send_apdu(connection, apdu, f"VERIFY PIN {pin_ref:02X}")
    return sw1 == 0x90 and sw2 == 0x00, sw1, sw2


def try_pin_unlock(connection):
    """Probe PIN references and try common transport PINs.
    Returns list of (pin_ref, pin_value) that succeeded."""

    # PIN references to check
    pin_refs = [
        (0x01, "Global CHV1"),
        (0x02, "Global CHV2"),
        (0x81, "Local PIN 1"),
        (0x82, "Local PIN 2"),
    ]

    # Common transport PINs for European health insurance cards
    # Format: (description, bytes)
    transport_pins = [
        ("123456",   [0x31, 0x32, 0x33, 0x34, 0x35, 0x36]),
        ("000000",   [0x30, 0x30, 0x30, 0x30, 0x30, 0x30]),
        ("12345678", [0x31, 0x32, 0x33, 0x34, 0x35, 0x36, 0x37, 0x38]),
        ("00000000", [0x30, 0x30, 0x30, 0x30, 0x30, 0x30, 0x30, 0x30]),
        ("1234",     [0x31, 0x32, 0x33, 0x34]),
        ("0000",     [0x30, 0x30, 0x30, 0x30]),
        # BCD-encoded variants
        ("123456 (BCD)",   [0x12, 0x34, 0x56]),
        ("000000 (BCD)",   [0x00, 0x00, 0x00]),
    ]

    print("\n--- PIN / Authentication Probing ---")

    # Phase 1: Check which PIN references exist and their retry counters
    active_pins = []
    for pin_ref, pin_name in pin_refs:
        retries = check_pin_retries(connection, pin_ref)
        if retries == 99:
            print(f"  {pin_name} (P2={pin_ref:02X}): Already verified / no PIN needed")
            active_pins.append((pin_ref, pin_name, retries))
        elif retries >= 0:
            print(f"  {pin_name} (P2={pin_ref:02X}): {retries} retries remaining")
            active_pins.append((pin_ref, pin_name, retries))
        elif retries == 0:
            print(f"  {pin_name} (P2={pin_ref:02X}): BLOCKED")
        elif retries == -2:
            print(f"  {pin_name} (P2={pin_ref:02X}): reference data not usable")
        else:
            pass  # PIN reference doesn't exist, skip silently

    if not active_pins:
        print("  No active PIN references found on this card.")
        return []

    # Phase 2: Try transport PINs (only if enough retries)
    unlocked = []
    for pin_ref, pin_name, retries in active_pins:
        if retries == 99:
            unlocked.append((pin_ref, "(already verified)"))
            continue
        if retries < 3:
            print(f"\n  Skipping {pin_name}: only {retries} retries left (too risky)")
            continue

        print(f"\n  Trying transport PINs on {pin_name} ({retries} retries)...")
        for pin_desc, pin_bytes in transport_pins:
            # Re-check retries before each attempt
            current_retries = check_pin_retries(connection, pin_ref)
            if current_retries < 3:
                print(f"    Stopping: retries dropped to {current_retries}")
                break

            success, sw1, sw2 = verify_pin(connection, pin_ref, pin_bytes)
            if success:
                print(f"    PIN '{pin_desc}' -> OK! Unlocked {pin_name}")
                unlocked.append((pin_ref, pin_desc))
                break
            else:
                remaining = sw2 & 0x0F if sw1 == 0x63 else "?"
                print(f"    PIN '{pin_desc}' -> Wrong (retries left: {remaining})")

    return unlocked


def parse_ef_dir_entries(data):
    """Parse EF.DIR TLV to extract DF paths from tag 51 entries."""
    entries = []
    try:
        tlv_list = parse_tlv(data)
        for entry in tlv_list:
            if entry["tag"] == "61":
                name = ""
                path = None
                for child in entry["children"]:
                    if child["tag"] == "50":
                        name = bytes(child["value"]).decode("ascii", errors="replace")
                    if child["tag"] == "51":
                        val = child["value"]
                        # Path is pairs of bytes: e.g. 3F 00 DF 01
                        # We want the last 2 bytes as the DF ID
                        if len(val) >= 4:
                            path = (val[-2] << 8) | val[-1]
                if path is not None:
                    entries.append((path, name))
    except Exception:
        pass
    return entries


def discover_card(connection):
    """Run the full discovery process on a connected card."""
    print("=" * 70)
    print("SMART CARD DISCOVERY REPORT")
    print("=" * 70)

    # 1. Read ATR
    print("\n--- ATR (Answer To Reset) ---")
    atr = connection.getATR()
    print(f"  Raw: {toHexString(atr)}")

    try:
        atr_obj = ATR(atr)
        print(f"  Historical bytes: {toHexString(atr_obj.getHistoricalBytes())}")
        print(f"  T=0 supported: {atr_obj.isT0Supported()}")
        print(f"  T=1 supported: {atr_obj.isT1Supported()}")
        print(f"  T=15 supported: {atr_obj.isT15Supported()}")
    except Exception as e:
        print(f"  ATR parse error: {e}")

    # Decode historical bytes as text
    hist = atr_obj.getHistoricalBytes() if atr_obj else []
    if hist:
        decoded = try_decode(hist)
        for enc, text in decoded.items():
            if enc != "hex":
                print(f"  Historical ({enc}): {text}")

    # 2. Try known AIDs
    print("\n--- Application Selection (by AID) ---")
    found_aids = []
    for aid_hex, label in KNOWN_AIDS.items():
        data, sw1, sw2 = select_by_aid(connection, aid_hex, label)
        status = f"{sw1:02X}{sw2:02X}"
        if sw1 == 0x90 or sw1 == 0x61:
            print(f"  FOUND: {label} (AID: {aid_hex}) -> SW={status}")
            found_aids.append((aid_hex, label))
            if data:
                print(f"    Response: {toHexString(data)}")
                decoded = try_decode(data)
                for enc, text in decoded.items():
                    if enc != "hex":
                        print(f"    ({enc}): {text}")
            if sw1 == 0x61:
                resp_data, resp_sw1, resp_sw2 = get_response(connection, sw2)
                if resp_sw1 == 0x90 and resp_data:
                    print(f"    GET RESPONSE: {toHexString(resp_data)}")
        else:
            print(f"  Not found: {label} (AID: {aid_hex}) -> SW={status}")

    # 3. Read eCH-0064 patient data (EF.ID and EF.AD at MF level)
    print("\n--- eCH-0064 Patient Data ---")
    select_file(connection, 0x3F00)

    # EF.ID = 2F06 (84 bytes): name, DOB, insurance number, sex
    data, sw1, sw2 = select_file_with_fci(connection, 0x2F06)
    if sw1 == 0x61:
        data, sw1, sw2 = get_response(connection, sw2)
    if sw1 == 0x90:
        id_data, sw1, sw2 = read_binary(connection, 0, 84)
        if sw1 == 0x6C:
            id_data, sw1, sw2 = read_binary(connection, 0, sw2)
        if sw1 == 0x90 and id_data:
            print("  EF.ID (2F06) - Identification Data:")
            print(f"    Raw: {toHexString(id_data)}")
            # Parse TLV: starts with 0x65, then tag/len/value pairs
            try:
                raw = bytes(id_data)
                if raw[0] == 0x65:
                    offset = 2  # skip 0x65 + length byte
                    fields = [
                        (0x80, "Name"),
                        (0x82, "Date of Birth"),
                        (0x83, "Insurance Number (AHV)"),
                        (0x84, "Sex"),
                    ]
                    for expected_tag, field_name in fields:
                        if offset >= len(raw):
                            break
                        tag = raw[offset]
                        offset += 1
                        length = raw[offset]
                        offset += 1
                        value = raw[offset:offset + length]
                        offset += length
                        if tag == 0x84:  # sex is binary
                            sex_map = {0: "unknown", 1: "male", 2: "female", 9: "n/a"}
                            print(f"    {field_name}: {sex_map.get(value[0], value[0])}")
                        elif tag == 0x82:  # date YYYYMMDD
                            date_str = value.decode("utf-8", errors="replace")
                            print(f"    {field_name}: {date_str[:4]}-{date_str[4:6]}-{date_str[6:8]}")
                        elif tag == 0x80:  # name: "Family,Given"
                            name_str = value.decode("utf-8", errors="replace")
                            parts = name_str.split(",")
                            if len(parts) >= 2:
                                print(f"    Family Name: {parts[0].strip()}")
                                print(f"    Given Name: {parts[1].strip()}")
                            else:
                                print(f"    {field_name}: {name_str}")
                        else:
                            print(f"    {field_name}: {value.decode('utf-8', errors='replace')}")
            except Exception as e:
                print(f"    Parse error: {e}")
        else:
            print(f"  EF.ID (2F06): READ failed ({sw_description(sw1, sw2)})")
    else:
        print(f"  EF.ID (2F06): not found ({sw_description(sw1, sw2)})")

    # EF.AD = 2F07 (95 bytes): state, insurer, BAG number, card number, expiry
    select_file(connection, 0x3F00)
    data, sw1, sw2 = select_file_with_fci(connection, 0x2F07)
    if sw1 == 0x61:
        data, sw1, sw2 = get_response(connection, sw2)
    if sw1 == 0x90:
        ad_data, sw1, sw2 = read_binary(connection, 0, 95)
        if sw1 == 0x6C:
            ad_data, sw1, sw2 = read_binary(connection, 0, sw2)
        if sw1 == 0x90 and ad_data:
            print("\n  EF.AD (2F07) - Administrative Data:")
            print(f"    Raw: {toHexString(ad_data)}")
            try:
                raw = bytes(ad_data)
                if raw[0] == 0x65:
                    offset = 2
                    fields = [
                        (0x90, "Issuing State"),
                        (0x91, "Insurance Name"),
                        (0x92, "Insurance BAG Number"),
                        (0x93, "Card Number"),
                        (0x94, "Expiry Date"),
                    ]
                    for expected_tag, field_name in fields:
                        if offset >= len(raw):
                            break
                        tag = raw[offset]
                        offset += 1
                        length = raw[offset]
                        offset += 1
                        value = raw[offset:offset + length]
                        offset += length
                        if tag == 0x94:  # date YYYYMMDD
                            date_str = value.decode("utf-8", errors="replace")
                            print(f"    {field_name}: {date_str[:4]}-{date_str[4:6]}-{date_str[6:8]}")
                        else:
                            print(f"    {field_name}: {value.decode('utf-8', errors='replace')}")
            except Exception as e:
                print(f"    Parse error: {e}")
        else:
            print(f"  EF.AD (2F07): READ failed ({sw_description(sw1, sw2)})")
    else:
        print(f"  EF.AD (2F07): not found ({sw_description(sw1, sw2)})")

    # 4. Select MF and scan known file IDs
    print("\n--- File Structure Scan (MF level) ---")
    select_file(connection, 0x3F00)  # Select MF first

    found_files = []
    ef_dir_data = None
    for file_id, label in KNOWN_FILES.items():
        if file_id == 0x3F00:
            continue  # Already selected MF

        # Try SELECT with FCI to get file info
        data, sw1, sw2 = select_file_with_fci(connection, file_id)
        status = f"{sw1:02X}{sw2:02X}"

        if sw1 == 0x61:
            resp_data, resp_sw1, resp_sw2 = get_response(connection, sw2)
            if resp_sw1 == 0x90 and resp_data:
                data = resp_data
                sw1, sw2 = resp_sw1, resp_sw2

        if sw1 == 0x90:
            found_files.append((file_id, label))
            print(f"\n  FOUND: {label} ({file_id:04X}) -> SW={status}")
            if data:
                print(f"    FCI: {toHexString(data)}")
                try:
                    tlv = parse_tlv(data)
                    if tlv:
                        print("    FCI parsed:")
                        print_tlv(tlv, indent=3)
                except Exception:
                    pass

            # Read file contents
            contents = read_file_contents(connection, file_id, label)
            for content_type, content_data in contents:
                print(f"\n    [{content_type}] ({len(content_data)} bytes):")
                print(f"      Hex: {toHexString(content_data)}")

                decoded = try_decode(content_data)
                for enc, text in decoded.items():
                    if enc != "hex":
                        print(f"      ({enc}): {text}")

                # Try TLV parsing
                try:
                    tlv = parse_tlv(content_data)
                    if tlv:
                        print(f"      TLV parsed:")
                        print_tlv(tlv, indent=4)
                except Exception:
                    pass

                # Save EF.DIR data for DF discovery
                if file_id == 0x2F00 and content_type == "BINARY":
                    ef_dir_data = content_data

            # Re-select MF before next file to handle DF navigation
            select_file(connection, 0x3F00)

    # 4. Explore DFs found in EF.DIR using multiple SELECT strategies
    df_entries = []
    if ef_dir_data:
        df_entries = parse_ef_dir_entries(ef_dir_data)

    if df_entries:
        print("\n--- DF (Directory File) Exploration ---")
        print("  (Using path-based SELECT to properly navigate into each DF)")
        all_df_files = {}

        # EF IDs to scan inside each DF
        ef_scan_ids = list(range(0x0001, 0x0020)) + list(range(0x0100, 0x0110)) + \
                      list(range(0xC000, 0xC010)) + list(range(0xC100, 0xC110))

        for df_id, df_name in df_entries:
            df_hi = (df_id >> 8) & 0xFF
            df_lo = df_id & 0xFF

            print(f"\n  === {df_name} ({df_id:04X}) ===")

            # Strategy 1: SELECT by absolute path from MF (P1=08)
            path = [0x3F, 0x00, df_hi, df_lo]
            data, sw1, sw2 = select_by_path_from_mf(connection, path)
            method_used = "path-from-MF (P1=08)"

            if sw1 == 0x61:
                data, sw1, sw2 = get_response(connection, sw2)

            # Strategy 2: SELECT MF then child DF (P1=01)
            if sw1 != 0x90:
                select_file(connection, 0x3F00)
                data, sw1, sw2 = select_child_df(connection, df_id)
                method_used = "child-DF (P1=01)"
                if sw1 == 0x61:
                    data, sw1, sw2 = get_response(connection, sw2)

            # Strategy 3: SELECT MF then SELECT by ID (P1=00) - what we tried before
            if sw1 != 0x90:
                select_file(connection, 0x3F00)
                data, sw1, sw2 = select_file_with_fci(connection, df_id)
                method_used = "by-ID (P1=00)"
                if sw1 == 0x61:
                    data, sw1, sw2 = get_response(connection, sw2)

            if sw1 != 0x90:
                print(f"    Could not select DF: {sw_description(sw1, sw2)}")
                all_df_files[df_name] = []
                continue

            print(f"    Selected via: {method_used}")
            if data:
                print(f"    FCI: {toHexString(data)}")
                try:
                    tlv = parse_tlv(data)
                    if tlv:
                        print("    FCI parsed:")
                        print_tlv(tlv, indent=3)
                except Exception:
                    pass

            # Now scan EFs inside this DF using multiple strategies
            print(f"    Scanning for EFs...")
            found_efs = []

            for ef_id in ef_scan_ids:
                ef_hi = (ef_id >> 8) & 0xFF
                ef_lo = ef_id & 0xFF

                # Try child EF select (P1=02) - selects EF under current DF
                fci_data, s1, s2 = select_child_ef(connection, ef_id)

                if s1 == 0x61:
                    fci_data, s1, s2 = get_response(connection, s2)

                # If P1=02 fails, try path-based: MF/DF/EF (P1=08)
                if s1 != 0x90:
                    ef_path = [0x3F, 0x00, df_hi, df_lo, ef_hi, ef_lo]
                    fci_data, s1, s2 = select_by_path_from_mf(connection, ef_path)
                    if s1 == 0x61:
                        fci_data, s1, s2 = get_response(connection, s2)

                if s1 != 0x90:
                    continue

                label = f"EF.{ef_id:04X}"
                found_efs.append((ef_id, label))
                print(f"\n      FOUND: {label} ({ef_id:04X})")

                if fci_data:
                    print(f"        FCI: {toHexString(fci_data)}")
                    try:
                        tlv = parse_tlv(fci_data)
                        if tlv:
                            print("        FCI parsed:")
                            print_tlv(tlv, indent=5)
                    except Exception:
                        pass

                # Try reading the file
                contents = read_file_contents(connection, ef_id, label)
                if not contents:
                    # Check if it's an auth issue by trying a read and reporting status
                    test_data, ts1, ts2 = read_binary(connection, 0, 1)
                    if ts1 == 0x69:
                        print(f"        READ blocked: {sw_description(ts1, ts2)}")
                    elif ts1 == 0x6A and ts2 == 0x82:
                        # Read record instead?
                        pass
                    else:
                        print(f"        READ status: {sw_description(ts1, ts2)}")

                for content_type, content_data in contents:
                    print(f"\n        [{content_type}] ({len(content_data)} bytes):")
                    print(f"          Hex: {toHexString(content_data)}")

                    decoded = try_decode(content_data)
                    for enc, text in decoded.items():
                        if enc != "hex":
                            print(f"          ({enc}): {text}")

                    try:
                        tlv = parse_tlv(content_data)
                        if tlv:
                            print(f"          TLV parsed:")
                            print_tlv(tlv, indent=6)
                    except Exception:
                        pass

                # Re-select the DF to stay in context for next EF
                select_by_path_from_mf(connection, [0x3F, 0x00, df_hi, df_lo])

            all_df_files[df_name] = found_efs
            if not found_efs:
                print(f"      (no EFs found)")

    # 5. Try PIN authentication
    select_file(connection, 0x3F00)  # Reset to MF
    unlocked = try_pin_unlock(connection)

    # 6. If we unlocked something, re-read protected files
    if unlocked and df_entries:
        print("\n--- Re-reading protected files after PIN unlock ---")
        for df_id, df_name in df_entries:
            df_hi = (df_id >> 8) & 0xFF
            df_lo = df_id & 0xFF

            # Navigate into DF
            select_file(connection, 0x3F00)
            select_child_df(connection, df_id)

            for ef_id in ef_scan_ids:
                ef_hi = (ef_id >> 8) & 0xFF
                ef_lo = ef_id & 0xFF

                fci_data, s1, s2 = select_child_ef(connection, ef_id)
                if s1 == 0x61:
                    fci_data, s1, s2 = get_response(connection, s2)
                if s1 != 0x90:
                    continue

                contents = read_file_contents(connection, ef_id, f"{df_name}/EF.{ef_id:04X}")
                if contents:
                    print(f"\n  {df_name} / EF.{ef_id:04X}:")
                    for content_type, content_data in contents:
                        print(f"    [{content_type}] ({len(content_data)} bytes):")
                        print(f"      Hex: {toHexString(content_data)}")

                        decoded = try_decode(content_data)
                        for enc, text in decoded.items():
                            if enc != "hex":
                                print(f"      ({enc}): {text}")

                        try:
                            tlv = parse_tlv(content_data)
                            if tlv:
                                print(f"      TLV parsed:")
                                print_tlv(tlv, indent=4)
                        except Exception:
                            pass

                # Re-select DF for next EF
                select_file(connection, 0x3F00)
                select_child_df(connection, df_id)

    # 7. Summary
    print("\n" + "=" * 70)
    print("DISCOVERY SUMMARY")
    print("=" * 70)
    print(f"  ATR: {toHexString(atr)}")
    print(f"  Chip: MTCOS p 2.1 (MaskTech)")
    print(f"  Applications found: {len(found_aids)}")
    for aid_hex, label in found_aids:
        print(f"    - {label} ({aid_hex})")
    print(f"  Files at MF level: {len(found_files)}")
    for file_id, label in found_files:
        print(f"    - {label} ({file_id:04X})")
    if df_entries:
        print(f"  DFs explored:")
        for df_id, df_name in df_entries:
            ef_list = all_df_files.get(df_name, [])
            marker = f"({len(ef_list)} EFs)" if ef_list else "(empty or needs auth)"
            print(f"    - {df_name} ({df_id:04X}) {marker}")
            for ef_id, ef_label in ef_list:
                print(f"        - {ef_label} ({ef_id:04X})")

    if not found_aids and not found_files:
        print("\n  No standard files or applications found.")
        print("  The card may use a proprietary format or require authentication.")
        print("  Try running 'opensc-tool --atr' or 'pcsc_scan' for more info.")

    print()


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main():
    print("Viali Smart Card Discovery Tool")
    print("-" * 40)

    # List available readers
    available_readers = readers()
    if not available_readers:
        print("ERROR: No smart card readers found.")
        print("Make sure:")
        print("  1. A USB card reader is plugged in")
        print("  2. pcscd service is running: sudo systemctl start pcscd")
        print("  3. pcsc-tools is installed: sudo apt install pcsc-tools")
        sys.exit(1)

    print(f"\nFound {len(available_readers)} reader(s):")
    for i, reader in enumerate(available_readers):
        print(f"  [{i}] {reader}")

    # Connect to first reader
    reader = available_readers[0]
    print(f"\nConnecting to: {reader}")

    try:
        connection = reader.createConnection()
        connection.connect()
    except NoCardException:
        print("ERROR: No card inserted in the reader.")
        print("Insert an insurance card and try again.")
        sys.exit(1)
    except CardConnectionException as e:
        print(f"ERROR: Could not connect to card: {e}")
        sys.exit(1)

    try:
        discover_card(connection)
    except Exception as e:
        print(f"\nERROR during discovery: {e}")
        import traceback
        traceback.print_exc()
    finally:
        try:
            connection.disconnect()
        except Exception:
            pass


if __name__ == "__main__":
    main()
