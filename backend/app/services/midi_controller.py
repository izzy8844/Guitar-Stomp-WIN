"""
MIDI output controller — Windows Edition.

Key difference from macOS:
- macOS supports native virtual MIDI ports via CoreMIDI (mido.open_output('name', virtual=True))
- Windows does NOT support virtual MIDI ports natively
- Solution: detect and connect to loopMIDI ports (or any loopback driver)

Strategy:
1. On startup, scan for ports matching known loopback names ("loopMIDI", "AutoStomp")
2. If found → auto-connect as default output
3. If not found → return status info so frontend can guide user to install loopMIDI
4. Fallback: user can manually select any available MIDI output port
"""
import sys
import platform

SYSTEM = platform.system()

try:
    import mido
    HAS_MIDO = True
except ImportError as e:
    print(f"[MIDI] WARNING: mido import failed: {e}", file=sys.stderr)
    HAS_MIDO = False

_virtual_port = None
_virtual_port_name: str | None = None
_port_cache: dict[str, object] = {}

# Known loopback port name patterns (case-insensitive matching)
_LOOPBACK_PATTERNS = ["loopmidi", "autostomp", "loop midi", "virtual midi"]


def _find_loopback_port() -> str | None:
    """
    Scan available MIDI output ports for a loopback/virtual port.
    Returns the port name if found, None otherwise.
    
    Priority:
    1. Port containing "AutoStomp" (our recommended loopMIDI port name)
    2. Port containing "loopMIDI" (default loopMIDI port name)
    3. Any port matching other known loopback patterns
    """
    if not HAS_MIDO:
        return None
    
    ports = list(mido.get_output_names())
    
    # Priority 1: "AutoStomp" in port name
    for port in ports:
        if "autostomp" in port.lower():
            return port
    
    # Priority 2: "loopMIDI" in port name
    for port in ports:
        if "loopmidi" in port.lower():
            return port
    
    # Priority 3: Other loopback patterns
    for port in ports:
        port_lower = port.lower()
        for pattern in _LOOPBACK_PATTERNS:
            if pattern in port_lower:
                return port
    
    return None


def init_virtual_port() -> bool:
    """
    Initialize the virtual MIDI port.
    
    On macOS: Creates a native virtual port via CoreMIDI.
    On Windows: Detects and connects to a loopMIDI port.
    
    Returns True if a virtual/loopback port is available, False otherwise.
    Idempotent — calling multiple times will not create duplicate connections.
    """
    global _virtual_port, _virtual_port_name
    
    if _virtual_port is not None:
        print("[MIDI] Virtual port already connected, skipping", file=sys.stderr)
        return True
    
    if not HAS_MIDO:
        print("[MIDI] Cannot initialize: mido not available", file=sys.stderr)
        return False
    
    if SYSTEM == "Darwin":
        # macOS: Create native virtual port
        try:
            _virtual_port = mido.open_output('AutoStomp Virtual', virtual=True)
            _virtual_port_name = 'AutoStomp Virtual'
            print(f"[MIDI] Virtual port 'AutoStomp Virtual' created successfully", file=sys.stderr)
            return True
        except Exception as e:
            print(f"[MIDI] WARNING: Failed to create virtual port: {e}", file=sys.stderr)
            return False
    else:
        # Windows: Find and connect to a loopback port
        loopback = _find_loopback_port()
        if loopback:
            try:
                _virtual_port = mido.open_output(loopback)
                _virtual_port_name = loopback
                print(f"[MIDI] Connected to loopback port: '{loopback}'", file=sys.stderr)
                return True
            except Exception as e:
                print(f"[MIDI] WARNING: Found loopback port '{loopback}' but failed to open: {e}", file=sys.stderr)
                return False
        else:
            print("[MIDI] No loopback port found. Please install loopMIDI and create a port named 'AutoStomp Virtual'.", file=sys.stderr)
            print("[MIDI] Download loopMIDI: https://www.tobias-erichsen.de/software/loopmidi.html", file=sys.stderr)
            return False


def get_virtual_port():
    """Get the virtual/loopback port, attempting to initialize if needed."""
    global _virtual_port
    if _virtual_port is None:
        init_virtual_port()
    return _virtual_port


def get_virtual_port_status() -> dict:
    """
    Get the current virtual port status — used by frontend to show guidance.
    
    Returns:
        {
            "available": bool,
            "port_name": str | None,
            "platform": "windows" | "darwin",
            "needs_loopback": bool,
            "loopback_url": str (download link for loopMIDI)
        }
    """
    return {
        "available": _virtual_port is not None,
        "port_name": _virtual_port_name,
        "platform": "windows" if SYSTEM == "Windows" else "darwin",
        "needs_loopback": SYSTEM == "Windows" and _virtual_port is None,
        "loopback_url": "https://www.tobias-erichsen.de/software/loopmidi.html",
    }


def send_pc(port_name: str, pc_value: int, channel: int = 0):
    """Send MIDI Program Change. Raises on failure so caller can report accurately."""
    if not HAS_MIDO:
        raise RuntimeError("MIDI not available (mido not imported)")
    
    # Determine target port
    target = port_name or _virtual_port_name or 'AutoStomp Virtual'
    
    if target == _virtual_port_name and _virtual_port is not None:
        port = _virtual_port
    elif target == 'AutoStomp Virtual' and _virtual_port is not None:
        port = _virtual_port
    else:
        # Open or retrieve from cache
        if target not in _port_cache:
            try:
                _port_cache[target] = mido.open_output(target)
            except Exception as e:
                raise RuntimeError(f"Failed to open MIDI port '{target}': {e}")
        port = _port_cache[target]
    
    if port is None:
        raise RuntimeError(f"MIDI port '{target}' is not available")
    
    msg = mido.Message('program_change', program=max(0, min(127, pc_value)), channel=channel)
    port.send(msg)


def list_available_outputs() -> list[str]:
    """List all available MIDI output ports."""
    if not HAS_MIDO:
        return []
    ports = list(mido.get_output_names())
    
    # On macOS, ensure virtual port shows up
    if SYSTEM == "Darwin":
        if 'AutoStomp Virtual' not in ports:
            ports.insert(0, 'AutoStomp Virtual')
    else:
        # On Windows, indicate the loopback port (if connected) at the top
        if _virtual_port_name and _virtual_port_name in ports:
            ports.remove(_virtual_port_name)
            ports.insert(0, _virtual_port_name)
    
    return ports


def cleanup():
    """Close all open MIDI ports."""
    global _port_cache, _virtual_port, _virtual_port_name
    for p in _port_cache.values():
        try:
            p.close()
        except Exception:
            pass
    _port_cache = {}
    if _virtual_port:
        try:
            _virtual_port.close()
        except Exception:
            pass
    _virtual_port = None
    _virtual_port_name = None
