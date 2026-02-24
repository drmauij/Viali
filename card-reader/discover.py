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

    # 3. Select MF and scan known file IDs
    print("\n--- File Structure Scan ---")
    select_file(connection, 0x3F00)  # Select MF first

    found_files = []
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

            # Re-select MF before next file to handle DF navigation
            select_file(connection, 0x3F00)

    # 4. Summary
    print("\n" + "=" * 70)
    print("DISCOVERY SUMMARY")
    print("=" * 70)
    print(f"  ATR: {toHexString(atr)}")
    print(f"  Applications found: {len(found_aids)}")
    for aid_hex, label in found_aids:
        print(f"    - {label} ({aid_hex})")
    print(f"  Files found: {len(found_files)}")
    for file_id, label in found_files:
        print(f"    - {label} ({file_id:04X})")

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
