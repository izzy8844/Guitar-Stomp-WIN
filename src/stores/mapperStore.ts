import { create } from 'zustand'

export interface PresetInfo { name: string; uid: string; uid_path: string; source: string; path?: string }
export interface PresetMapping { name: string; uid: string; pc: number }
export interface MappingTone { name: string; pc: number; uid: string }

export type InitStatus = 'idle' | 'loading' | 'ready' | 'auto_mapped' | 'no_user_presets' | 'no_plugins' | 'error'

interface MapperState {
  selectedPort: string; midiPorts: string[]; setSelectedPort: (p: string) => void; setMidiPorts: (p: string[]) => void
  selectedPlugin: string; plugins: string[]; setSelectedPlugin: (p: string) => void; setPlugins: (p: string[]) => void
  presets: PresetInfo[]; selectedPresets: Set<string>; presetOrder: string[]; loading: boolean
  setPresets: (p: PresetInfo[]) => void; togglePreset: (n: string) => void
  selectAllPresets: (names?: string[]) => void; deselectAllPresets: (names?: string[]) => void
  movePreset: (from: number, to: number) => void; setLoading: (l: boolean) => void
  getMappings: () => PresetMapping[]; searchQuery: string; setSearchQuery: (q: string) => void
  generatedXml: string; targetPath: string; installedPath: string
  setGeneratedXml: (xml: string, path: string) => void; setInstalledPath: (p: string) => void; clearXml: () => void
  activeMappingFile: string; activeMappingTones: MappingTone[]
  setActiveMappingFile: (f: string) => void; setActiveMappingTones: (t: MappingTone[]) => void
  // Init / auto-setup state
  initStatus: InitStatus; setInitStatus: (s: InitStatus) => void
  autoSetupDone: boolean; setAutoSetupDone: (d: boolean) => void
  userPresets: Array<{ name: string; pc: number; uid: string }>; setUserPresets: (p: Array<{ name: string; pc: number; uid: string }>) => void
  // Version counter to trigger mapping reload after install
  mappingVersion: number; bumpMappingVersion: () => void
}

export const useMapperStore = create<MapperState>((set, get) => ({
  selectedPort: '', midiPorts: [],
  setSelectedPort: (p) => set({ selectedPort: p }), setMidiPorts: (p) => set({ midiPorts: p }),
  selectedPlugin: '', plugins: [],
  setSelectedPlugin: (plugin) => {
    // Derive default mapping filename: {slug}_user.xml
    const slug = plugin.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')
    const defaultFile = plugin ? `${slug}_user.xml` : ''
    // IMPORTANT: clear userPresets too. They are plugin-specific (populated by
    // auto-setup for the previously selected plugin). If left stale, ToneAddDialog
    // — which prioritizes userPresets — would show the OLD plugin's tones, which
    // don't match the newly selected plugin / its XML mapping. (Auto-setup repopulates
    // userPresets right after calling this for the new plugin, so order is safe.)
    set({ selectedPlugin: plugin, activeMappingFile: defaultFile, activeMappingTones: [], userPresets: [], presets: [], selectedPresets: new Set(), presetOrder: [], generatedXml: '', targetPath: '', installedPath: '' })
  },
  setPlugins: (p) => set({ plugins: p }),
  presets: [], selectedPresets: new Set(), presetOrder: [], loading: false,
  setPresets: (presets) => {
    const existing = get().selectedPresets; const order = get().presetOrder
    const nameSet = new Set(presets.map(p => p.name))
    const selected = new Set([...existing].filter(n => nameSet.has(n)))
    set({ presets, selectedPresets: selected, presetOrder: order.filter(n => nameSet.has(n) && selected.has(n)) })
  },
  togglePreset: (name) => {
    const selected = new Set(get().selectedPresets); const order = [...get().presetOrder]
    if (selected.has(name)) { selected.delete(name); set({ selectedPresets: selected, presetOrder: order.filter(n => n !== name) }) }
    else { selected.add(name); set({ selectedPresets: selected, presetOrder: [...order, name] }) }
  },
  selectAllPresets: (names) => { const all = names ?? get().presets.map(p => p.name); set({ selectedPresets: new Set(all), presetOrder: [...all] }) },
  deselectAllPresets: (names) => {
    if (names) { const s = new Set(get().selectedPresets); const o = [...get().presetOrder]; const r = new Set(names); names.forEach(n => s.delete(n)); set({ selectedPresets: s, presetOrder: o.filter(n => !r.has(n)) }) }
    else set({ selectedPresets: new Set(), presetOrder: [] })
  },
  movePreset: (from, to) => { const o = [...get().presetOrder]; const [r] = o.splice(from, 1); o.splice(to, 0, r); set({ presetOrder: o }) },
  setLoading: (l) => set({ loading: l }),
  getMappings: () => { const { presetOrder, presets } = get(); return presetOrder.map((n, i) => { const p = presets.find(x => x.name === n); return { name: n, uid: p?.uid_path || p?.uid || '', pc: i } }) },
  searchQuery: '', setSearchQuery: (q) => set({ searchQuery: q }),
  generatedXml: '', targetPath: '', installedPath: '',
  setGeneratedXml: (x, p) => set({ generatedXml: x, targetPath: p }),
  setInstalledPath: (p) => set({ installedPath: p }),
  clearXml: () => set({ generatedXml: '', targetPath: '', installedPath: '' }),
  activeMappingFile: '', activeMappingTones: [],
  setActiveMappingFile: (f) => set({ activeMappingFile: f }),
  setActiveMappingTones: (t) => set({ activeMappingTones: t }),
  // Init / auto-setup
  initStatus: 'idle', setInitStatus: (s) => set({ initStatus: s }),
  autoSetupDone: false, setAutoSetupDone: (d) => set({ autoSetupDone: d }),
  userPresets: [], setUserPresets: (p) => set({ userPresets: p }),
  // Version counter to trigger mapping reload
  mappingVersion: 0, bumpMappingVersion: () => set((s) => ({ mappingVersion: s.mappingVersion + 1 })),
}))

// UI mapper preferences (key prefix unified from legacy `tonemaster_` to `guitar_autostomp_`).
const SELECTED_PLUGIN_KEY = 'guitar_autostomp_selected_plugin'
const ACTIVE_MAPPING_KEY = 'guitar_autostomp_active_mapping'

if (typeof window !== 'undefined') {
  try {
    // One-time cleanup of legacy keys (no migration; backend is authoritative).
    localStorage.removeItem('tonemaster_selected_plugin')
    localStorage.removeItem('tonemaster_active_mapping')
  } catch { /* ignore */ }
  try {
    const sp = localStorage.getItem(SELECTED_PLUGIN_KEY)
    const am = localStorage.getItem(ACTIVE_MAPPING_KEY)
    if (sp) useMapperStore.setState({ selectedPlugin: sp })
    if (am) useMapperStore.setState({ activeMappingFile: am })
  } catch { /* localStorage may be unavailable in private browsing */ }

  // Debounced localStorage persist — prevent rapid-fire writes during cascading state updates
  let persistTimer: ReturnType<typeof setTimeout> | null = null
  useMapperStore.subscribe((s) => {
    if (persistTimer) clearTimeout(persistTimer)
    persistTimer = setTimeout(() => {
      try {
        if (s.selectedPlugin) localStorage.setItem(SELECTED_PLUGIN_KEY, s.selectedPlugin)
        if (s.activeMappingFile) localStorage.setItem(ACTIVE_MAPPING_KEY, s.activeMappingFile)
      } catch { /* quota exceeded or private browsing */ }
    }, 100)
  })
}
