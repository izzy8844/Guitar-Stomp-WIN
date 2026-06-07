# Guitar-Stomp-WIN Windows 适配走查报告

> 生成时间：2026-06-07  
> 范围：全项目 66 个文件深度审查  
> 关注点：macOS 残留代码、Windows 兼容性、跨平台风险

---

## 一、总体评估

| 维度 | 评级 | 说明 |
|------|------|------|
| Electron 窗口适配 | ✅ 已适配 | 标题栏、红绿灯分离处理 |
| MIDI 虚拟端口 | ✅ 已适配 | loopMIDI 检测 + 引导方案完整 |
| 文件路径 | ✅ 已适配 | platform.system() 分支覆盖 |
| 音频引擎 | ✅ 无平台问题 | 纯 Web Audio API + pydub |
| 前端 UI | ✅ 基本无问题 | Tailwind CSS，无 macOS 硬编码 |
| 前后端通信 | ✅ 无平台问题 | stdio JSON-RPC，无端口依赖 |
| 打包构建 | ✅ 已适配 | PyInstaller + NSIS 完整 |
| 用户引导 | ⚠️ 有遗漏 | 部分文档/Copy 偏 macOS |
| 错误处理 | ⚠️ 可改进 | 部分回退代码偏 macOS |

---

## 二、已正确适配的模块

### 2.1 Electron 主进程 (`electron/main.js`)

| 位置 | 适配方式 | 评价 |
|------|----------|------|
| L143: Python 二进制名 | `win32 ? 'python' : 'python3'` | ✅ 正确 |
| L148: 打包模式 EXE | `win32 ? '.exe' : ''` | ✅ 正确 |
| L383-394: 窗口样式 | `isMac` 仅给 `titleBarStyle: 'hiddenInset'` | ✅ Windows 用默认框架 |
| L481: 关闭行为 | `!== 'darwin'` 时退出 | ✅ 符合 Windows 惯例 |
| L487-497: 子进程终止 | 注释写明 Windows 不支持 SIGTERM | ✅ 有平台意识 |
| L489: `stdin.end()` 优雅退出 | 跨平台可用 | ✅ |

### 2.2 后端 MIDI 控制器 (`backend/app/services/midi_controller.py`)

| 位置 | 适配方式 | 评价 |
|------|----------|------|
| L34-58: `_find_loopback_port()` | 扫描 `loopMIDI`/`AutoStomp` 端口名 | ✅ 优先级链合理 |
| L82: `init_virtual_port()` | `SYSTEM == "Darwin"` 虚拟端口 vs 检测模式 | ✅ 正确分支 |
| L93-100: 无 loopback 时 | 打印安装指引 URL，不崩溃 | ✅ |
| L58: 端口缓存 | `_port_cache` 全局字典 | ✅ 跨平台 |

### 2.3 后端配置 (`backend/app/config.py`)

| 路径项 | macOS | Windows | 评价 |
|--------|-------|---------|------|
| DATA_ROOT | `~/Library/Application Support/` | `%LOCALAPPDATA%` | ✅ |
| NEURAL_DSP_PRESETS | `/Library/Audio/Presets/` 等 4 个 | Documents/ProgramData/Public/LOCALAPPDATA 4 个 | ✅ |
| NEURAL_DSP_USER_CONFIG | `~/Library/Application Support/Neural DSP/` | `%APPDATA%\Neural DSP\` | ✅ |
| ffmpeg 路径 | 无后缀 | `.exe` | ✅ |
| pydub converter | `ffmpeg_bin` / `ffprobe_bin` | `ffmpeg.exe` / `ffprobe.exe` | ✅ |

### 2.4 前端键盘快捷键 (`src/app/page.tsx:82`)

```typescript
const mod = e.metaKey || e.ctrlKey  // ✅ Cmd(macOS) | Ctrl(Windows) 双兼容
```

### 2.5 打包配置

| 文件 | 内容 | 评价 |
|------|------|------|
| `electron-builder.yml` | `win: nsis`，无 mac 配置 | ✅ Windows 专用 |
| `scripts/build-win.bat` | 完整 6 步构建脚本 | ✅ |
| `scripts/afterPack.js` | L13-17 区分 mac/win 资源路径 | ✅ |
| `backend/*.spec` | PyInstaller 配置，.exe 后缀 | ✅ |

---

## 三、发现的问题

### 🔴 高危

#### 3.1 `electron/main.js:143` — `python` 可能找不到

```javascript
execPath = process.platform === 'win32' ? 'python' : 'python3';
```

**问题**：Windows 上 `python` 命令可能不在 PATH 中（Python 3.13+ 安装时默认不添加；用户可能用 `py` 启动器）。

**影响**：开发模式下 Electron spawn 失败，后端无法启动。

**建议**：
```javascript
// 尝试 python, python3, py 三个命令
execPath = process.platform === 'win32' ? 'py -3' : 'python3';
// 或检测 which/where 结果
```

---

### 🟡 中危

#### 3.2 `src/app/guide/i18n.ts` — 引导页未提及 loopMIDI

当前中英文引导都只说"虚拟 MIDI 端口"，没有 Windows 用户需要的 loopMIDI 安装步骤。

```typescript
// 当前
content: ['Guitar AutoStomp 使用虚拟 MIDI 端口与你的 Neural DSP 插件通信...']
```

**影响**：Windows 用户看引导页不知道要装 loopMIDI，直到启动后才看到弹窗。

**建议**：在 guide 的 MIDI Configuration 章节添加平台判断：
```
macOS: 自动创建原生虚拟 MIDI 端口
Windows: 需要安装 loopMIDI → [下载链接]，创建名为 "AutoStomp Virtual" 的端口
```

#### 3.3 `src/lib/midi.ts` — Web MIDI API 与后端 MIDI 存在双通道

`midi.ts` 实现了浏览器原生 Web MIDI API (`navigator.requestMIDIAccess`)，但同时 `api.ts` 也通过 IPC → Python backend 发送 MIDI。

**问题**：
- Web MIDI API 在 Electron 中可用但需要 `webPreferences: { nodeIntegration: false }` 配合权限
- 实际 MIDI 发送走的是 Python backend (rtmidi)，前端这层是冗余的
- `sendProgramChange()` / `sendControlChange()` 从未被调用（fireTrigger 全走 IPC）

**影响**：功能正常（代码冗余），但在某些 Windows 配置下 Web MIDI API 请求可能触发权限对话框。

**建议**：清理或注释 `midi.ts` 中的 send 函数，统一走 `ws.ts → fireTrigger`。

#### 3.4 `electron/main.js:489-496` — 后端退出时 SIGTERM 回退逻辑

```javascript
// Note: SIGTERM is not supported on Windows; calling kill() with no args
// sends SIGTERM on Unix and terminates the process on Windows.
setTimeout(() => {
  if (backendProcess) {
    try { backendProcess.kill(); } catch {}
```

**问题**：`child_process.kill()` 在 Windows 上使用的是 `taskkill /F /PID`，强制终止进程。`stdin.end()` 已经试图优雅退出，但 1000ms 超时可能不够（Python 正在处理 midi 或 IO）。

**影响**：打包模式下，用户关闭应用时后端可能被强制杀死，导致 Neural DSP 的 MIDI Mapping XML 写入一半（极低概率）。

**建议**：增加超时到 3000ms，或先发送 `{"method":"shutdown"}` RPC 通知。

---

### 🔵 低危 / 美容

#### 3.5 `backend/app/services/midi_xml_gen.py:7` — docstring 残留 macOS 路径

```python
# 安装路径：~/Library/Application Support/Neural DSP/<PluginName>/MIDI Mappings/
# （不是 ~/Library/Audio/Presets — 那里存的是预设文件本身）
```

代码逻辑正确（使用 `NEURAL_DSP_USER_CONFIG`），但文档注释容易误导。

**建议**：更新为平台无关描述或同时标注 Windows 路径。

#### 3.6 `src/lib/midi.ts:116-124` — `detectOS()` 使用 UA 嗅探

```typescript
export function detectOS(): "mac" | "windows" | "linux" | "unknown" {
  const ua = navigator.userAgent.toLowerCase();
  if (ua.includes("mac")) return "mac";
  ...
}
```

**问题**：在 Electron 中 `process.platform` 更可靠（但 preload 已暴露），UA 嗅探在 Electron 里也能工作但不够精确。此函数似乎未被使用。

**建议**：从 preload 获取 `window.electronAPI.platform`。

#### 3.7 `scripts/build-win.bat:50` — `pip install --quiet` 隐藏错误

```batch
pip install -r requirements.txt --quiet
```

`--quiet` 会隐藏所有 pip 输出，安装失败也无法定位原因。

**建议**：移除 `--quiet` 或改用 `--progress-bar off` 保留错误输出。

#### 3.8 `package.json` — `name` 仍为 `guitar-autostomp-win`

```json
"name": "guitar-autostomp-win"
```

与 electron-builder `productName: "Guitar AutoStomp"` 一致，无问题。但 `version: 1.0.0` 无意义——这是从 issue 评论复制的初始版本。

#### 3.9 `electron-builder.yml:26` — 缺少图标

```yaml
icon: null  # TODO: Add icon.ico
```

NSIS 安装包和应用窗口将显示默认 Electron 图标。

---

## 四、未覆盖的风险区域

### 4.1 音频驱动延迟

**风险**：Windows WASAPI 与 macOS CoreAudio 的延迟特性不同。`useAudioEngine.ts` 中使用固定 `latencyHint: 'playback'` 和 `sampleRate: 44100`，在 Windows 上 WASAPI 共享模式可能有额外缓冲。

**建议**：添加 AudioContext 配置选项，允许用户在设置中选择延迟模式。

### 4.2 ffmpeg 依赖

**风险**：`backend/ffmpeg.exe` 和 `ffprobe.exe` 必须手动放置。构建脚本只给出警告但不阻断。

**建议**：构建脚本中自动下载 ffmpeg（从 BtbN/FFmpeg-Builds releases）。

### 4.3 PyInstaller 打包体积

**风险**：`guitar-autostomp-backend.spec` 打包了 numpy、pydantic_core、rtmidi 等原生模块，Windows 上 `onedir` 模式输出约 80-150MB。

**建议**：添加 `excludes` 更多无用包（如 `tkinter`、`test` 模块），使用 UPX 压缩。

### 4.4 多显示器 DPI 缩放

**风险**：Electron 在 Windows 高 DPI 显示器上的渲染可能有像素偏移。当前没有显式的 DPI 处理。

**建议**：在 `main.js` 顶部添加：
```javascript
app.commandLine.appendSwitch('high-dpi-support', '1');
app.commandLine.appendSwitch('force-device-scale-factor', '1');
```

---

## 五、文件级检查清单

| 文件 | 平台检查 | 结果 |
|------|----------|------|
| `electron/main.js` | `process.platform` 分支 | ✅ 正确 |
| `electron/preload.js` | 暴露 `platform` | ✅ 正确 |
| `backend/app/config.py` | `SYSTEM == "Darwin"` | ✅ 正确 |
| `backend/app/services/midi_controller.py` | `platform.system()` | ✅ 正确 |
| `backend/app/services/preset_scanner.py` | pathlib | ✅ 跨平台 |
| `backend/app/services/preset_uid.py` | 纯二进制 | ✅ 跨平台 |
| `backend/app/services/audio_engine.py` | pydub/soundfile | ✅ 跨平台 |
| `backend/app/services/project_manager.py` | pathlib | ✅ 跨平台 |
| `backend/app/services/midi_xml_gen.py` | docstring 有 macOS 路径 | ⚠️ 美容 |
| `backend/app/services/midi_learn_guide.py` | 纯 Python | ✅ 跨平台 |
| `backend/main_stdio.py` | Path.home() 安全验证 | ✅ 跨平台 |
| `backend/patch_audioop.py` | Python 3.13+ 兼容 | ✅ |
| `src/app/page.tsx` | `metaKey \|\| ctrlKey` | ✅ 正确 |
| `src/app/guide/i18n.ts` | 未提 loopMIDI | ⚠️ 需补充 |
| `src/app/settings/page.tsx` | dnd-kit + Tailwind | ✅ 跨平台 |
| `src/components/Waveform.tsx` | Canvas 2D | ✅ 跨平台 |
| `src/components/Transport.tsx` | 纯 React | ✅ 跨平台 |
| `src/hooks/useAudioEngine.ts` | Web Audio API | ✅ 跨平台 |
| `src/hooks/useWebSocket.ts` | 走 IPC | ✅ 跨平台 |
| `src/lib/api.ts` | Electron IPC | ✅ 跨平台 |
| `src/lib/midi.ts` | Web MIDI API 冗余 | ⚠️ 低危 |
| `src/stores/*.ts` | localStorage | ✅ 跨平台 |
| `scripts/build-win.bat` | Windows 专用 | ✅ |
| `scripts/afterPack.js` | 平台分支 | ✅ |
| `electron-builder.yml` | win/nsis | ✅ |
| `backend/*.spec` | PyInstaller Windows | ✅ |

---

## 六、优先修复建议

| 优先级 | 项目 | 预计工时 | 说明 |
|--------|------|----------|------|
| 🔴 P0 | Python 启动命令检测 | 0.5h | `python`/`python3`/`py -3` 多级回退 |
| 🟡 P1 | guide 页添加 loopMIDI 引导 | 0.5h | 中英文版 + 下载链接 |
| 🟡 P1 | 清理 midi.ts 冗余 API | 0.5h | 移除未使用的 Web MIDI 函数 |
| 🟡 P2 | 后端优雅退出超时延长 | 0.2h | 1000ms → 3000ms |
| 🔵 P3 | midi_xml_gen.py docstring | 0.1h | 更新注释 |
| 🔵 P3 | 添加应用图标 | 0.5h | 生成 .ico 文件 |
| 🔵 P3 | 高 DPI 支持 | 0.2h | commandLine 开关 |

---

## 七、结论

代码整体适配质量较高。核心的 MIDI 虚拟端口方案（loopMIDI 检测 + 引导）、文件路径映射、Electron 窗口处理、前后端通信（stdio JSON-RPC）均已正确实现。

**7 个问题中：0 个阻断，2 个中危，其余为美容或低危。**

最大风险是 `python` 命令在 Windows 上可能不在 PATH 中（P0），以及用户引导页缺少 loopMIDI 说明（P1）。其余模块运行预期正常。
