import { create } from 'zustand'
import { usePlaybackStore } from './playbackStore'

// Lazy import to avoid circular dependency (undoStore imports projectStore)
function pushUndoSnapshot() {
  // Dynamic require pattern — safe because this only runs in the browser after both stores are initialized
  try {
    const { useUndoStore } = require('./undoStore')
    useUndoStore.getState().pushSnapshot()
  } catch { /* ignore during SSR/initial load */ }
}

export const PRESET_TONES = [
  { name: 'Clean', pc: 0 }, { name: 'Crunch', pc: 1 }, { name: 'Lead', pc: 2 },
  { name: 'Heavy', pc: 3 }, { name: 'Blues', pc: 4 }, { name: 'Jazz', pc: 5 },
  { name: 'Acoustic', pc: 6 }, { name: 'Chorus', pc: 7 }, { name: 'Delay', pc: 8 },
  { name: 'Reverb', pc: 9 }, { name: 'Wah', pc: 10 }, { name: 'Flanger', pc: 11 },
  { name: 'Phaser', pc: 12 }, { name: 'Tremolo', pc: 13 }, { name: 'Vibrato', pc: 14 },
  { name: 'Boost', pc: 15 },
]

export const TRIGGER_COLORS = [
  '#f59e0b', '#ef4444', '#3b82f6', '#10b981', '#8b5cf6', '#f97316',
  '#06b6d4', '#ec4899', '#84cc16', '#6366f1', '#14b8a6', '#f43f5e',
]

let colorIdx = 0
const nextColor = () => TRIGGER_COLORS[colorIdx++ % TRIGGER_COLORS.length]

export interface ProjectTrigger {
  id: number
  time: number
  pc: number
  name: string
  color: string
}

export interface RecentTone {
  name: string
  pc: number
}

export interface ProjectData {
  id: number | string
  name: string
  triggers: ProjectTrigger[]
  audioFile?: string | null
  createdAt?: string
  updatedAt?: string
  /** Trigger count from the backend list summary; the sidebar list rows are
   *  lightweight and don't carry the full `triggers` array. */
  triggerCount?: number
}

interface SavedProject {
  projectName?: string
  triggers?: ProjectTrigger[]
  audioFile?: string | null
  currentProjectId?: string | number | null
}

interface ProjectState {
  projects: ProjectData[]; currentProject: ProjectData | null
  triggers: ProjectTrigger[]; audioFile: string | null
  waveformData: number[] | null; projectName: string; isDemo: boolean
  sidebarOpen: boolean; presets: typeof PRESET_TONES
  recentTones: RecentTone[]
  isDirty: boolean
  setSidebarOpen: (v: boolean) => void
  setProjects: (p: ProjectData[]) => void; setCurrentProject: (p: ProjectData | null) => void
  setProjectName: (n: string) => void; setAudioFile: (f: string | null) => void
  setWaveformData: (d: number[] | null) => void
  addTrigger: (time: number, pc: number, name?: string) => void
  removeTrigger: (id: number) => void
  updateTrigger: (id: number, u: Partial<ProjectTrigger>) => void; clearTriggers: () => void
  addRecentTone: (name: string, pc: number) => void
  loadProject: (p: ProjectData) => void; loadDemoProject: () => void; newProject: () => void
  markClean: () => void
}

// localStorage keys (prefix unified from legacy `tonemaster_` to `guitar_autostomp_`).
// DRAFT_KEY now holds only an *un-saved draft* (a project not yet persisted to the
// backend) for crash recovery — it is NOT a mirror of backend projects.
const DRAFT_KEY = 'guitar_autostomp_draft'
const RECENT_TONES_KEY = 'guitar_autostomp_recent_tones'
// Remembers the id of the last project the user had open, so the next launch
// can reopen it instead of dropping into the demo. Written by loadProject().
const LAST_PROJECT_KEY = 'guitar_autostomp_last_project_id'

/** Persist the id of the project the user most recently opened. */
export function setLastOpenedProjectId(id: string | number | null | undefined) {
  if (typeof window === 'undefined') return
  try {
    if (id == null || id === '') localStorage.removeItem(LAST_PROJECT_KEY)
    else localStorage.setItem(LAST_PROJECT_KEY, String(id))
  } catch { /* ignore */ }
}

/** Read the id of the last opened project (null if none). */
export function getLastOpenedProjectId(): string | null {
  if (typeof window === 'undefined') return null
  try { return localStorage.getItem(LAST_PROJECT_KEY) } catch { return null }
}

function loadSaved(): SavedProject {
  if (typeof window === 'undefined') return {}
  try { const r = localStorage.getItem(DRAFT_KEY); return r ? JSON.parse(r) : {} } catch { return {} }
}

function save(data: SavedProject) {
  if (typeof window === 'undefined') return
  try { localStorage.setItem(DRAFT_KEY, JSON.stringify(data)) } catch {}
}

function clearDraft() {
  if (typeof window === 'undefined') return
  try { localStorage.removeItem(DRAFT_KEY) } catch {}
}

function loadRecentTones(): RecentTone[] {
  if (typeof window === 'undefined') return []
  try { const r = localStorage.getItem(RECENT_TONES_KEY); return r ? JSON.parse(r) : [] } catch { return [] }
}

function saveRecentTones(tones: RecentTone[]) {
  if (typeof window === 'undefined') return
  try { localStorage.setItem(RECENT_TONES_KEY, JSON.stringify(tones)) } catch {}
}

/** Validate a single trigger object from persisted data */
function isValidTrigger(t: unknown): t is ProjectTrigger {
  if (typeof t !== 'object' || t === null) return false
  const obj = t as Record<string, unknown>
  return (
    typeof obj.id === 'number' &&
    typeof obj.time === 'number' && Number.isFinite(obj.time) &&
    typeof obj.pc === 'number' &&
    typeof obj.name === 'string' &&
    typeof obj.color === 'string'
  )
}

const DEMO_TRIGGERS: ProjectTrigger[] = [
  { id: 1, time: 0, pc: 0, name: 'Clean', color: TRIGGER_COLORS[0] },
  { id: 2, time: 12.5, pc: 2, name: 'Lead', color: TRIGGER_COLORS[2] },
  { id: 3, time: 28, pc: 3, name: 'Heavy', color: TRIGGER_COLORS[3] },
]

export const useProjectStore = create<ProjectState>((set, get) => ({
  projects: [], currentProject: null,
  triggers: DEMO_TRIGGERS, audioFile: null, waveformData: null,
  projectName: 'Demo Project', isDemo: true, sidebarOpen: false,
  presets: PRESET_TONES,
  recentTones: [],
  isDirty: false,
  setSidebarOpen: (v) => set({ sidebarOpen: v }),
  setProjects: (p) => set({ projects: p }),
  setCurrentProject: (p) => set({ currentProject: p }),
  setProjectName: (n) => set((s) => {
    // Keep the sidebar list + currentProject in sync so a rename is reflected
    // in the project list immediately (the list rows render `projects[].name`,
    // which is otherwise only refreshed on mount/create/duplicate/delete).
    const cid = s.currentProject?.id
    return {
      projectName: n,
      isDirty: true,
      currentProject: s.currentProject ? { ...s.currentProject, name: n } : s.currentProject,
      projects: cid != null ? s.projects.map(p => p.id === cid ? { ...p, name: n } : p) : s.projects,
    }
  }),
  setAudioFile: (f) => set((s) => {
    const cid = s.currentProject?.id
    return {
      audioFile: f,
      isDirty: true,
      currentProject: s.currentProject ? { ...s.currentProject, audioFile: f } : s.currentProject,
      projects: cid != null ? s.projects.map(p => p.id === cid ? { ...p, audioFile: f } : p) : s.projects,
    }
  }),
  setWaveformData: (d) => set({ waveformData: d }),
  addTrigger: (time, pc, name) => {
    pushUndoSnapshot()
    const toneName = name || `Tone ${pc}`
    set((s) => ({
      triggers: [...s.triggers, { id: Date.now(), time, pc, name: toneName, color: nextColor() }].sort((a, b) => a.time - b.time),
      isDirty: true,
    }))
    // Record to recent tones
    get().addRecentTone(toneName, pc)
  },
  removeTrigger: (id) => {
    pushUndoSnapshot()
    set((s) => ({ triggers: s.triggers.filter(t => t.id !== id), isDirty: true }))
    // Reset active highlight since indices shifted
    usePlaybackStore.getState().setActiveTriggerIndex(-1)
  },
  updateTrigger: (id, u) => {
    pushUndoSnapshot()
    set((s) => ({
      triggers: s.triggers.map(t => t.id === id ? { ...t, ...u } : t).sort((a, b) => a.time - b.time),
      isDirty: true,
    }))
  },
  clearTriggers: () => {
    pushUndoSnapshot()
    set({ triggers: [], isDirty: true })
  },
  addRecentTone: (name, pc) => {
    const current = get().recentTones
    // Remove duplicates by pc, add to front, max 20
    const filtered = current.filter(t => t.pc !== pc)
    const updated = [{ name, pc }, ...filtered].slice(0, 20)
    set({ recentTones: updated })
    saveRecentTones(updated)
  },
  loadProject: (p) => {
    const prevAudioFile = get().audioFile
    const newAudioFile = p.audioFile || null
    console.log(`[ProjectStore:loadProject] name="${p.name}", audioFile="${newAudioFile}", prev="${prevAudioFile}"`)

    const pb = usePlaybackStore.getState()
    pb.setCurrentTick(0)
    pb.setIsPlaying(false)
    pb.clearABLoop()
    pb.setActiveTriggerIndex(-1)

    // Only reset duration if audioFile is actually changing.
    // When audioFile stays the same (e.g. user switches away and back quickly),
    // we must NOT clear duration — the subscribe won't re-trigger loadAudio
    // because audioFile didn't change, so duration would stay 0 forever.
    if (newAudioFile !== prevAudioFile) {
      pb.setDuration(0)
    }

    colorIdx = p.triggers?.length ?? 0
    set({ currentProject: p, projectName: p.name, triggers: p.triggers || [], audioFile: newAudioFile, waveformData: null, isDemo: false, isDirty: false })
    // Remember this as the project to reopen on next launch.
    setLastOpenedProjectId(p.id)
    console.log(`[ProjectStore:loadProject] DONE. duration=${pb.duration}`)
  },
  loadDemoProject: () => { colorIdx = DEMO_TRIGGERS.length; set({ currentProject: null, projectName: 'Demo Project', triggers: DEMO_TRIGGERS, audioFile: null, waveformData: null, isDemo: true, isDirty: false }) },
  newProject: () => { colorIdx = 0; setLastOpenedProjectId(null); set({ currentProject: null, projectName: 'Untitled Project', triggers: [], audioFile: null, waveformData: null, isDemo: false, isDirty: false }) },
  markClean: () => set({ isDirty: false }),
}))

// Hydration guard — prevents stale localStorage data from propagating during rehydration
export let isHydrating = false

export function hydrateProjectStore() {
  isHydrating = true
  // One-time cleanup of legacy `tonemaster_` keys. Per the agreed plan we do NOT
  // migrate old local data (the backend JSON store is now authoritative), so we
  // simply drop the stale keys to keep localStorage tidy.
  if (typeof window !== 'undefined') {
    try {
      localStorage.removeItem('tonemaster_project')
      localStorage.removeItem('tonemaster_recent_tones')
    } catch { /* ignore */ }
  }
  const s = loadSaved()
  const recent = loadRecentTones()

  // Validate triggers from the draft to prevent corrupted data from propagating
  const validTriggers = Array.isArray(s.triggers) ? s.triggers.filter(isValidTrigger) : []

  // The backend JSON store is the single source of truth for *saved* projects —
  // ProjectSidebar fetches the project list on mount and the user picks one.
  // We therefore NEVER rehydrate a backend-backed project (one with an id) from
  // localStorage: doing so created a "ghost project" that, via the auto-save
  // subscription, could overwrite the authoritative backend record with stale
  // local data. localStorage is only consulted to recover an *un-saved draft*
  // (no backend id) so an in-progress, never-saved session survives a crash.
  const hasUnsavedDraft = !s.currentProjectId && (Boolean(s.projectName) || validTriggers.length > 0)

  if (hasUnsavedDraft) {
    if (validTriggers.length) { colorIdx = validTriggers.length }
    useProjectStore.setState({
      currentProject: null,
      triggers: validTriggers,
      audioFile: s.audioFile ?? null,
      projectName: s.projectName ?? 'Untitled Project',
      isDemo: false,
      recentTones: recent,
    })
  } else {
    // No draft to recover (or the draft belonged to an already-saved project).
    // Discard any legacy draft and start on a fresh, blank "Untitled Project"
    // *synchronously* — the store's initial state is the demo project, and if we
    // left it untouched the UI would flash (or get stuck on) the demo while the
    // sidebar asynchronously fetches the backend list. Explicitly clearing the
    // demo here guarantees the user never lands on the demo by default. The
    // sidebar will subsequently reopen the last-opened project if one exists.
    if (s.currentProjectId) clearDraft()
    colorIdx = 0
    useProjectStore.setState({
      currentProject: null,
      triggers: [],
      audioFile: null,
      waveformData: null,
      projectName: 'Untitled Project',
      isDemo: false,
      isDirty: false,
      recentTones: recent,
    })
  }
  // Allow a microtask for subscriptions to settle, then unlock
  Promise.resolve().then(() => { isHydrating = false })
}

let st: ReturnType<typeof setTimeout> | null = null
if (typeof window !== 'undefined') {
  useProjectStore.subscribe((state) => {
    // localStorage is a crash-recovery buffer for UN-SAVED drafts only.
    // Saved projects (those with a backend id) are persisted by ProjectSidebar's
    // debounced projects.update sync — writing them here too would re-introduce
    // the dual-write conflict between localStorage and the backend JSON store.
    if (state.isDemo) return
    if (st) clearTimeout(st)
    if (state.currentProject?.id) {
      // Backed by the backend → clear any lingering local draft, don't mirror.
      st = setTimeout(() => clearDraft(), 500)
      return
    }
    st = setTimeout(() => save({
      projectName: state.projectName,
      triggers: state.triggers,
      audioFile: state.audioFile,
      currentProjectId: null,
    }), 500)
  })
}

// Note: In v2 (stdio JSON-RPC), trigger scheduling is handled entirely by the frontend
// Web Audio engine. The backend only executes fire_trigger when called. No sync needed.