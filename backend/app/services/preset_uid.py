"""
JUCE hashCode64 implementation for Neural DSP preset UID computation.
Reads binary .xml preset files to extract preset metadata.
"""
import struct
from pathlib import Path


def juce_hash_code_64(s: str) -> int:
    """JUCE String::hashCode64() reimplementation."""
    result = 0
    for c in s:
        result = (101 * result + ord(c)) & 0xFFFFFFFFFFFFFFFF
    if result >= 0x8000000000000000:
        result -= 0x10000000000000000
    return result


def extract_preset_uid(filepath: str) -> dict:
    """
    Read a Neural DSP .xml preset binary file and extract:
    - presetNameProp, presetPathProp, presetUIDProp
    """
    try:
        with open(filepath, "rb") as f:
            data = f.read()
    except Exception:
        return {"file_path": filepath}

    result = {"file_path": filepath}

    # Extract presetNameProp (display name)
    marker = b"presetNameProp"
    idx = data.find(marker)
    if idx >= 0:
        after = data[idx + len(marker):]
        if len(after) > 4 and after[0:2] == b"\x00\x01":
            if after[3] == 0x05:  # string type
                str_start = 4
                str_end = after.find(b"\x00", str_start)
                if str_end > str_start:
                    result["name"] = after[str_start:str_end].decode("utf-8", errors="replace")

    # Extract presetPathProp
    marker = b"presetPathProp"
    idx = data.find(marker)
    if idx >= 0:
        after = data[idx + len(marker):]
        if len(after) > 4 and after[0:2] == b"\x00\x01":
            str_start = 4
            str_end = after.find(b"\x00", str_start)
            if str_end > str_start:
                result["path_prop"] = after[str_start:str_end].decode("utf-8", errors="replace")

    # Extract presetUIDProp (int64)
    marker = b"presetUIDProp"
    idx = data.find(marker)
    if idx >= 0:
        after = data[idx + len(marker):]
        if len(after) >= 12 and after[0:4] == b"\x00\x01\x09\x06":
            result["uid_stored"] = struct.unpack("<q", after[4:12])[0]

    # Compute uid from path hash
    if "path_prop" in result:
        result["uid_computed"] = juce_hash_code_64(result["path_prop"])

    # Primary midi_id: stored UID if available, else path hash
    if "uid_stored" in result:
        result["midi_id"] = result["uid_stored"]
    elif "uid_computed" in result:
        result["midi_id"] = result["uid_computed"]

    return result


def compute_preset_id_from_file(filepath: str) -> int | None:
    """Read preset file, return its MIDI mapping ID."""
    info = extract_preset_uid(filepath)
    if "uid_stored" in info:
        return info["uid_stored"]
    return juce_hash_code_64(filepath)
