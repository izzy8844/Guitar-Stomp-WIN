<p align="center">
  <img src="https://img.shields.io/badge/platform-Windows%20x64-blue?logo=windows" alt="平台: Windows x64">
  <img src="https://img.shields.io/badge/version-1.0.0-green" alt="版本 1.0.0">
  <img src="https://img.shields.io/badge/license-MIT-purple" alt="协议 MIT">
  <img src="https://img.shields.io/badge/electron-42%2B-9cf?logo=electron" alt="Electron 42+">
  <img src="https://img.shields.io/badge/next.js-16-000?logo=next.js" alt="Next.js 16">
  <img src="https://img.shields.io/badge/python-3.13-3776AB?logo=python" alt="Python 3.13">
</p>

<h1 align="center">🎸 Guitar AutoStomp</h1>
<p align="center"><em>永远告别脚踩效果器的日子。</em></p>

<p align="center">
  Guitar AutoStomp 是一款<strong>吉他音色自动切换桌面应用</strong>——在伴奏播放到某个时刻时，自动通过 MIDI Program Change 消息把你的 Neural DSP 插件切换到对应的音色。踩点精准，不用脚。
</p>

---

## 📖 目录

- [它能做什么](#-它能做什么)
- [功能一览](#-功能一览)
- [系统架构](#-系统架构)
- [技术栈 & 选型理由](#-技术栈--选型理由)
- [MIDI 音色切换原理](#-midi-音色切换原理)
- [快速上手](#-快速上手)
- [项目结构](#-项目结构)
- [打包与构建](#-打包与构建)
- [Windows 移植难点](#-windows-移植难点)
- [开发指南](#-开发指南)
- [测试](#-测试)
- [路线图](#-路线图)
- [License](#-license)

---

## 🎯 它能做什么

使用 Neural DSP 插件（Archetype: Gojira、Petrucci、Plini、Tim Henson 等）的吉他手在演奏时往往需要在 Clean / Rhythm / Lead 之间来回切音色。手点、脚踩 —— 都不够稳，容易失误。

**Guitar AutoStomp 的做法是：把音色切换写成时间线上的自动化。** 就像混音师做 Automation 一样，在波形上标记切换点，剩下的由程序搞定 —— 通过虚拟 MIDI 线缆把 Program Change 消息精确发给你 DAW 里的插件。

### 工作流

```
1. 载入伴奏（MP3 / WAV / FLAC / MP4）
2. 自动检测你电脑上装的 Neural DSP 插件和用户预设
3. 在波形时间线上放置音色切换触发器
4. 点播放 → AutoStomp 在每个时间点 5ms 前发送 MIDI 指令
```

---

## ✨ 功能一览

### 🎵 核心编辑

| 功能 | 说明 |
|------|------|
| **音频时间线编辑器** | 支持 MP3 / WAV / FLAC / OGG / M4A / AAC / WMA / MP4，波形可视化、缩放拖拽 |
| **触发器放置** | 在波形上点击即可添加音色切换点，Shift+Click 快速创建 |
| **音色片段可视化** | 波形上方彩色色块展示每一段歌曲当前激活的音色 |
| **拖拽微调** | 直接在波形上左右拖动触发器调整切换时机 |
| **AB 循环** | 框选一段反复练习，抠 Solo 的神器 |
| **走带控制** | 播放/暂停/停止，键盘快捷键（Space、Home、End），实时位置显示 |

### 🎛️ MIDI & 插件集成

| 功能 | 说明 |
|------|------|
| **自动检测 Neural DSP 插件** | 扫描系统中安装的插件（Archetype / Parallax / Darkglass / Soldano 等系列） |
| **预设扫描器** | 读取已安装的用户预设，直接出现在音色挑选器中，无需手动设置 |
| **MIDI Learn 向导** | 引导式步骤，帮你把音色映射到 MIDI Program Change 编号 |
| **首次启动自动映射** | 检测插件 → 找到用户预设 → 自动生成 .midiMapping 文件 |
| **虚拟 MIDI 端口** | Windows 上使用 **loopMIDI** 创建虚拟 MIDI 线缆连接 DAW |
| **导出 MIDI 映射** | 生成并安装 `.midiMapping` XML 文件到 Neural DSP 插件配置目录 |

### 💾 项目管理

| 功能 | 说明 |
|------|------|
| **多项目支持** | 新建/保存/复制/删除项目，每个项目独立管理音频和触发器 |
| **自动保存** | 修改后自动防抖同步到后端 |
| **未保存提醒** | 切换项目或关闭应用前，如有未保存更改会弹窗提示 |
| **撤销/重做** | 完整 Undo/Redo 栈（Ctrl+Z / Ctrl+Shift+Z） |
| **项目侧边栏** | 浏览所有项目，显示触发器数量，一键切换 |

### 🎨 界面

| 功能 | 说明 |
|------|------|
| **暗色主题** | 专业暗色 UI，适合录音棚和舞台环境 |
| **缩放自适应标尺** | 时间线标尺根据缩放级别自动调整刻度密度 |
| **状态栏** | 实时显示连接状态、MIDI 端口、最近事件、触发器总数 |
| **双语使用指南** | 内置中文/英文用户指南，分步讲解 |
| **Toast 提示** | 操作反馈不打断工作流 |

---

## 🏗 系统架构

```
┌──────────────────────────────────────────────────────────────┐
│                     Electron Shell（桌面壳）                  │
│                                                              │
│  ┌─────────────────────────┐    ┌─────────────────────────┐ │
│  │   渲染进程（Renderer）    │    │   主进程（Main / Node.js）│ │
│  │                          │    │                          │ │
│  │  ┌────────────────────┐ │    │  • IPC 处理层            │ │
│  │  │  Next.js 16         │ │◄──►│  • 文件读写（音频）      │ │
│  │  │  React 19           │ │IPC │  • FFmpeg 转码          │ │
│  │  │  Tailwind CSS 4     │ │    │  • 进程生命周期管理      │ │
│  │  │  Zustand（状态管理） │ │    │                          │ │
│  │  └────────────────────┘ │    └───────────┬─────────────┘ │
│  │                          │               │               │
│  │  ┌────────────────────┐ │               │ stdio 管道     │
│  │  │  Web Audio API      │ │               │ (JSON-RPC)    │
│  │  │  （音频播放引擎）    │ │               │               │
│  │  └────────────────────┘ │    ┌───────────▼─────────────┐ │
│  │                          │    │   Python 3.13 后端      │ │
│  └──────────────────────────┘    │                          │ │
│                                  │  ┌────────────────────┐ │ │
│                                  │  │  MIDI 控制器        │─┼─┼──► loopMIDI 虚拟端口
│                                  │  │  (python-rtmidi)    │ │ │    → DAW → 插件
│                                  │  └────────────────────┘ │ │
│                                  │  ┌────────────────────┐ │ │
│                                  │  │  音频引擎           │ │ │
│                                  │  │  (pydub+ffmpeg)     │ │ │
│                                  │  └────────────────────┘ │ │
│                                  │  ┌────────────────────┐ │ │
│                                  │  │  预设扫描器          │ │ │
│                                  │  │  + MIDI XML 生成    │ │ │
│                                  │  └────────────────────┘ │ │
│                                  └──────────────────────────┘ │
└──────────────────────────────────────────────────────────────┘
```

### 通信流程

1. **前端 → Electron 主进程**：IPC（`ipcRenderer.invoke` → `ipcMain.handle`）
2. **Electron 主进程 → Python 后端**：stdio 管道，JSON-RPC 2.0 协议（每行一个 JSON 对象）
3. **Python 后端 → MIDI**：`python-rtmidi` 发送 Program Change 到 loopMIDI 虚拟端口
4. **音频播放**：Web Audio API 在渲染进程内独立运行，亚毫秒级调度

### 为什么这样设计

| 决策 | 理由 |
|------|------|
| **Electron + Next.js** | 跨平台桌面壳 + 现代化 React 工具链。Next.js 提供路由和静态导出，方便打包 |
| **Python 侧车进程**（而非 Node.js） | Python 的 MIDI 库（`python-rtmidi`、`mido`）成熟稳定。Neural DSP 预设/MIDI 映射格式在 Python 生态中有成熟的解析方案 |
| **stdio JSON-RPC**（而非 HTTP/WebSocket） | 无端口冲突、无防火墙问题、无 localhost 安全隐患。后端以子进程方式运行，应用关闭自动结束 |
| **Zustand 而非 Redux** | 模板代码极少、无需 Provider 包裹、天然支持 slice 模式、TypeScript 体验好 |
| **Web Audio API**（而非第三方音频库） | 亚毫秒级播放调度精度。音频解码和播放无外部依赖 |

---

## 🔧 技术栈 & 选型理由

### 前端

| 技术 | 版本 | 用途 |
|------|------|------|
| **Next.js** | 16.2 | React 框架 —— 路由管理 + 静态导出供 Electron 打包 |
| **React** | 19.2 | 组件化 UI + Hooks + Concurrent 特性 |
| **TypeScript** | 5.9 | 前端全线类型安全 |
| **Tailwind CSS** | 4.3 | 原子化 CSS —— 快速迭代、零运行时开销 |
| **Zustand** | 5.0 | 轻量状态管理 + 持久化中间件 |
| **@dnd-kit** | 6.3 | 拖拽排序（预设重排、触发器拖动） |
| **Lucide React** | 1.16 | 图标库 |
| **Web Audio API** | 浏览器原生 | 音频解码、播放调度、节拍检测 |

### 后端（Python）

| 技术 | 版本 | 用途 |
|------|------|------|
| **Python** | 3.13 | 后端运行时 |
| **python-rtmidi** | latest | 跨平台 MIDI I/O —— 向 loopMIDI 发送 Program Change |
| **pydub** | latest | 音频处理 + 格式转换（调用 ffmpeg） |
| **soundfile** | latest | 无 ffmpeg 依赖的音频分析 |
| **PyInstaller** | latest | 将 Python 后端打包为独立 .exe |

### 桌面壳

| 技术 | 版本 | 用途 |
|------|------|------|
| **Electron** | 42.3 | 跨平台桌面壳 + 原生系统集成 |
| **electron-builder** | 26.8 | NSIS 安装包打包 |

### 开发工具

| 工具 | 用途 |
|------|------|
| **ESLint** | 代码质量 |
| **Vitest** | 单元/组件测试 |
| **cross-env** | 跨平台环境变量 |
| **wait-on** | 开发模式编排（等 Next.js 启动后再启动 Electron） |

---

## 🎹 MIDI 音色切换原理

### 虚拟 MIDI 管线

```
┌──────────────────┐     Program Change      ┌───────────────┐
│ Guitar AutoStomp │ ──────────────────────► │  loopMIDI     │
│  (MIDI 输出)     │    PC #0 = Clean        │  虚拟端口      │
│                  │    PC #1 = Rhythm       │               │
│                  │    PC #2 = Lead         │               │
└──────────────────┘                         └───────┬───────┘
                                                     │
                                                     │ MIDI 消息
                                                     ▼
                                             ┌───────────────┐
                                             │  你的 DAW     │
                                             │  (Reaper、FL  │
                                             │   Studio、    │
                                             │   Ableton…)   │
                                             │               │
                                             │  含 Neural    │
                                             │  DSP 的轨道   │
                                             └───────────────┘
```

### 时序精度保障

Python 后端运行播放调度循环，保证切换时机的精准：

- **5ms 提前补偿**：在预定触发时间**前 5ms** 发送 MIDI Program Change，消除传输延迟
- **二分查找复位**：拖动进度条时，调度器用二分查找快速定位下一个待触发的切换点
- **Web Audio API 时钟**：渲染进程使用 `AudioContext.currentTime` 获取亚毫秒级播放位置

### 自动映射预设到 MIDI

首次启动时 AutoStomp 自动完成：

1. **扫描**系统标准目录中的 Neural DSP 插件安装
2. **读取**每个插件的用户预设（`.xml` 文件）
3. **计算**每个预设的 `juce_hash_code_64` UID（与 Neural DSP 内部格式一致）
4. **自动生成** `.midiMapping` XML 文件，将预设映射到 Program Change 编号
5. **安装**映射文件到插件配置目录

无需手动 MIDI Learn — 当然，如果你需要自定义映射，内置的分步 MIDI Learn 向导也能帮你搞定。

---

## 🚀 快速上手

### 前置依赖

| 软件 | 版本 | 必须？ |
|------|------|--------|
| **Node.js** | ≥ 20 | ✅ 必须 |
| **Python** | ≥ 3.13 | ✅ 必须 |
| **loopMIDI** | 最新版 | ✅ 必须（虚拟 MIDI 端口） |
| **FFmpeg** | 最新版 | ⚠️ 推荐（扩展音频格式支持） |
| **Neural DSP 插件** | 任意 | 不然切个寂寞 😄 |

### 第一步：安装 loopMIDI

Windows 不像 macOS 原生支持虚拟 MIDI 端口（CoreMIDI），需要装 loopMIDI：

1. 下载：https://www.tobias-erichsen.de/software/loopmidi.html
2. 安装并启动 loopMIDI
3. 点击左下角 **+** 创建新端口，命名为 `AutoStomp Virtual`
4. 在 DAW 中，将 `AutoStomp Virtual` 设为含 Neural DSP 插件轨道的 MIDI 输入

### 第二步：安装 FFmpeg（推荐）

用于 MP3 / FLAC / MP4 等格式的音频转换：

1. 下载：https://github.com/BtbN/FFmpeg-Builds/releases
2. 选择 `ffmpeg-master-latest-win64-gpl.zip`
3. 解压后把 `ffmpeg.exe` 和 `ffprobe.exe` 复制到 `backend/` 目录

### 第三步：安装依赖

```bash
# Node.js 依赖
npm install

# Python 依赖
cd backend
pip install -r requirements.txt
cd ..
```

### 第四步：启动开发模式

```bash
# 终端 1：启动 Next.js 开发服务器
npm run dev

# 终端 2：等 Next.js 就绪后启动 Electron
npm run electron:dev
```

Electron 会自动通过 stdio 启动 Python 后端 —— 不需要手动开后端。

---

## 📁 项目结构

```
Guitar-Stomp-WIN/
├── electron/                      # Electron 主进程
│   ├── main.js                    # 窗口创建、IPC 路由、后端生命周期管理
│   └── preload.js                 # 上下文桥接（暴露安全 API 给渲染进程）
│
├── backend/                       # Python 侧车后端
│   ├── main_stdio.py              # stdio JSON-RPC 入口
│   ├── requirements.txt           # Python 依赖清单
│   ├── guitar-autostomp-backend.spec  # PyInstaller 打包配置
│   ├── ffmpeg.exe                 # Windows FFmpeg 二进制（放这里）
│   ├── ffprobe.exe                # Windows FFprobe 二进制（放这里）
│   └── app/
│       ├── config.py              # 路径配置（已适配 Windows）
│       ├── models/                # 数据模型
│       └── services/
│           ├── audio_engine.py        # 音频文件分析与格式转换
│           ├── midi_controller.py     # MIDI 端口管理 & PC 消息发送
│           ├── midi_learn_guide.py    # 分步 MIDI Learn 向导
│           ├── midi_xml_gen.py        # Neural DSP .midiMapping XML 生成
│           ├── preset_scanner.py      # 插件 & 预设自动检测
│           ├── preset_uid.py          # juce_hash_code_64 哈希算法实现
│           └── project_manager.py     # JSON 项目持久化存储
│
├── src/                           # Next.js 前端（渲染进程）
│   ├── app/
│   │   ├── page.tsx               # 主编辑器页面（波形 + 触发器）
│   │   ├── layout.tsx             # 根布局
│   │   ├── globals.css            # Tailwind + 自定义样式
│   │   ├── guide/
│   │   │   ├── page.tsx           # 使用指南页（双语）
│   │   │   └── i18n.ts            # 翻译内容（中文/英文）
│   │   ├── settings/
│   │   │   └── page.tsx           # 预设浏览器 & MIDI 映射设置
│   │   └── projects/
│   │       └── page.tsx           # 项目管理页面
│   ├── components/
│   │   ├── Waveform.tsx           # 基于 Canvas + rAF 的波形渲染
│   │   ├── ToneSegments.tsx       # 波形上方的音色片段可视化
│   │   ├── Transport.tsx          # 走带控制 + 键盘快捷键
│   │   ├── TriggerList.tsx        # 触发器表格（编辑/删除）
│   │   ├── TimelineRuler.tsx      # 缩放自适应时间标尺
│   │   ├── ProjectSidebar.tsx     # 项目列表 & 导航
│   │   ├── ToneAddDialog.tsx      # 添加音色触发器的弹窗
│   │   ├── ToneMappingSelector.tsx # MIDI 映射文件选择器
│   │   ├── DeviceSelector.tsx     # MIDI 输出设备选择器
│   │   ├── ExportButton.tsx       # 触发器导出为映射文件
│   │   ├── StatusBar.tsx          # 底部状态栏
│   │   ├── Toast.tsx              # Toast 通知系统
│   │   └── AppProviders.tsx       # Zustand Store Provider
│   ├── hooks/
│   │   ├── useAudioEngine.ts      # Web Audio API 播放引擎
│   │   ├── useWebSocket.ts        # WebSocket 连接 + 自动重连
│   │   └── usePlatform.ts         # 平台检测（macOS/Windows 差异化处理）
│   ├── stores/
│   │   ├── projectStore.ts        # 项目数据 + 触发器状态
│   │   ├── playbackStore.ts       # 播放状态（位置、循环等）
│   │   ├── mapperStore.ts         # MIDI 映射 & 插件状态
│   │   └── undoStore.ts           # 撤销/重做栈
│   ├── lib/
│   │   ├── api.ts                 # API 客户端（IPC → JSON-RPC 映射）
│   │   └── ws.ts                  # WebSocket 客户端 + 断线重连
│   └── types/                     # TypeScript 类型定义
│
├── scripts/
│   ├── build-win.bat              # Windows 一键构建脚本
│   └── afterPack.js               # electron-builder 打包后置钩子
│
├── data/projects/                 # 项目 JSON 存储
├── release/                       # 构建产物（NSIS 安装包）
│
├── electron-builder.yml           # electron-builder 配置
├── next.config.ts                 # Next.js 配置
├── tsconfig.json                  # TypeScript 配置
├── vitest.config.ts               # 测试配置
├── .env.example                   # 环境变量模板
├── PRD-Windows-Adaptation.md      # Windows 适配 PRD
├── WINDOWS_PORTING_REVIEW.md      # 移植完成审计报告
└── LICENSE                        # MIT 协议
```

---

## 📦 打包与构建

### 一键构建

```bash
scripts\build-win.bat
```

脚本依次执行：

1. ✅ 依赖检查（Python + pip + Node.js）
2. ✅ PyInstaller 打包（后端 → 独立 .exe）
3. ✅ Next.js 静态导出
4. ✅ electron-builder（NSIS 安装包）
5. ✅ 输出：`release/Guitar-AutoStomp-Setup-1.0.0.exe`

### 分步构建

```bash
# 第一步：PyInstaller 打包 Python 后端
npm run dist:backend

# 第二步：构建 Next.js + 打包 Electron 安装包
npm run dist:win
```

### 构建流水线详情

```
┌──────────────┐     ┌──────────────────┐     ┌──────────────────────┐
│  Python 代码  │────►│  PyInstaller      │────►│  dist-backend/        │
│  (backend/)   │     │  (onedir 模式)   │     │  ├── .exe             │
│               │     │                  │     │  └── _internal/       │
└───────────────┘     └──────────────────┘     └──────────┬───────────┘
                                                           │
┌──────────────┐     ┌──────────────────┐                  │ extraResources
│  Next.js 代码 │────►│  next build +     │────►  out/      │
│  (src/)       │     │  static export   │         │        │
└──────────────┘     └──────────────────┘         │        │
                                                    │        │
                               ┌────────────────────┘        │
                               │  electron-builder            │
                               │  ┌───────────────────────────┘
                               ▼  ▼
                     ┌──────────────────┐
                     │  NSIS 安装包      │
                     │  (.exe, ~118 MB) │
                     └──────────────────┘
```

---

## 🪟 Windows 移植难点

本项目是从 **macOS 版本完整移植**到 Windows 的产物。以下是核心技术挑战与解决方案：

### 1. 虚拟 MIDI 端口（核心难题）

| macOS | Windows |
|-------|---------|
| `mido.open_output(name, virtual=True)` — CoreMIDI 原生支持 | 系统无虚拟 MIDI 能力 |

**解决方案**：集成 **loopMIDI**（Tobias Erichsen 开发）作为虚拟 MIDI 桥接。`midi_controller.py` 通过端口名自动检测 loopMIDI 创建的虚拟端口，若未安装则提供引导流程。降级方案：允许用户手动选择任意可用 MIDI 输出端口。

### 2. 文件路径差异

| 关注点 | 解决方案 |
|--------|----------|
| **Neural DSP 预设路径**因平台而异 | `config.py` 用 `platform.system()` 分支处理所有路径 |
| **应用数据存储**（`~/Library` vs `%LOCALAPPDATA%`） | 同上，完整覆盖 |
| **路径分隔符**（`/` vs `\`） | 全部 Python 代码使用 `pathlib.Path`，自动处理 |

### 3. 窗口框架

| macOS | Windows |
|-------|---------|
| `titleBarStyle: 'hiddenInset'` + 自定义红绿灯按钮位置 | 系统标准窗口框架 |

**解决方案**：`main.js` 中条件判断 —— 仅 macOS 启用 `titleBarStyle`，CSS 通过 `usePlatform()` hook 的 `headerPaddingLeft()` 仅在 macOS 时添加红绿灯预留空间。

### 4. FFmpeg 可执行文件

| macOS | Windows |
|-------|---------|
| `ffmpeg`（无后缀，Mach-O 二进制） | `ffmpeg.exe`（PE 二进制） |

**解决方案**：`config.py` 检测平台后追加 `.exe`。PyInstaller spec 将 `.exe` 文件编入打包。

### 5. 构建脚本

| 关注点 | 解决方案 |
|--------|----------|
| macOS shell 脚本（`#!/bin/bash`）Windows 无法运行 | `build-win.bat` 使用 Windows CMD 语法 |
| `dist:backend` npm script 的平台命令差异 | 使用 `if not exist`、`xcopy`、`pyinstaller` 等 Windows 原生命令 |

### 移植验证

完整的**移植审计报告**（`WINDOWS_PORTING_REVIEW.md`）审查了全部 66 个文件、8 个模块：
- ✅ **0 项阻断** —— 所有平台相关代码路径均正确实现
- ⚠️ **2 项中危**（已记录并解决）：python 命令检测、loopMIDI 安装引导
- ℹ️ **5 项低危**（文档/界面优化项）

---

## 💻 开发指南

### 可用命令

```bash
npm run dev            # 启动 Next.js 开发服务器
npm run electron:dev   # 开发模式下启动 Electron
npm run build          # 构建 Next.js 生产版本
npm run test           # 运行测试（Vitest）
npm run lint           # ESLint 检查
npm run dist:backend   # PyInstaller 打包 Python 后端
npm run dist:win       # 构建 Windows 安装包
npm run dist           # 完整构建流水线（后端 + 安装包）
```

### 开发工作流

1. **前端** → 修改 `src/` 文件，Next.js 在 Electron 内热更新
2. **后端** → 修改 `backend/` Python 文件，重启 `npm run electron:dev`
3. **Electron 主进程** → 修改 `electron/main.js`，重启 `npm run electron:dev`
4. **完整测试** → `npm run dist` 生成安装包进行测试

### 调试

- **前端**：Electron 中按 `Ctrl+Shift+I` 打开 Chrome DevTools
- **后端**：Python stderr 被 Electron 主进程捕获，输出到控制台
- **IPC**：所有 JSON-RPC 调用在 Electron 控制台中记录方法名和耗时
- **MIDI**：可用 MIDI-OX 等 MIDI 监控工具验证 Program Change 消息

---

## 🧪 测试

```bash
npm run test          # 执行所有测试
npm run test:watch    # 监视模式
```

### 测试范围

| 类型 | 框架 | 范围 |
|------|------|------|
| **单元测试** | Vitest | 纯函数：哈希计算、时间解析、触发器逻辑 |
| **组件测试** | Vitest + React Testing Library | UI 组件：TriggerList、Transport、ToneAddDialog |
| **集成测试** | Vitest | Store 交互、API → RPC 路由映射、撤销/重做栈 |
| **端到端** | 手动 + PowerShell 脚本 | 完整工作流：启动 → 加载音频 → 添加触发器 → 导出 |

### E2E 测试脚本

```bash
powershell -File test_runner.ps1
```

自动化：依赖检查 → Python 后端启动 → JSON-RPC 健康检查 → MIDI 端口检测 → 完整工作流验证。

---

## 🗺 路线图

### v1.1（近期）

- [ ] 触发器自定义颜色，更好的视觉区分
- [ ] 段落标记（Intro/Verse/Chorus/Bridge/Outro）
- [ ] BPM 同步量化触发器
- [ ] 设置页面支持手动指定预设目录
- [ ] 可自定义键盘快捷键

### v1.2

- [ ] 导出含嵌入式 MIDI Program Change 轨道的音频
- [ ] 多 DAW 轨道分配（不同插件实例切不同音色）
- [ ] MIDI CC 自动化曲线（哇音、音量、延迟混合度等）
- [ ] 从 DAW 导入速度图
- [ ] 暗色/亮色主题切换

### v2.0

- [ ] macOS 通用二进制支持（代码库重新统一）
- [ ] 支持 Neural DSP 以外的设备（Kemper、Axe-FX、Quad Cortex）
- [ ] 演出歌单模式（多首歌曲串联，自动过渡）
- [ ] MIDI 脚控器集成（手动踩钉覆盖）
- [ ] 项目与预设云端同步

---

## 📄 License

MIT License — 详见 [LICENSE](LICENSE)。

---

## 🙏 致谢

- **Neural DSP** — 做出了不得了的音箱模拟插件
- **Tobias Erichsen / loopMIDI** — Windows 上不可或缺的虚拟 MIDI 桥
- **python-rtmidi** — 稳定可靠的跨平台 MIDI 库
- **Electron & Next.js 团队** — 本项目的地基

---

<p align="center">
  <sub>🤘 一个吉他手写给吉他手的工具。</sub>
</p>
