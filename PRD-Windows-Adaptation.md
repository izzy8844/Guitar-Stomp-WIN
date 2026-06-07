# Guitar AutoStomp — Windows 适配版产品需求文档 (PRD)

## 1. 项目概述

### 1.1 背景

Guitar AutoStomp 是一款吉他音色自动切换桌面应用，通过 Virtual MIDI + Timeline Trigger 在音频播放时自动切换 Neural DSP 插件音色。Mac 版本已开发完成（Electron + Next.js + Python stdio JSON-RPC），本文档定义 Windows 适配版本的需求与实现规范。

### 1.2 目标

将 Guitar AutoStomp Mac 版完整移植到 Windows 平台，保持功能一致性，同时针对 Windows 平台特性做必要适配。

### 1.3 技术栈

- 桌面壳：Electron（跨平台，已有 Mac 版）
- 前端 UI：Next.js 16 + React 19 + Tailwind CSS 4 + Zustand
- 后端引擎：Python 3.13 + stdio JSON-RPC（PyInstaller 打包为 sidecar）
- MIDI：python-rtmidi + loopMIDI（Windows 虚拟端口方案）
- 音频：pydub + soundfile + ffmpeg（波形提取）
- 打包：electron-builder（NSIS 安装包）

---

## 2. 功能清单与适配项

### 2.1 创建 Windows 项目文件夹，复制并调整项目结构

**描述**：从 Mac 版复制核心代码，建立 Windows 版独立项目目录。

**验收���准**：
- [ ] 项目结构与 Mac 版一致（`electron/`、`backend/`、`src/`、`scripts/`、`data/`）
- [ ] 移除 Mac 专用文件（`.DS_Store`、`dist-backend/` 中的 macOS 二进制等）
- [ ] `package.json` 中 `name` 改为 `guitar-autostomp-win`

---

### 2.2 适配 backend/app/config.py（Windows 路径确认）

**描述**：确认并完善 Python 后端在 Windows 上的所有文件路径配置。

**关键路径映射**：

| 用途 | macOS 路径 | Windows 路径 |
|------|-----------|-------------|
| 应用数据 | `~/Library/Application Support/Guitar AutoStomp/` | `%LOCALAPPDATA%\Guitar AutoStomp\` |
| Neural DSP 预设 | `/Library/Audio/Presets/Neural DSP/` | `C:\Users\<User>\Documents\Neural DSP\` 或 `C:\ProgramData\Neural DSP\` |
| Neural DSP 配置 | `~/Library/Application Support/Neural DSP/` | `%APPDATA%\Neural DSP\` |
| MIDI Mappings | `~/.../Neural DSP/<Plugin>/MIDI Mappings/` | `%APPDATA%\Neural DSP\<Plugin>\MIDI Mappings\` |

**验收标准**：
- [ ] `config.py` 中 Windows 分支路径正确
- [ ] `NEURAL_DSP_PRESETS` 能找到已安装的 Neural DSP 插件预设
- [ ] `NEURAL_DSP_USER_CONFIG` 指向正确的 AppData 目录
- [ ] `DATA_ROOT` 在 `%LOCALAPPDATA%` 下创建应用数据目录

---

### 2.3 MIDI 虚拟端口 Windows 方案

**描述**：这是 Windows ��配的核心难点。macOS 原生支持虚拟 MIDI 端口（`mido.open_output('name', virtual=True)`），Windows 不支持，需要第三方方案。

**技术方案**：
