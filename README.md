# Guitar AutoStomp — Windows Edition

吉他音色自动切换桌面应用（Windows 版）。在音频播放时，通过 MIDI Program Change 自动切换 Neural DSP 插件音色。

## 技术架构

```
┌─────────────────────────────────────────────┐
│              Electron Shell                   │
│  ┌────────────────┐    ┌──────────────────┐ │
│  │  Next.js UI    │◄──►│  Main Process    │ │
│  │  (Renderer)    │IPC │  (Node.js)       │ │
│  └────────────────┘    └────────┬─────────┘ │
│                                 │ stdio      │
│                        ┌────────▼─────────┐ │
│                        │  Python Backend   │ │
│                        │  (JSON-RPC)       │ │
│                        └────────┬─────────┘ │
│                                 │ MIDI PC    │
│                        ┌────────▼─────────┐ │
│                        │  loopMIDI Port    │ │
│                        │  → DAW Input      │ │
│                        └──────────────────┘ │
└─────────────────────────────────────────────┘
```

## 前置依赖

| 软件 | 版本 | 用途 |
|------|------|------|
| Node.js | 20+ | 前��构建、Electron |
| Python | 3.13+ | 后端引擎 |
| loopMIDI | 最新版 | 虚拟 MIDI 端口 |
| ffmpeg | 最新版 | 音频波形提取（可选） |

## 环境搭建

### 1. 安装 loopMIDI（必需）

Windows 不像 macOS 那样原生支持虚拟 MIDI 端口，需要安装第三方驱动：

1. 下载 loopMIDI：https://www.tobias-erichsen.de/software/loopmidi.html
2. 安装并启动 loopMIDI
3. 点击左下角 "+" 创建一个新端口，命名为 **AutoStomp Virtual**
4. 确保该端口在 loopMIDI 列表中显示为激活状态

在 DAW（如 Reaper、FL Studio、Ableton）中：
- 将 "AutoStomp Virtual" 设为 MIDI 输入
- 创建一个 Track，加载 Neural DSP 插件
- 启用该 Track 的 MIDI 输入监听

### 2. 安装 ffmpeg（推荐）

用于音频波形提取和格式转换：

1. 下载：https://github.com/BtbN/FFmpeg-Builds/releases
2. 选择 `ffmpeg-master-latest-win64-gpl.zip`
3. 解压，将 `bin/ffmpeg.exe` 和 `bin/ffprobe.exe` 复制到 `backend/` 目录

### 3. 安装项目依赖

```cmd
REM 安装 Node.js 依赖
npm install

REM 安装 Python 依赖
cd backend
pip install -r requirements.txt
cd ..
```

## 开发模式

开发模式下 Electron 直接运行 Python 源码（无需 PyInstaller 打包）。

```cmd
REM 终端 1：启动 Next.js 开发服务器
npm run dev

REM 终端 2：启动 Electron（等 Next.js 启动后再运行）
npm run electron:dev
```

Electron 会自动 spawn `python main_stdio.py` 作为子进程。

## 生产打包

### 一键打包

```cmd
scripts\build-win.bat
```

### 分步打包

```cmd
REM 1. 打包 Python 后端
npm run dist:backend

REM 2. 构建 Next.js + Electron 安装包
npm run dist:win
```

产物位于 `release/Guitar-AutoStomp-Setup-1.0.0.exe`。

## MIDI 工作原理

### Windows 方案（loopMIDI）

```
Guitar AutoStomp  ──PC──►  loopMIDI Port  ──►  DAW MIDI Input  ──►  Neural DSP Plugin
                            (virtual cable)
```

应用启动时自动检测名为 "AutoStomp Virtual" 或含 "loopMIDI" 的端口。如果找到，自动连接并作为默认 MIDI 输出。

### 如果没装 loopMIDI

应用仍然可以启动，但会提示需要安装 loopMIDI。你也可以在 UI 中手动选择任何可用的 MIDI 输出端口（如果 DAW 暴露了 MIDI 输入端口的话）。

## 目录结构

```
Guitar AutoStomp Win/
├── electron/          # Electron 主进程
├── backend/           # Python 后端（stdio JSON-RPC）
│   ├── app/           # 核心服务
│   │   ├── config.py  # 路径配置（已适配 Windows）
│   │   └── services/  # MIDI、音频、预设扫描等
│   ├── main_stdio.py  # 入口（stdin/stdout 通信）
│   └── guitar-autostomp-backend.spec  # PyInstaller 配置
├── src/               # Next.js 前端
│   ├── app/           # 页面
│   ├── components/    # UI 组件
│   ├── hooks/         # React hooks
│   ├── lib/           # 工具库
│   ├── stores/        # Zustand stores
│   └── types/         # TypeScript 类型
├── scripts/           # 构建脚本
├── data/projects/     # 项目数据（JSON）
└── release/           # 打包产物输出
```

## 常见问题

### Q: 启动后提示 "No loopback port found"
A: 请安装 loopMIDI 并创建名为 "AutoStomp Virtual" 的端口。

### Q: Neural DSP 插件预设扫描不到
A: 应用按以下顺序搜索预设目录：
1. `%USERPROFILE%\Documents\Neural DSP\`
2. `C:\ProgramData\Neural DSP\`
3. `C:\Users\Public\Documents\Neural DSP\`

如果你的预设在其他位置，后续版本将支持设置页面手动指定。

### Q: PyInstaller 打包报错 "rtmidi" 相关
A: 确保已安装 Visual Studio Build Tools（C++ 编译器），或使用预编译 wheel：
```cmd
pip install python-rtmidi --only-binary :all:
```

### Q: 波形显示失败
A: 确保 `backend/ffmpeg.exe` 存在。如果没有 ffmpeg，应用会尝试使用 soundfile 直接读取 .wav 文件（但不支持 .mp3 等格式）。

## 与 Mac 版的差异

| 功能 | Mac 版 | Windows 版 |
|------|--------|-----------|
| 虚拟 MIDI 端口 | CoreMIDI 原生 `virtual=True` | loopMIDI 第三方驱动 |
| 窗口标题栏 | 隐藏式（traffic light） | 系统默认框架 |
| 预设路径 | `/Library/Audio/Presets/Neural DSP/` | `%USERPROFILE%\Documents\Neural DSP\` |
| 配置路径 | `~/Library/Application Support/Neural DSP/` | `%APPDATA%\Neural DSP\` |
| 应用数据 | `~/Library/Application Support/Guitar AutoStomp/` | `%LOCALAPPDATA%\Guitar AutoStomp\` |
| 打包格式 | DMG (arm64) | NSIS Installer (x64) |
| ffmpeg | ffmpeg_bin (no ext) | ffmpeg.exe |
