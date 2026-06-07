# Guitar AutoStomp — Windows 适配版产品���求文档 (PRD)

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

**验收标准**：
- [ ] 项目结构与 Mac 版一致（`electron/`、`backend/`、`src/`、`scripts/`、`data/`）
- [ ] 移除 Mac 专用文件（`.DS_Store`、`dist-backend/` 中的 macOS 二进制等）
- [ ] `package.json` 中 `name` 改��� `guitar-autostomp-win`

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

**描述**：这是 Windows 适配的核心难点。macOS 原生支持虚拟 MIDI 端口（`mido.open_output('name', virtual=True)`），Windows 不支持，需要第三方方案。

**技术方案**：

```
启动流程：
1. 检测系统是否已有 loopMIDI ��建的端口（端口名包含 "loopMIDI" 或自定义名称）
2. 若已有 → 自动连接该端口作为默认输出
3. 若没有 → 返回状态，前端弹窗引导用户安装 loopMIDI 或创建端口
4. 降级方案：列出所有可用 MIDI 输出端口，让用户手动选择 DAW 的 MIDI 输入端口
```

**实现细节**：
- `midi_controller.py` 中 `init_virtual_port()` 在 Windows 上改为"检测 + 连接"模式
- 新增 `_find_loopback_port()` 函数，扫描端口名中含 "loopMIDI"、"AutoStomp" 的端口
- 若无虚拟端口，`init_virtual_port()` 返回 `False`，前端显示"请安装 loopMIDI"引导
- 新增 RPC 方法 `midi.virtual_port_status` 供前端查询虚拟端口状态

**验收标准**：
- [ ] 安装 loopMIDI 并创建名为 "AutoStomp Virtual" 的端口后，应用能自动检测并连接
- [ ] 未安装 loopMIDI 时，应用不崩溃，给出友好提示
- [ ] 用户可手动选择任意 MIDI 输出端口作为替代
- [ ] Program Change 消息能正确发送到目标端口

---

### 2.4 编写 Windows PyInstaller spec 文件

**描述**：创建适用于 Windows 的 PyInstaller 打包配置。

**关键差异**：
- 输出为 `.exe` 文件
- 需要包含 `ffmpeg.exe` 和 `ffprobe.exe`（Windows 版本）
- `python-rtmidi` 在 Windows 上依赖 `winmm.dll`（系统自��）
- 打包模式：`onedir`（与 Mac 版一致，方便调试）

**验收标准**：
- [ ] `pyinstaller guitar-autostomp-backend.spec` 在 Windows 上成功执行
- [ ] 产物目录结构：`dist/guitar-autostomp-backend/guitar-autostomp-backend.exe` + `_internal/`
- [ ] 运行 exe 后能正常接收 stdin JSON-RPC 并响应

---

### 2.5 替换 ffmpeg/ffprobe 为 Windows 版本

**描述**：Mac 版使用无后缀的 macOS binary，Windows 版需要 `.exe` 格式。

**实现**：
- `backend/` 目录下放置 `ffmpeg.exe` 和 `ffprobe.exe` 占位文件（实际二进制由开发者自行下载放入）
- `config.py` 中检测平台选择正确的二进制名
- PyInstaller spec 中包含 `.exe` 文件

**验收标准**：
- [ ] `config.py` 能正确定位 ffmpeg/ffprobe 的 Windows 可执行文件
- [ ] pydub 能调用 ffmpeg 进行音频格式转换
- [ ] 文档中说明 ffmpeg.exe 的获取方式（https://github.com/BtbN/FFmpeg-Builds/releases）

---

### 2.6 前端 CSS/布局适配

**描述**：Mac 版使用 `titleBarStyle: 'hiddenInset'` + 自定义拖拽区域，Windows 版使用系统默认窗口框架。

**适配项**：
- 移除顶部为 macOS traffic light 按钮预留的 padding-left
- 调整侧边栏顶部间距（Mac 上为绕开红绿灯按钮，Windows 不需要）
- 确保内容区域无多��空白

**验收标准**：
- [ ] Windows 上窗口有标准的最小化/最大化/关闭按钮
- [ ] 内容区域没有多余的左上角空白
- [ ] 窗口可正常拖动、缩放

---

### 2.7 package.json 调整

**描述**：修改项目配置适配 Windows 开发和构建环境。

**变更项**：
- `name`: `guitar-autostomp-win`
- `scripts.dist:backend`: 使用 Windows 命令语法（`if not exist ... mkdir`、`xcopy`）
- `scripts.dist:win`: 主打包命令
- 移除 `scripts.dist:mac`（Mac 相关脚本）

**验收标准**：
- [ ] `npm run dev` 能正常启动 Next.js 开发服务器
- [ ] `npm run electron:dev` 能启动 Electron + Python 后端
- [ ] `npm run dist:backend` 能在 Windows 上完成 PyInstaller 打包
- [ ] `npm run dist:win` 能生成 NSIS 安装包

---

### 2.8 编写 Windows 构建脚本

**描述**：提供一键构建脚本，简化 Windows 上的打包流程。

**脚本内容**：
```
1. 检查 Python 环境和依赖
2. PyInstaller 打包后端
3. Next.js 静态导出
4. electron-builder 生成安装包
```

**验收标准**：
- [ ] `scripts/build-win.bat` 能在 Windows cmd 中一键执行
- [ ] 脚本有错误检测，任一步骤失败则中止并提示
- [ ] 最终产物在 `release/` 目录下

---

### 2.9 编写 README / 开发环境文档

**描述**：为 Windows 版提供完整的开发环境搭建和构建指南。

**内容**：
- 前置依赖：Node.js 20+、Python 3.13+、loopMIDI
- 环境搭建步骤
- 开发模式启动方法
- 生产打包步骤
- loopMIDI 安装与配置说明
- 常见问题排查

**验收标准**：
- [ ] 按照文档步骤能在全新 Windows 机器上完成环境搭建
- [ ] 文档中包含 loopMIDI 下载链接和配置说明

---

## 3. 不变项（无需修改）

以下模块在 Mac 和 Windows 上行为一致，直接复制即可：

- **stdio JSON-RPC 通信协议**：stdin/stdout 管道通信跨平台一致
- **Electron IPC 层**：`main.js` 中 `spawn()` 在 Windows 上同样工作（已有平台判断）
- **前端业务逻辑**：React 组件、Zustand stores、音频播放（Web Audio API）
- **项目管理**：JSON 文件存储方案跨平台通用
- **preset_uid.py**：juce_hash_code_64 算法为纯数学运算，跨平台一致
- **midi_xml_gen.py**：XML 生成为纯字符串操作
- **preset_scanner.py**：使用 `pathlib.Path`，自动适配路径分隔符
- **audio_engine.py**：pydub + soundfile 跨平台
- **project_manager.py**：纯 JSON 文件操作

---

## 4. 风险与降级方案

### 4.1 MIDI 虚拟端口不可用

- **风险**：用户未安装 loopMIDI，无法创建虚拟端口
- **降级**：允许用户直接选择 DAW 暴露的 MIDI 输入端口，跳过虚拟端口环节
- **UI 提示**：首次启动检测无虚拟端口时，弹出引导对话框并提供 loopMIDI 下载链接

### 4.2 Neural DSP 预设路径不统一

- **风险**：不同用户的 Neural DSP 安装路径可能不同
- **降级**：提供设置页面允许用户手动指定预设目录
- **自动扫描**：按优先级尝试多个常见路径

### 4.3 python-rtmidi 编译问题

- **风险**：Windows 上 python-rtmidi 需要 C++ 编译器
- **降级**：使用预编译 wheel（pip 通常有 Windows x64 wheel 可用）
- **打包时**：PyInstaller 会将编译好的 `.pyd` 文件打入包内

### 4.4 ffmpeg 分发

- **风险**：ffmpeg.exe 体积较大（约 80MB），增加安装包体积
- **降级**：可考虑首次使用时下载，或提供精简版（仅含解码器）

---

## 5. 开发计划

| 阶段 | 内容 | 预计耗时 |
|------|------|----------|
| Phase 1 | 项目结构创建 + 路径适配 + package.json | 20 min |
| Phase 2 | MIDI 虚拟端口 Windows 方案 | 30 min |
| Phase 3 | PyInstaller spec + ffmpeg + 构建脚本 | 25 min |
| Phase 4 | 前端 CSS 适配 + README | 15 min |
| Phase 5 | 验收测试 | 10 min |

**总计：约 1.5 小时**

---

## 6. 文件清单（预期产物）

```
Guitar AutoStomp Win/
├── electron/
│   ├── main.js              # 与 Mac 版相同（已有平台判断）
│   └── preload.js           # 与 Mac 版相同
├── backend/
│   ├── main_stdio.py        # 与 Mac 版相同
│   ├── patch_audioop.py     # 与 Mac 版相同
│   ├── requirements.txt     # 与 Mac 版相同
│   ├── guitar-autostomp-backend.spec  # Windows 专用 spec
│   ├── ffmpeg.exe           # Windows ffmpeg（占位/需自行下载）
│   ├── ffprobe.exe          # Windows ffprobe（占位/需自行下载）
│   └── app/
│       ├── __init__.py
│       ├── config.py        # 路径已适配 Windows
│       ├── models/
│       │   └── __init__.py
│       └── services/
│           ├── __init__.py
│           ├── audio_engine.py
│           ├── midi_controller.py  # Windows 虚拟端口方案
│           ├── midi_learn_guide.py
│           ├── midi_xml_gen.py
│           ├── preset_scanner.py
│           ├── preset_uid.py
│           └── project_manager.py
├── src/                     # Next.js 前端（适配 Windows 布局）
│   ├── app/
│   ├── components/
│   ├── hooks/
│   ├── lib/
│   ├── stores/
│   └── types/
├── scripts/
│   ├── afterPack.js         # 与 Mac 版相同（已有平台判断）
│   └── build-win.bat        # Windows 一键构建脚本
├── data/
│   └── projects/
├── .env.example
├── .gitignore
├── electron-builder.yml     # Windows 专用配置
├── next.config.ts
├── package.json             # Windows 版配置
├── postcss.config.mjs
├── tsconfig.json
├── vitest.config.ts
├── PRD-Windows-Adaptation.md  # 本文档
└── README.md                # Windows 开发指南
```
