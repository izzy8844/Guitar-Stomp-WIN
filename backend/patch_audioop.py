"""Patch for Python 3.13+: register audioop from audioop-lts for pydub compatibility."""
import sys
try:
    import audioop
except ImportError:
    try:
        import audioop_lts as audioop
    except ImportError:
        audioop = None

if audioop:
    sys.modules['audioop'] = audioop
    sys.modules['pyaudioop'] = audioop
