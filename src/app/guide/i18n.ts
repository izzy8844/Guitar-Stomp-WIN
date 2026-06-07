export type Locale = 'zh' | 'en'

export const content: Record<Locale, {
  back: string
  title: string
  subtitle: string
  tags: string[]
  quickStartTitle: string
  steps: {
    title: string
    content: string[]
    substeps?: { title: string; items: string[] }[]
    tip?: string
  }[]
  sections: {
    id: string
    title: string
    content: string[]
    subsections?: { title: string; items: string[] }[]
    tip?: string
  }[]
  shortcuts: { key: string; desc: string }[]
  faq: { q: string; a: string }[]
  cta: string
}> = {
  en: {
    back: 'Back',
    title: 'Quick Start Guide',
    subtitle: 'Guitar AutoStomp helps you switch tones automatically during your performance. Upload a backing track, set tone triggers, and let the app handle the rest.',
    tags: ['MIDI Control', 'Auto Switch', 'Neural DSP'],
    quickStartTitle: 'Quick Start',
    steps: [
      {
        title: 'Upload a Backing Track',
        content: ['Click the "Upload Backing Track" button in the top toolbar and select any common audio file (MP3, WAV, FLAC, etc.).'],
      },
      {
        title: 'Detect Your Plugin',
        content: ['Go to the Settings/Tones page and select your Neural DSP plugin. The app will automatically scan your user presets.'],
      },
      {
        title: 'Add Tone Triggers',
        content: ['Click the "+" button to add triggers at specific points in your backing track. Each trigger maps to a preset (Program Change).'],
      },
      {
        title: 'Map and Install',
        content: ['In the Settings page, select your desired presets, arrange their order via drag-and-drop, then click "Auto Map & Install" to generate and install the MIDI mapping XML.'],
      },
      {
        title: 'Play',
        content: ['Press play and let the app automatically switch tones at each trigger point.'],
      },
    ],
    sections: [
      {
        id: 'midi',
        title: 'MIDI Configuration',
        content: [
          'Guitar AutoStomp uses a virtual MIDI port to communicate with your Neural DSP plugin. The app automatically creates the necessary MIDI mapping XML files in the correct format.',
          'On macOS, the app automatically creates a native virtual MIDI port — no extra setup needed.',
          'On Windows, you need to install loopMIDI (https://www.tobias-erichsen.de/software/loopmidi.html) and create a port named "AutoStomp Virtual". The app will auto-detect it on startup.',
        ],
      },
      {
        id: 'presets',
        title: 'Preset Management',
        content: ['User presets are scanned from your plugin\'s preset directory. You can filter by source (User, Artists, Factory) and reorder them to match your desired Program Change sequence.'],
      },
    ],
    shortcuts: [
      { key: 'Space', desc: 'Play / Pause' },
      { key: '← →', desc: 'Seek backward / forward' },
      { key: 'A', desc: 'Set AB loop start' },
      { key: 'B', desc: 'Set AB loop end' },
    ],
    faq: [
      { q: 'Why can\'t I hear any sound?', a: 'Make sure your Neural DSP plugin is running and the virtual MIDI port is properly configured.' },
      { q: 'How do I add more triggers?', a: 'Click the green "+" button above the trigger list, or double-click on the waveform to add a trigger at that position.' },
    ],
    cta: 'Back to Project',
  },
  zh: {
    back: '返回',
    title: '快速入门指南',
    subtitle: 'Guitar AutoStomp 帮助你在演出中自动切换音色。上传伴奏轨道，设置音色触发器，剩下的交给应用处理。',
    tags: ['MIDI 控制', '自动切换', 'Neural DSP'],
    quickStartTitle: '快速开始',
    steps: [
      {
        title: '上传伴奏轨道',
        content: ['点击顶部工具栏的"上传伴奏轨道"按钮，选择任意常见音频文件（MP3、WAV、FLAC 等）。'],
      },
      {
        title: '检测你的插件',
        content: ['前往设置/音色页面，选择你的 Neural DSP 插件。应用将自动扫描你的用户预设。'],
      },
      {
        title: '添加音色触发器',
        content: ['点击"+"按钮在伴奏轨道的特定位置添加触发器。每个触发器映射到一个预设（Program Change）。'],
      },
      {
        title: '映射与安装',
        content: ['在设��页面中，选择你想要的预设，通过拖拽排列顺序，然后点击"自动映射并安装"生成并安装 MIDI 映射 XML 文件。'],
      },
      {
        title: '播放',
        content: ['按下播放键，应用会在每个触发点自动切换音色。'],
      },
    ],
    sections: [
      {
        id: 'midi',
        title: 'MIDI 配置',
        content: [
          'Guitar AutoStomp 使用虚拟 MIDI 端口与你的 Neural DSP 插件通信。应用会自动创建正确格式的 MIDI 映射 XML 文件。',
          'macOS 上，应用会自动创建原生虚拟 MIDI 端口，无需额外设置。',
          'Windows 上，你需要安装 loopMIDI（https://www.tobias-erichsen.de/software/loopmidi.html），并创建一个名为 "AutoStomp Virtual" 的端口。应用启动时会自动检测该端口。',
        ],
      },
      {
        id: 'presets',
        title: '预设管理',
        content: ['用户预设从插件的预设目录中扫描。你可以按来源筛选（用户、艺术家、出厂），��重新排序以匹配你期望的 Program Change 序列。'],
      },
    ],
    shortcuts: [
      { key: '空格键', desc: '播放 / 暂停' },
      { key: '← →', desc: '后退 / 前进' },
      { key: 'A', desc: '设置 AB 循环起点' },
      { key: 'B', desc: '设置 AB 循环终点' },
    ],
    faq: [
      { q: '为什么我听不到声音？', a: '请确保你的 Neural DSP 插件正在运行，且虚拟 MIDI 端口已正确配置。' },
      { q: '如何添加更多触发器？', a: '点击触发器列表上方的绿色"+"按钮，或双击波形图在对应位置添加触发器。' },
    ],
    cta: '返回项目',
  },
}

`
