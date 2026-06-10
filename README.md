<p align="center">
  <img src="https://img.shields.io/badge/platform-Windows%20x64-blue?logo=windows" alt="Platform: Windows x64">
  <img src="https://img.shields.io/badge/version-1.0.0-green" alt="Version 1.0.0">
  <img src="https://img.shields.io/badge/license-MIT-purple" alt="License MIT">
  <img src="https://img.shields.io/badge/electron-42%2B-9cf?logo=electron" alt="Electron 42+">
  <img src="https://img.shields.io/badge/next.js-16-000?logo=next.js" alt="Next.js 16">
  <img src="https://img.shields.io/badge/python-3.13-3776AB?logo=python" alt="Python 3.13">
</p>

<h1 align="center">🎸 Guitar AutoStomp</h1>
<p align="center"><em>Never step on a pedal during a performance again.</em></p>

<p align="center">
  Guitar AutoStomp is a desktop application that <strong>automatically switches your guitar tone</strong> at exactly the right moment in a backing track — by sending MIDI Program Change messages to your Neural DSP plugin inside your DAW.
</p>

---

## 📖 Table of Contents

- [What It Does](#-what-it-does)
- [Screenshots](#-screenshots)
- [Features](#-features)
- [Architecture](#-architecture)
- [Tech Stack & Rationale](#-tech-stack--rationale)
- [How MIDI Tone Switching Works](#-how-midi-tone-switching-works)
- [Getting Started](#-getting-started)
- [Project Structure](#-project-structure)
- [Build & Packaging](#-build--packaging)
- [Windows Porting Challenges](#-windows-porting-challenges)
- [Development](#-development)
- [Testing](#-testing)
- [Roadmap](#-roadmap)
- [License](#-license)

---

## 🎯 What It Does

Guitarists using Neural DSP plugins (Archetype: Gojira, Petrucci, Plini, etc.) often need to switch between Clean, Rhythm, and Lead tones mid-song. Doing this manually — clicking with a mouse or tapping a MIDI foot controller — is error-prone and distracting.

**Guitar AutoStomp solves this by letting you program tone changes on a timeline**, just like automating a mixing console. Load a backing track, place triggers at the exact timestamps where tone changes should happen, and the app handles the rest — sending Program Change messages through a virtual MIDI cable into your DAW.

### The Workflow

```
1. Load a backing track (MP3 / WAV / FLAC / MP4)
2. Auto-detect your installed Neural DSP plugins and presets
3. Place triggers on the waveform timeline at tone-change moments
4. Hit Play → AutoStomp sends MIDI Program Change at exactly
   the right time, 5ms ahead for zero-latency switching
```

---

## 🖼 Screenshots

<!-- TODO: Add screenshots when available -->
| Main Editor | Settings |
|:---:|:---:|
| _Waveform + Tone segments + Trigger list_ | _Preset browser & MIDI mapping_ |

---

## ✨ Features

### 🎵 Core Workflow

| Feature | Description |
|---------|-------------|
| **Audio Timeline Editor** | Load backing tracks (MP3, WAV, FLAC, OGG, M4A, AAC, WMA, MP4) and visualize the waveform with zoom/scroll |
| **Trigger Placement** | Click on the waveform or press `Shift+Click` to add tone-change triggers at precise timestamps |
| **Tone Segments** | Color-coded segments above the waveform show which tone is active at any point in the song |
| **Drag-to-Adjust** | Drag trigger markers left/right on the waveform to fine-tune timing |
| **AB Loop** | Select a section of the track and loop it for practice — perfect for nailing that solo |
| **Transport Controls** | Play/Pause/Stop with keyboard shortcuts (Space, Home, End) and real-time position display |

### 🎛️ MIDI & Plugin Integration

| Feature | Description |
|---------|-------------|
| **Auto-Detect Neural DSP Plugins** | Scans your system for installed plugins (Archetype, Parallax, Darkglass, Soldano, etc.) |
| **Preset Scanner** | Reads installed user presets and displays them in the tone picker — no manual setup |
| **MIDI Learn Wizard** | Step-by-step guided wizard to map tones to MIDI Program Change numbers inside the plugin |
| **Auto-Map on First Launch** | Detects your plugin, finds user presets, and auto-generates a MIDI mapping file |
| **Virtual MIDI Port** | Uses **loopMIDI** on Windows to create a virtual MIDI cable to your DAW |
| **Export MIDI Mapping** | Generate and install `.midiMapping` XML files directly into your Neural DSP plugin config |

### 💾 Project Management

| Feature | Description |
|---------|-------------|
| **Multi-Project Support** | Create, save, duplicate, and delete projects — each with its own audio, triggers, and settings |
| **Auto-Save** | Debounced auto-sync to backend after changes |
| **Unsaved Changes Guard** | Warns before switching projects or closing the app if there are unsaved triggers |
| **Undo/Redo** | Full undo/redo stack (Ctrl+Z / Ctrl+Shift+Z) for trigger operations |
| **Project Sidebar** | Browse all projects with trigger counts and quick switching |

### 🎨 UI/UX

| Feature | Description |
|---------|-------------|
| **Dark Theme** | Professional dark UI optimized for studio and stage environments |
| **Zoom-Aware Ruler** | Timeline ruler adapts tick intervals based on zoom level |
| **Status Bar** | Real-time indicator for WebSocket connection, MIDI port, last event, and trigger count |
| **Bilingual Guide** | Built-in user guide (中文 / English) with step-by-step walkthrough |
| **Toast Notifications** | Non-blocking success/error/info toasts for all operations |

---

## 🏗 Architecture

```
┌──────────────────────────────────────────────────────────────┐
│                     Electron Shell (Desktop)                 │
│                                                              │
│  ┌─────────────────────────┐    ┌─────────────────────────┐ │
│  │   Renderer Process       │    │   Main Process (Node.js) │ │
│  │                          │    │                          │ │
│  │  ┌────────────────────┐ │    │  • IPC Handler Layer     │ │
│  │  │  Next.js 16         │ │◄──►│  • File I/O (audio)     │ │
│  │  │  React 19           │ │IPC │  • FFmpeg transcoding   │ │
│  │  │  Tailwind CSS 4     │ │    │  • Process lifecycle    │ │
│  │  │  Zustand (state)    │ │    │                          │ │
│  │  └────────────────────┘ │    └───────────┬─────────────┘ │
│  │                          │               │               │
│  │  ┌────────────────────┐ │               │ stdio pipe    │
│  │  │  Web Audio API      │ │               │ (JSON-RPC)    │
│  │  │  (playback engine)  │ │               │               │
│  │  └────────────────────┘ │    ┌───────────▼─────────────┐ │
│  │                          │    │   Python 3.13 Backend   │ │
│  └──────────────────────────┘    │                          │ │
│                                  │  ┌────────────────────┐ │ │
│                                  │  │  MIDI Controller    │─┼─┼──► loopMIDI Port
│                                  │  │  (python-rtmidi)    │ │ │    → DAW → Plugin
│                                  │  └────────────────────┘ │ │
│                                  │  ┌────────────────────┐ │ │
│                                  │  │  Audio Engine       │ │ │
│                                  │  │  (pydub+ffmpeg)     │ │ │
│                                  │  └────────────────────┘ │ │
│                                  │  ┌────────────────────┐ │ │
│                                  │  │  Preset Scanner     │ │ │
│                                  │  │  + MIDI XML Gen     │ │ │
│                                  │  └────────────────────┘ │ │
│                                  └──────────────────────────┘ │
└──────────────────────────────────────────────────────────────┘
```

### Communication Flow

1. **Frontend → Electron Main**: IPC (`ipcRenderer.invoke` → `ipcMain.handle`)
2. **Electron Main → Python Backend**: stdio pipe, JSON-RPC 2.0 protocol (one JSON object per line)
3. **Python Backend → MIDI**: `python-rtmidi` sends Program Change to loopMIDI virtual port
4. **Audio Playback**: Web Audio API runs entirely in the renderer process for zero-latency local playback

### Why This Architecture?

| Decision | Rationale |
|----------|-----------|
| **Electron + Next.js** | Cross-platform desktop shell + modern React toolchain. Next.js gives SSR, routing, and static export for packaging |
| **Python sidecar** (not Node.js) | MIDI libraries in Python (`python-rtmidi`, `mido`) are mature and battle-tested. Neural DSP's preset/MIDI mapping format is well-understood in the Python ecosystem |
| **stdio JSON-RPC** (not HTTP/WebSocket) | No port conflicts, no firewall issues, no localhost security concerns. The backend runs as a child process — starts and dies with the app |
| **Zustand over Redux** | Minimal boilerplate, no context providers needed, built-in slice pattern, excellent TypeScript support |
| **Web Audio API** (not a library) | Sub-millisecond precision for playback scheduling. No external dependency for audio decode and playback |

---

## 🔧 Tech Stack & Rationale

### Frontend

| Technology | Version | Purpose |
|------------|---------|---------|
| **Next.js** | 16.2 | React framework — routing, static export for Electron packaging |
| **React** | 19.2 | UI components with hooks and concurrent features |
| **TypeScript** | 5.9 | Type safety across the entire frontend codebase |
| **Tailwind CSS** | 4.3 | Utility-first CSS — rapid UI iteration, no CSS-in-JS runtime cost |
| **Zustand** | 5.0 | Lightweight state management with persistence middleware |
| **@dnd-kit** | 6.3 | Drag-and-drop for preset reordering and trigger movement |
| **Lucide React** | 1.16 | Consistent icon set |
| **Web Audio API** | Native | Audio decode, playback scheduling, beat detection |

### Backend (Python)

| Technology | Version | Purpose |
|------------|---------|---------|
| **Python** | 3.13 | Core backend runtime |
| **python-rtmidi** | latest | Cross-platform MIDI I/O — sending Program Change to loopMIDI |
| **pydub** | latest | Audio file handling, format conversion via ffmpeg |
| **soundfile** | latest | Audio analysis without ffmpeg dependency |
| **PyInstaller** | latest | Package Python backend into standalone .exe for distribution |

### Desktop Shell

| Technology | Version | Purpose |
|------------|---------|---------|
| **Electron** | 42.3 | Cross-platform desktop shell with native OS integration |
| **electron-builder** | 26.8 | NSIS installer packaging for Windows distribution |

### Dev Tools

| Technology | Purpose |
|------------|---------|
| **ESLint** | Code quality and consistency |
| **Vitest** | Unit and component testing |
| **cross-env** | Cross-platform environment variables |
| **wait-on** | Dev mode orchestration (wait for Next.js before launching Electron) |

---

## 🎹 How MIDI Tone Switching Works

### The Virtual MIDI Pipeline

```
┌──────────────────┐     Program Change      ┌───────────────┐
│ Guitar AutoStomp │ ──────────────────────► │  loopMIDI     │
│  (MIDI Out)      │    PC #0=Clean          │  Virtual Port │
│                  │    PC #1=Rhythm         │               │
│                  │    PC #2=Lead           │               │
└──────────────────┘                         └───────┬───────┘
                                                     │
                                                     │ MIDI
                                                     ▼
                                             ┌───────────────┐
                                             │  Your DAW     │
                                             │  (Reaper, FL, │
                                             │   Ableton…)   │
                                             │               │
                                             │  Track with   │
                                             │  Neural DSP   │
                                             │  plugin       │
                                             └───────────────┘
```

### Timing Precision

The Python backend runs a playback loop that compensates for transport latency:

- **5ms advance compensation**: MIDI Program Change is sent 5ms **before** the scheduled trigger time
- **Binary search reset**: When seeking/scrubbing, the scheduler uses binary search to quickly find the next upcoming trigger
- **Web Audio API clock**: The renderer uses `AudioContext.currentTime` for sub-millisecond playback position tracking

### Auto-Mapping Presets to MIDI

On first launch, AutoStomp:

1. **Scans** for installed Neural DSP plugins in standard directories
2. **Reads** user presets (`.xml` files) from each plugin's preset folder
3. **Computes** `juce_hash_code_64` UIDs for each preset (matching Neural DSP's internal format)
4. **Auto-generates** a `.midiMapping` XML file mapping presets to Program Change numbers
5. **Installs** the mapping into the plugin's config directory

No manual MIDI Learn required — but the Step-by-Step MIDI Learn Wizard is available if you prefer custom mappings.

---

## 🚀 Getting Started

### Prerequisites

| Software | Version | Required? |
|----------|---------|-----------|
| **Node.js** | ≥ 20 | ✅ Required |
| **Python** | ≥ 3.13 | ✅ Required |
| **loopMIDI** | Latest | ✅ Required (virtual MIDI port) |
| **FFmpeg** | Latest | ⚠️ Recommended (audio format support) |
| **Neural DSP Plugin** | Any | To actually switch tones 😄 |

### Step 1: Install loopMIDI

Windows doesn't have built-in virtual MIDI ports (unlike macOS CoreMIDI). You need loopMIDI:

1. Download from: https://www.tobias-erichsen.de/software/loopmidi.html
2. Install and launch loopMIDI
3. Click **+** to create a new port, name it `AutoStomp Virtual`
4. In your DAW, set `AutoStomp Virtual` as a MIDI input on the track with your Neural DSP plugin

### Step 2: Install FFmpeg (Recommended)

For audio format conversion (MP3, FLAC, MP4 video extraction, etc.):

1. Download: https://github.com/BtbN/FFmpeg-Builds/releases
2. Get `ffmpeg-master-latest-win64-gpl.zip`
3. Extract and copy `ffmpeg.exe` and `ffprobe.exe` into the `backend/` directory

### Step 3: Install Dependencies

```bash
# Node.js dependencies
npm install

# Python dependencies
cd backend
pip install -r requirements.txt
cd ..
```

### Step 4: Launch in Development Mode

```bash
# Terminal 1: Start Next.js dev server
npm run dev

# Terminal 2: Start Electron (wait for Next.js first!)
npm run electron:dev
```

Electron will automatically spawn the Python backend via stdio — no manual backend startup needed.

---

## 📁 Project Structure

```
Guitar-Stomp-WIN/
├── electron/                      # Electron main process
│   ├── main.js                    # Window creation, IPC, backend lifecycle
│   └── preload.js                 # Context bridge (exposes safe APIs to renderer)
│
├── backend/                       # Python sidecar backend
│   ├── main_stdio.py              # stdio JSON-RPC entry point
│   ├── requirements.txt           # Python dependencies
│   ├── guitar-autostomp-backend.spec  # PyInstaller packaging config
│   ├── ffmpeg.exe                 # Windows FFmpeg binary (place here)
│   ├── ffprobe.exe                # Windows FFprobe binary (place here)
│   └── app/
│       ├── config.py              # Path config (Windows-adapted)
│       ├── models/                # Data models
│       └── services/
│           ├── audio_engine.py        # Audio file analysis & conversion
│           ├── midi_controller.py     # MIDI port management & PC sending
│           ├── midi_learn_guide.py    # Step-by-step MIDI Learn wizard
│           ├── midi_xml_gen.py        # Neural DSP .midiMapping XML generator
│           ├── preset_scanner.py      # Neural DSP preset auto-detection
│           ├── preset_uid.py          # juce_hash_code_64 implementation
│           └── project_manager.py     # JSON project persistence
│
├── src/                           # Next.js frontend (renderer)
│   ├── app/
│   │   ├── page.tsx               # Main editor (waveform + triggers)
│   │   ├── layout.tsx             # Root layout
│   │   ├── globals.css            # Tailwind + custom styles
│   │   ├── guide/
│   │   │   ├── page.tsx           # User guide (bilingual)
│   │   │   └── i18n.ts            # Guide translations (zh/en)
│   │   ├── settings/
│   │   │   └── page.tsx           # Preset browser & MIDI mapping settings
│   │   └── projects/
│   │       └── page.tsx           # Project management
│   ├── components/
│   │   ├── Waveform.tsx           # Canvas-based waveform renderer (rAF)
│   │   ├── ToneSegments.tsx       # Tone block visualization above waveform
│   │   ├── Transport.tsx          # Playback controls + keyboard shortcuts
│   │   ├── TriggerList.tsx        # Trigger table with edit/delete
│   │   ├── TimelineRuler.tsx      # Zoom-aware time ruler
│   │   ├── ProjectSidebar.tsx     # Project list & navigation
│   │   ├── ToneAddDialog.tsx      # Add tone trigger modal
│   │   ├── ToneMappingSelector.tsx # MIDI mapping file picker
│   │   ├── DeviceSelector.tsx     # MIDI output device selector
│   │   ├── ExportButton.tsx       # Export triggers as mapping file
│   │   ├── StatusBar.tsx          # Footer status bar
│   │   ├── Toast.tsx              # Toast notification system
│   │   └── AppProviders.tsx       # Zustand store providers
│   ├── hooks/
│   │   ├── useAudioEngine.ts      # Web Audio API playback engine
│   │   ├── useWebSocket.ts        # WebSocket connection + reconnect
│   │   └── usePlatform.ts         # Platform detection (macOS/Windows)
│   ├── stores/
│   │   ├── projectStore.ts        # Project data + triggers state
│   │   ├── playbackStore.ts       # Playback state (position, loop, etc.)
│   │   ├── mapperStore.ts         # MIDI mapping & plugin state
│   │   └── undoStore.ts           # Undo/redo stack
│   ├── lib/
│   │   ├── api.ts                 # REST API client (maps to IPC → JSON-RPC)
│   │   └── ws.ts                  # WebSocket client with reconnection
│   └── types/                     # TypeScript type definitions
│
├── scripts/
│   ├── build-win.bat              # One-click Windows build script
│   └── afterPack.js               # electron-builder post-pack hook
│
├── data/projects/                 # Project JSON storage
├── release/                       # Build output (NSIS installer)
│
├── electron-builder.yml           # electron-builder config
├── next.config.ts                 # Next.js config
├── tsconfig.json                  # TypeScript config
├── vitest.config.ts               # Test config
├── .env.example                   # Environment template
├── PRD-Windows-Adaptation.md      # Windows port PRD
└── WINDOWS_PORTING_REVIEW.md      # Port completion audit
```

---

## 📦 Build & Packaging

### One-Click Build

```bash
scripts\build-win.bat
```

This script orchestrates:

1. ✅ Dependency check (Python + pip + Node.js)
2. ✅ PyInstaller build (backend → standalone .exe)
3. ✅ Next.js static export
4. ✅ electron-builder (NSIS installer)
5. ✅ Output: `release/Guitar-AutoStomp-Setup-1.0.0.exe`

### Manual Step-by-Step

```bash
# Step 1: Package Python backend with PyInstaller
npm run dist:backend

# Step 2: Build Next.js + package Electron installer
npm run dist:win
```

### Build Pipeline Detail

```
┌──────────────┐     ┌──────────────────┐     ┌──────────────────────┐
│  Python src  │────►│  PyInstaller      │────►│  dist-backend/        │
│  (backend/)  │     │  (onedir mode)   │     │  ├── .exe             │
│              │     │                  │     │  └── _internal/       │
└──────────────┘     └──────────────────┘     └──────────┬───────────┘
                                                          │
┌──────────────┐     ┌──────────────────┐                 │ extraResources
│  Next.js src │────►│  next build +     │────►  out/     │
│  (src/)      │     │  static export   │         │       │
└──────────────┘     └──────────────────┘         │       │
                                                   │       │
                              ┌────────────────────┘       │
                              │  electron-builder           │
                              │  ┌──────────────────────────┘
                              ▼  ▼
                    ┌──────────────────┐
                    │  NSIS Installer   │
                    │  (.exe, ~118 MB) │
                    └──────────────────┘
```

---

## 🪟 Windows Porting Challenges

This project is a **full port** of a macOS application to Windows. Here are the key technical challenges and solutions:

### 1. Virtual MIDI Port (The Core Challenge)

| macOS | Windows |
|-------|---------|
| `mido.open_output(name, virtual=True)` — built into CoreMIDI | No native virtual MIDI support |

**Solution**: Integrated **loopMIDI** (Tobias Erichsen) as the virtual MIDI bridge. The `midi_controller.py` auto-detects loopMIDI ports by name and provides a guided setup flow if none is found. Fallback: user can manually select any available MIDI output port.

### 2. File System & Paths

| Concern | Solution |
|---------|----------|
| **Neural DSP preset paths** differ between platforms | `config.py` uses `platform.system()` branching to resolve correct paths |
| **App data storage** (`~/Library` vs `%LOCALAPPDATA%`) | Same pattern — `platform.system()` with complete path coverage |
| **Path separators** (`/` vs `\`) | All Python code uses `pathlib.Path` — automatic OS-aware resolution |

### 3. Window Frame & Title Bar

| macOS | Windows |
|-------|---------|
| `titleBarStyle: 'hiddenInset'` + custom traffic light positioning | Standard system frame with min/max/close |

**Solution**: Conditional in `main.js` — `titleBarStyle` only on macOS, and CSS uses `usePlatform()` hook to apply `headerPaddingLeft()` only on macOS to avoid gap where traffic lights would be.

### 4. FFmpeg Binary

| macOS | Windows |
|-------|---------|
| `ffmpeg` (no extension, Mach-O binary) | `ffmpeg.exe` (PE binary) |

**Solution**: `config.py` detects the platform and appends `.exe` on Windows. PyInstaller spec includes `.exe` files in the bundle.

### 5. Build Pipeline

| Concern | Solution |
|---------|----------|
| macOS shell scripts (`#!/bin/bash`) don't work on Windows | `build-win.bat` uses Windows CMD syntax |
| `dist:backend` npm script uses platform-specific commands | Uses `if not exist`, `xcopy`, `pyinstaller` — all Windows-native |

### Port Verification

A comprehensive **porting review** (`WINDOWS_PORTING_REVIEW.md`) audited all 66 files across 8 modules:
- ✅ **0 blocking issues** — all platform-specific code paths are correctly implemented
- ⚠️ **2 medium issues** (documented and resolved): python PATH detection, loopMIDI installation guide
- ℹ️ **5 low issues** (cosmetic/documentation improvements)

---

## 💻 Development

### Available Scripts

```bash
npm run dev            # Start Next.js dev server
npm run electron:dev   # Launch Electron in dev mode
npm run build          # Build Next.js for production
npm run test           # Run tests (Vitest)
npm run lint           # Lint with ESLint
npm run dist:backend   # Package Python backend with PyInstaller
npm run dist:win       # Build Windows installer
npm run dist           # Full build pipeline (backend + installer)
```

### Development Workflow

1. **Frontend** → modify `src/` files, Next.js hot-reloads in Electron
2. **Backend** → modify `backend/` Python files, restart `npm run electron:dev`
3. **Electron Main** → modify `electron/main.js`, restart `npm run electron:dev`
4. **Full test** → `npm run dist` generates the installer for testing

### Debugging

- **Frontend**: Chrome DevTools available via `Ctrl+Shift+I` in Electron
- **Backend**: Python stderr is captured by Electron main process and logged to console
- **IPC**: All JSON-RPC calls are logged in the Electron console with method names and timing
- **MIDI**: Use a MIDI monitor (like MIDI-OX) to verify Program Change messages

---

## 🧪 Testing

```bash
npm run test          # Run all tests
npm run test:watch    # Watch mode
```

### Test Categories

| Area | Framework | Scope |
|------|-----------|-------|
| **Unit Tests** | Vitest | Pure functions: hash computation, time parsing, trigger logic |
| **Component Tests** | Vitest + React Testing Library | UI components: TriggerList, Transport, ToneAddDialog |
| **Integration Tests** | Vitest | Store interactions, API → RPC mapping, undo/redo stack |
| **End-to-End** | Manual + PowerShell script | Full workflow: launch → load audio → add triggers → export |

### E2E Test Script

```bash
powershell -File test_runner.ps1
```

Automates: dependency check → Python backend startup → JSON-RPC health ping → MIDI port detection → full workflow validation.

---

## 🗺 Roadmap

### v1.1 (Next)

- [ ] Editable trigger colors for better visual organization
- [ ] Section markers (Intro/Verse/Chorus/Bridge/Outro)
- [ ] BPM-synced quantization of triggers
- [ ] Custom preset directory configuration in Settings
- [ ] Keyboard shortcut customization

### v1.2

- [ ] Audio export with embedded MIDI Program Change track
- [ ] Multiple DAW track assignments (switch tones on different plugin instances)
- [ ] MIDI CC automation curves (wah, volume, delay mix)
- [ ] Tempo map import from DAW
- [ ] Dark/Light theme toggle

### v2.0

- [ ] macOS universal binary support (re-unify codebase)
- [ ] Plugin support beyond Neural DSP (Kemper, Axe-FX, Quad Cortex)
- [ ] Setlist mode (chain multiple songs with automatic transitions)
- [ ] MIDI foot controller integration (manual override pedal)
- [ ] Cloud sync for projects and presets

---

## 📄 License

MIT License — see [LICENSE](LICENSE) for details.

---

## 🙏 Acknowledgements

- **Neural DSP** — for making incredible amp sim plugins
- **Tobias Erichsen / loopMIDI** — the essential Windows virtual MIDI bridge
- **python-rtmidi** — reliable cross-platform MIDI library
- **Electron & Next.js teams** — for the foundation this app is built on

---

<p align="center">
  <sub>Built with 🤘 by a guitarist, for guitarists.</sub>
</p>
