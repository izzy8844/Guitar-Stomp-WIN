# Issue #6 修改建议报告

> 基于 `izzy8844/Guitar-Stomp-WIN` 当前代码走查，针对 6 个问题给出精准定位和修改方案。

---

## 问题 1：启动时的 Demo 项目

**现状：**

- `projectStore.ts:135` — 默认状态 `isDemo: true`，`triggers: DEMO_TRIGGERS`（Clean/Lead/Heavy 三个预制 trigger）
- `page.tsx:72-73` — 启动逻辑：
  ```typescript
  if (!useProjectStore.getState().currentProject && !useProjectStore.getState().isDemo) {
    useProjectStore.getState().newProject()
  }
  ```
  因为 `isDemo` 默认为 `true`，条件永远不满足，用户永远停在 Demo 模式。

**修改建议：**

| 文件 | 位置 | 改动 |
|------|------|------|
| `src/stores/projectStore.ts` | L127-129 默认值 | `isDemo: true` → `isDemo: false`，`projectName: 'Demo Project'` → `projectName: 'Untitled Project'`，`triggers: DEMO_TRIGGERS` → `triggers: []` |
| `src/app/page.tsx` | L72-73 | 改为 `if (!useProjectStore.getState().currentProject) { useProjectStore.getState().newProject() }` — 无条件创建新项目 |

或保留 Demo 功能但默认不进入：启动时先调 `hydrateProjectStore()`，如果有未保存草稿就恢复，没有就先展示空白页面引导用户「新建项目 / 打开已有项目」，而不是硬塞一个 Demo。

---

## 问题 2：上传文件 100MB 限制

**现状：**

- `src/app/page.tsx:275` — `const MAX_SIZE = 100 * 1024 * 1024`
- `backend/app/config.py:113` — `AUDIO_MAX_SIZE_MB = 50`

前端限制 100MB，后端限制 50MB，两处不一致，且对于 WAV/FLAC 无损格式确实偏小。

**修改建议：**

| 文件 | 位置 | 改动 |
|------|------|------|
| `src/app/page.tsx` | L275 | `const MAX_SIZE = 500 * 1024 * 1024`（扩到 500MB）或完全移除前端校验，交后端处理 |
| `backend/app/config.py` | L113 | `AUDIO_MAX_SIZE_MB = 500`，前后端统一 |
| `backend/main_stdio.py` | `handle_audio_upload()` | 保持后端校验但给出友好提示 — 当前已有 `raise ValueError(f"File too large...")` ，确保错误信息返回前端即可 |

**或评估不限制大小的方案：** 后端 `_validate_audio_path()` 已做路径安全校验（限制在用户 home 或 PROJECTS_DIR 内），去掉文件大小限制也不会有安全问题，音频解码由前端 Web Audio API 完成，后端只做 base64 serve，无内存风险。

---

## 问题 3：顶部 Header `pl-20` 左边距

**现状：**

- `src/app/page.tsx:330` — `<header className="... pl-20 ...">`
- `Tailwind pl-20 = 5rem = 80px`，这是给 macOS `hiddenInset` 标题栏红绿灯留的空位

`electron/main.js:383-394` 已经正确处理窗口框架：
```javascript
const isMac = process.platform === 'darwin'
// macOS: hiddenInset + trafficLight，Windows: 默认框架
```

但前端 Header 没有感知平台，硬编码了 macOS 的 80px 左留白。

**修改建议：**

| 文件 | 位置 | 改动 |
|------|------|------|
| `src/app/page.tsx` | L330 | `pl-20` → 从 `window.electronAPI.platform` 读取，macOS 用 `pl-20`，Windows 用 `pl-4`（16px） |
| `electron/preload.js` | L34 | 已暴露 `platform: process.platform`，前端直接用 `window.electronAPI.platform` |

具体改法：
```tsx
const [isMac, setIsMac] = useState(false)
useEffect(() => {
  if (window.electronAPI) setIsMac(window.electronAPI.platform === 'darwin')
}, [])
// ...
<header className={`... ${isMac ? 'pl-20' : 'pl-4'} ...`}>
```

同理，`settings/page.tsx` 和 `guide/page.tsx` 的 Header 也检查是否需要调整（目前它们的 header 使用 `pl-20` 系列）。

---

## 问题 4：侧边栏展开时 Timeline 出现白色滚动条

**现状：**

- `src/app/page.tsx:366-368`：
  ```tsx
  <div className="flex flex-1 overflow-hidden">
    {sidebarOpen && <ProjectSidebar />}
    <main className="flex-1 flex flex-col overflow-hidden">
  ```
- `ProjectSidebar` 使用 `w-64`（256px），展开/收起时没有过渡动画，直接 DOM 插入/移除

当 `sidebarOpen` 从 `false` → `true` 时，`<main>` 的可用宽度瞬间减少 256px，Waveform Canvas 重新计算尺寸，在此瞬间可能出现布局抖动，且滚动容器可能出现白色滚动条（浏览器默认 scrollbar 样式在暗色主题下很显眼）。

**修改建议：**

| 文件 | 位置 | 改动 |
|------|------|------|
| `src/app/page.tsx` | L366-368 | 给外侧容器加 `relative`，侧边栏加 `transition-all duration-200` + `absolute` 或 `flex-shrink-0`，让主内容区平滑缩放 |
| `src/components/ProjectSidebar.tsx` | L209 | `overflow-y-auto` → 添加 `scrollbar-thin scrollbar-thumb-zinc-700 scrollbar-track-transparent` 或自定义滚动条样式（需要 `tailwind-scrollbar` 插件或自定义 CSS） |
| `src/app/globals.css` | — | 添加全局滚动条样式：`::-webkit-scrollbar { width: 6px } ::-webkit-scrollbar-thumb { background: #3f3f46; border-radius: 3px }` |

推荐方案：给 sidebar 加上 CSS transition（`transition-[width] duration-200`），而不是直接用 `{sidebarOpen && ...}` 做 display 切换，改为始终渲染但宽度在 `w-0` 和 `w-64` 之间过渡：

```tsx
<div className={`overflow-hidden transition-[width] duration-200 ${sidebarOpen ? 'w-64' : 'w-0'}`}>
  <ProjectSidebar />
</div>
```

这样主内容区宽度平滑变化，不会出现突然 shift 导致的滚动条闪现。

---

## 问题 5：保存后侧边栏 Trigger 数量不更新

**现状：**

- `src/components/ProjectSidebar.tsx:243`：
  ```typescript
  const count = p.triggerCount ?? (Array.isArray(p.triggers) ? p.triggers.length : 0)
  ```
- `ProjectSidebar` 在 `useEffect` `onMount` 调用 `fetchProjects()` 填充 `projects` 数组
- `page.tsx handleSave()` 只更新了 `currentProject` 和 `markClean()`，**没有**调用 `setProjects()` 更新 sidebar 列表

所以 save 之后 sidebar 里的 `triggerCount` 保持旧值。

**修改建议：**

| 文件 | 位置 | 改动 |
|------|------|------|
| `src/app/page.tsx` | `handleSave()` | 保存成功后调用 `useProjectStore.getState().setProjects(...)` 更新对应的 project 在列表中的 `triggerCount` |
| `src/stores/projectStore.ts` | `setProjects` / `loadProject` | 在 `setProjects` 中同步更新 `currentProject` 如果 ID 匹配 |

具体做法（最小改动）：

在 `handleSave` 的 update 和 create 分支成功后，加一行：
```typescript
// After save success:
const updatedProjects = useProjectStore.getState().projects.map(p => 
  p.id === store.currentProject?.id 
    ? { ...p, triggerCount: store.triggers.length, name: store.projectName }
    : p
)
useProjectStore.getState().setProjects(updatedProjects)
```

如果是新建项目（之前 `currentProject` 为 null），需要把新项目 push 到列表头部：
```typescript
const newProject: ProjectData = {
  id: result.project.id,
  name: store.projectName,
  triggerCount: store.triggers.length,
  // ...
}
useProjectStore.getState().setProjects([newProject, ...useProjectStore.getState().projects])
```

---

## 问题 6：缩放后时间刻度粒度不够细

**现状：**

- `src/components/Waveform.tsx:174-179`：
  ```typescript
  const rawInterval = secsPerPx * 100
  const niceIntervals = [0.5, 1, 2, 5, 10, 15, 30, 60, 120, 300]
  ```
- 最小间隔 0.5 秒，放大到 20x 后 `secsPerPx ≈ 0.0025`，`rawInterval = 0.25`，落到 `0.5` 间隔，太粗
- 缺少亚秒级刻度和次级刻度线（minor ticks）

**修改建议：**

| 文件 | 位置 | 改动 |
|------|------|------|
| `src/components/Waveform.tsx` | L177-179 | 扩展 `niceIntervals` 到亚秒级别：`[0.05, 0.1, 0.2, 0.5, 1, 2, 5, 10, 15, 30, 60, 120, 300]` |
| `src/components/Waveform.tsx` | L199-205 | 添加 minor tick 网格线：在 majorInterval 之间插入 4 条细线（间隔 = majorInterval/5），用更低透明度绘制 |

具体改法：

```typescript
// 扩展刻度定义
const niceIntervals = [0.05, 0.1, 0.2, 0.5, 1, 2, 5, 10, 15, 30, 60, 120, 300]

// 绘制 minor ticks（在垂直网格循环后追加）
const minorInterval = majorInterval / 5
ctx.strokeStyle = 'rgba(255,255,255,0.03)'  // 非常淡
for (let t = minorInterval; t < totalDur; t += minorInterval) {
  // 跳过 major tick 位置
  if (Math.abs(t % majorInterval) < 0.001) continue
  const mx = (t / totalDur) * w
  ctx.beginPath()
  ctx.moveTo(mx, RULER_H)
  ctx.lineTo(mx, h)
  ctx.stroke()
}
```

这样放大到高倍率时，刻度自动从 0.5s → 0.2s → 0.1s → 0.05s 逐级细化，波形编辑时定位更精准。

---

## 修改优先级 & 影响面

| # | 问题 | 优先级 | 涉及文件数 | 影响面 |
|---|------|--------|-----------|--------|
| 1 | Demo 启动 | P1 | 2 | 用户体验，首次启动即被 Demo 困住 |
| 3 | Header 左边距 | P1 | 1 | 视觉，Windows 用户看起来很怪 |
| 5 | Trigger 计数不同步 | P1 | 2 | 功能 bug，数据展示错误 |
| 6 | 缩放刻度 | P2 | 1 | 精细编辑场景 |
| 2 | 文件大小限制 | P2 | 3 | 无损音频用户 |
| 4 | 侧边栏滚动条 | P2 | 2 | 视觉效果 |

**建议修复顺序：** 1 → 3 → 5 → 6 → 2 → 4
