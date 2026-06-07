# -*- mode: python ; coding: utf-8 -*-
"""
Guitar AutoStomp Backend — Windows PyInstaller Spec

Key differences from macOS spec:
- FFmpeg binaries are .exe files (ffmpeg.exe, ffprobe.exe)
- python-rtmidi uses WinMM backend (winmm.dll, system-provided)
- Output executable is guitar-autostomp-backend.exe
"""
import sys
import os
from PyInstaller.utils.hooks import collect_all, collect_data_files

datas = []
binaries = []
hiddenimports = ['patch_audioop', 'soundfile']

# Collect rtmidi and mido (includes native .pyd files on Windows)
tmp_ret = collect_all('rtmidi')
datas += tmp_ret[0]; binaries += tmp_ret[1]; hiddenimports += tmp_ret[2]
tmp_ret = collect_all('mido')
datas += tmp_ret[0]; binaries += tmp_ret[1]; hiddenimports += tmp_ret[2]

# Include soundfile data (libsndfile shared library)
tmp_ret = collect_all('soundfile')
datas += tmp_ret[0]; binaries += tmp_ret[1]; hiddenimports += tmp_ret[2]

# Include pydantic (v2 ships a native pydantic_core module that must be bundled)
tmp_ret = collect_all('pydantic')
datas += tmp_ret[0]; binaries += tmp_ret[1]; hiddenimports += tmp_ret[2]

# Include app package source files
datas += [('app', 'app')]

# Include mappings directory (may be empty at build time; created at runtime if missing)
os.makedirs('mappings', exist_ok=True)
datas += [('mappings', 'mappings')]

# Bundle ffmpeg/ffprobe binaries for pydub audio conversion.
# Windows: download from https://github.com/BtbN/FFmpeg-Builds/releases
#   (ffmpeg-master-latest-win64-gpl.zip → extract ffmpeg.exe and ffprobe.exe)
# Place at backend/ffmpeg.exe and backend/ffprobe.exe
if os.path.exists('ffmpeg.exe'):
    binaries += [('ffmpeg.exe', '.')]
if os.path.exists('ffprobe.exe'):
    binaries += [('ffprobe.exe', '.')]


a = Analysis(
    ['main_stdio.py'],
    pathex=[],
    binaries=binaries,
    datas=datas,
    hiddenimports=hiddenimports,
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=[
        # Exclude heavy unused packages to keep bundle size down.
        # Playback is owned by the frontend (Web Audio); the backend never opens
        # an audio output stream, so sounddevice/PortAudio is not needed.
        'fastapi', 'uvicorn', 'websockets', 'aiofiles', 'sounddevice',
    ],
    noarchive=False,
    optimize=0,
)
pyz = PYZ(a.pure)

exe = EXE(
    pyz,
    a.scripts,
    [],
    exclude_binaries=True,
    name='guitar-autostomp-backend',
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,
    console=True,  # Must be True for stdio communication
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
    icon=None,  # TODO: Add .ico file if desired
)
coll = COLLECT(
    exe,
    a.binaries,
    a.datas,
    strip=False,
    upx=True,
    upx_exclude=[],
    name='guitar-autostomp-backend',
)
