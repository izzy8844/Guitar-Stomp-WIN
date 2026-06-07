"""
Audio waveform extraction (server-side fallback).

NOTE: Playback is owned entirely by the frontend (Web Audio API). The backend
no longer performs any audio output. This module only provides a *fallback*
waveform-peak extractor for the rare case where the frontend cannot decode the
audio into an AudioBuffer client-side (see src/app/page.tsx -> extractPeaksFromBuffer).
"""
from pathlib import Path

import numpy as np
import soundfile as sf
from pydub import AudioSegment

_CONVERTIBLE_EXTS = ('.mp3', '.m4a', '.aac', '.wma', '.ogg', '.flac', '.mp4')


class AudioEngine:
    """Stateless server-side waveform extractor (fallback only)."""

    def get_waveform_peaks(self, path: str, num_peaks: int = 800) -> tuple[list, int]:
        """Read an audio file and return (peaks, duration_ms).

        Returns a list of `num_peaks` normalized amplitude peaks (0.0-1.0) and the
        total duration in milliseconds. On any failure returns zeroed peaks and 0 ms.
        """
        try:
            ext = Path(path).suffix.lower()
            if ext in _CONVERTIBLE_EXTS:
                cached = Path(f"{path}.converted.wav")
                if cached.exists():
                    data, sr = sf.read(str(cached), dtype='float32')
                else:
                    # No cached conversion available: convert on demand.
                    audio = AudioSegment.from_file(path)
                    audio.export(str(cached), format="wav")
                    data, sr = sf.read(str(cached), dtype='float32')
            else:
                data, sr = sf.read(path, dtype='float32')

            total_frames = data.shape[0]
            duration_ms = int(total_frames / sr * 1000) if sr > 0 else 0

            if data.ndim > 1:
                data = data.mean(axis=1)
            data = np.abs(data)
            max_val = float(np.max(data)) or 1.0
            data = data / max_val

            chunk_size = max(1, len(data) // num_peaks)
            peaks = []
            for i in range(0, len(data), chunk_size):
                chunk = data[i:i + chunk_size]
                peaks.append(float(np.max(chunk)))
                if len(peaks) >= num_peaks:
                    break
            while len(peaks) < num_peaks:
                peaks.append(0.0)
            return peaks[:num_peaks], duration_ms
        except Exception:
            return [0.0] * num_peaks, 0
