import { create } from 'zustand'

interface PlaybackState {
  theme: string; setTheme: (t: string) => void
  isPlaying: boolean; currentTick: number; duration: number
  zoom: number; setZoom: (v: number | ((p: number) => number)) => void
  abLoopEnabled: boolean; loopA: number | null; loopB: number | null
  setLoopA: (v: number | null) => void; setLoopB: (v: number | null) => void
  setAbLoopEnabled: (v: boolean) => void; clearABLoop: () => void
  midiPorts: string[]; currentMidiPort: string | null
  lastMidiEvent: { pc?: number; program?: number; name?: string } | null
  wsConnected: boolean; wsStatus: 'connected' | 'disconnected' | 'connecting' | 'error'
  activeTriggerIndex: number
  bpm: number; setBpm: (v: number) => void
  /** Path of an audio file that the project references but the backend could not
   *  find on disk (file moved/deleted). null when audio is healthy. Transient,
   *  not persisted — drives the "relocate audio" prompt. */
  audioMissingPath: string | null; setAudioMissingPath: (p: string | null) => void
  /** Current stage of audio loading pipeline. Transient, not persisted. */
  audioLoadStage: 'idle' | 'uploading' | 'transferring' | 'decoding' | 'analyzing' | 'ready'
  setAudioLoadStage: (s: 'idle' | 'uploading' | 'transferring' | 'decoding' | 'analyzing' | 'ready') => void
  /** 0-100 progress within the current stage (best-effort). Transient, not persisted. */
  audioLoadProgress: number
  setAudioLoadProgress: (p: number) => void
  setIsPlaying: (v: boolean) => void; setCurrentTick: (t: number) => void; setDuration: (d: number) => void
  setMidiPorts: (p: string[]) => void; setCurrentMidiPort: (p: string | null) => void
  setLastMidiEvent: (e: { pc?: number; program?: number; name?: string } | null) => void
  setWsConnected: (v: boolean) => void; setWsStatus: (s: 'connected' | 'disconnected' | 'connecting' | 'error') => void
  setActiveTriggerIndex: (i: number) => void
}

// UI playback preferences (key prefix unified from legacy `tonemaster_` to `guitar_autostomp_`).
const PLAYBACK_KEY = 'guitar_autostomp_playback'
function loadSaved() {
  if (typeof window === 'undefined') return {}
  try { localStorage.removeItem('tonemaster_playback') } catch { /* ignore legacy cleanup */ }
  try { const r = localStorage.getItem(PLAYBACK_KEY); return r ? JSON.parse(r) : {} } catch { return {} }
}
function writeSaved(data: Record<string, unknown>) { if (typeof window === 'undefined') return; try { localStorage.setItem(PLAYBACK_KEY, JSON.stringify(data)) } catch {} }

export const usePlaybackStore = create<PlaybackState>((set, get) => ({
  theme: 'dark', setTheme: (t) => set({ theme: t }),
  isPlaying: false, currentTick: 0, duration: 0,
  zoom: 1, setZoom: (v) => set({ zoom: typeof v === 'function' ? v(get().zoom) : v }),
  abLoopEnabled: false, loopA: null, loopB: null,
  setLoopA: (v) => set({ loopA: v }), setLoopB: (v) => set({ loopB: v }),
  setAbLoopEnabled: (v) => set({ abLoopEnabled: v }),
  clearABLoop: () => set({ loopA: null, loopB: null, abLoopEnabled: false }),
  midiPorts: [], currentMidiPort: null, lastMidiEvent: null,
  wsConnected: false, wsStatus: 'disconnected', activeTriggerIndex: -1,
  bpm: 0, setBpm: (v) => set({ bpm: v }),
  audioMissingPath: null, setAudioMissingPath: (p) => set({ audioMissingPath: p }),
  audioLoadStage: 'idle', setAudioLoadStage: (s) => set({ audioLoadStage: s }),
  audioLoadProgress: 0, setAudioLoadProgress: (p) => set({ audioLoadProgress: p }),
  setIsPlaying: (v) => set({ isPlaying: v }),
  setCurrentTick: (t) => set({ currentTick: t }),
  setDuration: (d) => set({ duration: d }),
  setMidiPorts: (p) => set({ midiPorts: p }),
  setCurrentMidiPort: (p) => set({ currentMidiPort: p }),
  setLastMidiEvent: (e) => set({ lastMidiEvent: e }),
  setWsConnected: (v) => set({ wsConnected: v }),
  setWsStatus: (s) => set({ wsStatus: s }),
  setActiveTriggerIndex: (i) => set({ activeTriggerIndex: i }),
}))

const PERSIST_KEYS = ['zoom', 'currentTick', 'loopA', 'loopB', 'currentMidiPort'] as const

export function hydratePlaybackStore() {
  const raw = loadSaved()
  if (!raw || typeof raw !== 'object') return
  const patch: Record<string, unknown> = {}
  for (const key of PERSIST_KEYS) {
    if (key in raw) patch[key] = (raw as Record<string, unknown>)[key]
  }
  if (Object.keys(patch).length) usePlaybackStore.setState(patch as Partial<PlaybackState>)
}

let saveTimer: ReturnType<typeof setTimeout> | null = null
if (typeof window !== 'undefined') {
  // Persist on meaningful changes — skip currentTick updates during active playback
  // to avoid localStorage writes every 500ms at 60fps. currentTick IS persisted
  // but only when playback is paused/stopped (user intent to remember position).
  let prevPersist = { zoom: 0, currentTick: 0, loopA: null as number | null, loopB: null as number | null, currentMidiPort: null as string | null }
  let prevIsPlaying = false
  usePlaybackStore.subscribe((state) => {
    const curr = { zoom: state.zoom, currentTick: state.currentTick, loopA: state.loopA, loopB: state.loopB, currentMidiPort: state.currentMidiPort }
    // During playback, only persist non-tick fields (zoom, loop, midiPort changes)
    const tickChanged = curr.currentTick !== prevPersist.currentTick
    const otherChanged = curr.zoom !== prevPersist.zoom ||
        curr.loopA !== prevPersist.loopA || curr.loopB !== prevPersist.loopB ||
        curr.currentMidiPort !== prevPersist.currentMidiPort
    // Force persist when playback stops (save final position)
    const stoppedPlaying = prevIsPlaying && !state.isPlaying
    prevIsPlaying = state.isPlaying
    // Skip if nothing changed, or if only tick changed during playback (unless just stopped)
    if (!stoppedPlaying && !otherChanged && (!tickChanged || state.isPlaying)) return
    prevPersist = curr
    if (saveTimer) clearTimeout(saveTimer)
    saveTimer = setTimeout(() => writeSaved(curr), 500)
  })
}