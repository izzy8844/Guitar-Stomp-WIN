"""
Guitar AutoStomp — Windows Edition Configuration

Platform-specific paths for:
- Application data storage
- Neural DSP preset locations
- Neural DSP user config (MIDI Mappings)
- FFmpeg binary locations
"""
import sys
import os
import platform
from pathlib import Path

SYSTEM = platform.system()

# ─── Application Data Root ───────────────────────────────────────────���─────────
# In packaged mode (PyInstaller), use a persistent user data directory.
# In development mode, use the project root directory.

if getattr(sys, 'frozen', False):
    # Running as PyInstaller bundle — use persistent user data directory
    if SYSTEM == "Darwin":
        DATA_ROOT = Path(os.path.expanduser("~/Library/Application Support/Guitar AutoStomp"))
    else:
        # Windows: %LOCALAPPDATA%\Guitar AutoStomp
        DATA_ROOT = Path(os.environ.get("LOCALAPPDATA", os.path.expanduser("~\\AppData\\Local"))) / "Guitar AutoStomp"
    DATA_ROOT.mkdir(parents=True, exist_ok=True)
    PROJECT_ROOT = DATA_ROOT

    # MAPPING_DIR: writable user directory for saving MIDI mapping backups.
    MAPPING_DIR = DATA_ROOT / "mappings"
    MAPPING_DIR.mkdir(parents=True, exist_ok=True)

    # Configure pydub to find bundled ffmpeg/ffprobe
    _bundle_dir = Path(sys._MEIPASS)
    if SYSTEM == "Windows":
        _ffmpeg_path = _bundle_dir / "ffmpeg.exe"
        _ffprobe_path = _bundle_dir / "ffprobe.exe"
    else:
        _ffmpeg_path = _bundle_dir / "ffmpeg_bin"
        _ffprobe_path = _bundle_dir / "ffprobe_bin"

    if _ffmpeg_path.exists():
        import pydub
        pydub.AudioSegment.converter = str(_ffmpeg_path)
        pydub.AudioSegment.ffprobe = str(_ffprobe_path) if _ffprobe_path.exists() else None
else:
    # Development mode — use project directory
    PROJECT_ROOT = Path(__file__).parent.parent.parent
    # In dev, mappings/ is relative to backend/ directory
    MAPPING_DIR = Path(__file__).parent.parent / "mappings"
    MAPPING_DIR.mkdir(parents=True, exist_ok=True)

    # In dev mode on Windows, check if ffmpeg.exe is in the backend/ directory
    if SYSTEM == "Windows":
        _dev_backend_dir = Path(__file__).parent.parent
        _ffmpeg_dev = _dev_backend_dir / "ffmpeg.exe"
        _ffprobe_dev = _dev_backend_dir / "ffprobe.exe"
        if _ffmpeg_dev.exists():
            import pydub
            pydub.AudioSegment.converter = str(_ffmpeg_dev)
            pydub.AudioSegment.ffprobe = str(_ffprobe_dev) if _ffprobe_dev.exists() else None

# ─── Neural DSP Preset Locations ──────────────────────────────────────────────
# These are the directories where Neural DSP stores preset .xml files (read-only).
# We try multiple possible locations and pick the first one that exists.

if SYSTEM == "Darwin":
    _POSSIBLE_NEURAL_DSP_PATHS = [
        Path("/Library/Audio/Presets/Neural DSP"),
        Path(os.path.expanduser("~/Library/Audio/Presets/Neural DSP")),
        Path(os.path.expanduser("~/Documents/Neural DSP")),
        Path(os.path.expanduser("~/Music/Neural DSP")),
    ]
else:
    # Windows — Neural DSP presets are typically in one of these locations:
    _POSSIBLE_NEURAL_DSP_PATHS = [
        # Most common: user Documents folder
        Path(os.path.expanduser("~/Documents/Neural DSP")),
        # Some plugins use ProgramData (shared across users)
        Path(os.environ.get("PROGRAMDATA", r"C:\ProgramData")) / "Neural DSP",
        # Public Documents (less common)
        Path(r"C:\Users\Public\Documents\Neural DSP"),
        # Some older installations
        Path(os.environ.get("LOCALAPPDATA", os.path.expanduser("~\\AppData\\Local"))) / "Neural DSP",
    ]

NEURAL_DSP_PRESETS = next((p for p in _POSSIBLE_NEURAL_DSP_PATHS if p.exists()),
                          Path(os.path.expanduser("~/Documents/Neural DSP")))

# ─── Neural DSP User Config (MIDI Mappings, Settings) ─────────────────────────
# This is the writable directory where Neural DSP stores user settings and MIDI mappings.

if SYSTEM == "Darwin":
    NEURAL_DSP_USER_CONFIG = Path(os.path.expanduser("~/Library/Application Support/Neural DSP"))
else:
    # Windows: %APPDATA%\Neural DSP (i.e. C:\Users\<User>\AppData\Roaming\Neural DSP)
    NEURAL_DSP_USER_CONFIG = Path(os.environ.get("APPDATA", os.path.expanduser("~\\AppData\\Roaming"))) / "Neural DSP"

NEURAL_DSP_USER_CONFIG.mkdir(parents=True, exist_ok=True)

# Legacy alias
MIDI_MAPPINGS_BASE = NEURAL_DSP_USER_CONFIG

# ─── Projects Directory ────────────────────────────────────────────────────────
PROJECTS_DIR = PROJECT_ROOT / "data" / "projects"
PROJECTS_DIR.mkdir(parents=True, exist_ok=True)

# ─── Constants ─────────────────────────────────────────────────────────────────
AUDIO_SUPPORTED_FORMATS = [".wav", ".mp3", ".m4a", ".ogg", ".flac", ".aac", ".wma", ".mp4"]
AUDIO_MAX_SIZE_MB = 50
MIDI_DEFAULT_CHANNEL = 0
WS_TICK_INTERVAL_MS = 50
SCHEDULER_ADVANCE_MS = 5
