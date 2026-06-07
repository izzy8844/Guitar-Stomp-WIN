'use client'
/**
 * useAudioEngine — Web Audio API playback engine for Electron.
 *
 * Architecture:
 *  - Audio decoding & playback: Web Audio API (AudioContext + AudioBufferSourceNode)
 *  - Playhead tracking: AudioContext.currentTime (sample-accurate, no drift)
 *  - Trigger scheduling: lookahead scheduler (industry-standard pattern)
 *  - MIDI execution: sends `fire_trigger` via IPC → Python backend calls send_pc()
 *  - AB Loop: handled in the scheduler tick
 *
 * SINGLETON: All state is module-level so multiple hook instances share the same engine.
 * The Python backend NO LONGER owns playback. It only:
 *   1. Stores/serves audio files
 *   2. Receives `fire_trigger` and calls send_pc()
 *   3. Manages projects
 */

import { useEffect } from 'react'
import { usePlaybackStore } from '@/stores/playbackStore'
import { useProjectStore } from '@/stores/projectStore'
import { fireTrigger } from '@/lib/ws'
import { updateProject, createProject } from '@/lib/api'
import { storeToBackendUpdate } from '@/lib/projectMapping'
import { toast } from '@/components/Toast'

// ─── Types ─────────────────────────────────────────────────────��──────────────

interface Trigger {
  id: string
  time: number   // seconds
  pc: number
  name: string
}

// ─── Constants ────────────────────────────────────────────────────────────────

/** How far ahead (seconds) to look for triggers to schedule */
const LOOKAHEAD_SEC = 0.1
/** How often (ms) the scheduler tick runs */
const SCHEDULER_INTERVAL_MS = 25
/** How often (ms) the playhead UI update runs */
const PLAYHEAD_INTERVAL_MS = 50

// ─── Singleton audio context ──────────────────────────────────────────────────

let _sharedCtx: AudioContext | null = null

function getAudioContext(): AudioContext {
  if (!_sharedCtx || _sharedCtx.state === 'closed') {
    _sharedCtx = new AudioContext({ latencyHint: 'playback', sampleRate: 44100 })
  }
  return _sharedCtx
}

// ─── Singleton engine state (module-level) ────────────────────────────────────

let _audioBuffer: AudioBuffer | null = null

/** Get the current decoded AudioBuffer (for waveform extraction etc.) */
export function getAudioBuffer(): AudioBuffer | null {
  return _audioBuffer
}

// ─── Audio buffer cache (LRU, capacity=4) ─────────────────────────────────────
const CACHE_CAPACITY = 4
const _bufferCache: Map<string, AudioBuffer> = new Map()  // path → decoded buffer

function cacheGet(path: string): AudioBuffer | undefined {
  const buf = _bufferCache.get(path)
  if (buf) {
    // Move to end (most recently used)
    _bufferCache.delete(path)
    _bufferCache.set(path, buf)
  }
  return buf
}

function cachePut(path: string, buf: AudioBuffer) {
  _bufferCache.delete(path)  // remove if exists to refresh position
  _bufferCache.set(path, buf)
  // Evict oldest if over capacity
  while (_bufferCache.size > CACHE_CAPACITY) {
    const oldest = _bufferCache.keys().next().value
    if (oldest) _bufferCache.delete(oldest)
  }
}

let _sourceNode: AudioBufferSourceNode | null = null
let _startCtxTime: number = 0
let _startOffset: number = 0
let _isPlaying: boolean = false
let _triggers: Trigger[] = []
let _nextTriggerIdx: number = 0
let _firedSet: Set<string> = new Set()
let _schedulerTimer: ReturnType<typeof setInterval> | null = null
let _playheadTimer: ReturnType<typeof setInterval> | null = null
let _subscribed: boolean = false
let _loadedPath: string | null = null
let _loadVersion: number = 0
/** Flag: next audioFile change is a user upload (triggers rename + auto-save) */
let _nextLoadIsUserUpload: boolean = false

// ─── Global engine API ────────────────────────────────────────────────────────

interface EngineAPI {
  seek: (timeSec: number) => void
  play: () => void
  pause: () => void
  stop: () => void
}

/**
 * Get the active audio engine instance.
 * Use this in components that don't own the engine (e.g. Waveform, TriggerList).
 */
export function getAudioEngine(): EngineAPI {
  return { seek, play, pause, stop }
}

// ─── Core engine functions (module-level singletons) ──────────────────────────

function getPlayheadSec(): number {
  if (!_isPlaying) return _startOffset
  const ctx = getAudioContext()
  return _startOffset + (ctx.currentTime - _startCtxTime)
}

function syncPlayhead() {
  const t = getPlayheadSec()
  const dur = usePlaybackStore.getState().duration
  if (t >= dur && dur > 0 && _isPlaying) {
    stopPlayback()
    usePlaybackStore.getState().setCurrentTick(dur)
    usePlaybackStore.getState().setIsPlaying(false)
    return
  }
  usePlaybackStore.getState().setCurrentTick(t)
}

function schedulerTick() {
  if (!_isPlaying) return

  const now = getPlayheadSec()
  const lookaheadEnd = now + LOOKAHEAD_SEC
  const pb = usePlaybackStore.getState()

  // AB Loop check
  if (pb.abLoopEnabled && pb.loopA !== null && pb.loopB !== null) {
    const loopEnd = Math.max(pb.loopA, pb.loopB)
    if (now >= loopEnd) {
      const loopStart = Math.min(pb.loopA, pb.loopB)
      seek(loopStart)
      return
    }
  }

  // Fire triggers in lookahead window
  let idx = _nextTriggerIdx
  while (idx < _triggers.length) {
    const t = _triggers[idx]
    if (t.time > lookaheadEnd) break
    if (t.time >= now - 0.01 && !_firedSet.has(t.id)) {
      _firedSet.add(t.id)
      const delayMs = Math.max(0, (t.time - now) * 1000)
      const triggerData = { id: t.id, pc: t.pc, name: t.name, time_ms: Math.round(t.time * 1000) }
      if (delayMs < 5) {
        fireTrigger(triggerData)
      } else {
        setTimeout(() => {
          if (_isPlaying) fireTrigger(triggerData)
        }, delayMs)
      }
      usePlaybackStore.getState().setActiveTriggerIndex(idx)
      usePlaybackStore.getState().setLastMidiEvent({ pc: t.pc, name: t.name })
    }
    idx++
    _nextTriggerIdx = idx
  }
}

function stopPlayback() {
  _isPlaying = false
  if (_sourceNode) {
    try {
      _sourceNode.onended = null
      _sourceNode.stop()
      _sourceNode.disconnect()
    } catch { /* already stopped */ }
    _sourceNode = null
  }
  if (_schedulerTimer) { clearInterval(_schedulerTimer); _schedulerTimer = null }
  if (_playheadTimer) { clearInterval(_playheadTimer); _playheadTimer = null }
}

function startPlayback(offsetSec: number) {
  const buf = _audioBuffer
  if (!buf) return

  stopPlayback()

  const ctx = getAudioContext()
  if (ctx.state === 'suspended') ctx.resume()

  const source = ctx.createBufferSource()
  source.buffer = buf
  source.connect(ctx.destination)

  const clampedOffset = Math.max(0, Math.min(offsetSec, buf.duration))
  _startOffset = clampedOffset
  _startCtxTime = ctx.currentTime
  _isPlaying = true

  // Reset trigger scheduler to correct position
  let idx = 0
  while (idx < _triggers.length && _triggers[idx].time < clampedOffset - 0.05) idx++
  _nextTriggerIdx = idx
  _firedSet = new Set()

  source.start(0, clampedOffset)
  source.onended = () => {
    if (_isPlaying) {
      _isPlaying = false
      _startOffset = buf.duration
      usePlaybackStore.getState().setIsPlaying(false)
      usePlaybackStore.getState().setCurrentTick(buf.duration)
      if (_schedulerTimer) { clearInterval(_schedulerTimer); _schedulerTimer = null }
      if (_playheadTimer) { clearInterval(_playheadTimer); _playheadTimer = null }
    }
  }
  _sourceNode = source

  // Start scheduler and playhead update loops
  _schedulerTimer = setInterval(schedulerTick, SCHEDULER_INTERVAL_MS)
  _playheadTimer = setInterval(syncPlayhead, PLAYHEAD_INTERVAL_MS)
}

function play() {
  if (!_audioBuffer) return
  if (_isPlaying) return
  startPlayback(_startOffset)
  usePlaybackStore.getState().setIsPlaying(true)
}

function pause() {
  if (!_isPlaying) return
  const pos = getPlayheadSec()
  stopPlayback()
  _startOffset = pos
  usePlaybackStore.getState().setCurrentTick(pos)
  usePlaybackStore.getState().setIsPlaying(false)
}

function stop() {
  stopPlayback()
  _startOffset = 0
  usePlaybackStore.getState().setCurrentTick(0)
  usePlaybackStore.getState().setIsPlaying(false)
}

function seek(timeSec: number) {
  const wasPlaying = _isPlaying
  const clampedTime = Math.max(0, Math.min(timeSec, _audioBuffer?.duration ?? timeSec))

  stopPlayback()
  _startOffset = clampedTime
  usePlaybackStore.getState().setCurrentTick(clampedTime)

  if (wasPlaying) {
    startPlayback(clampedTime)
    usePlaybackStore.getState().setIsPlaying(true)
  }
}

function setTriggers(triggers: Trigger[]) {
  const sorted = [...triggers].sort((a, b) => a.time - b.time)
  _triggers = sorted
  const now = getPlayheadSec()
  let idx = 0
  while (idx < sorted.length && sorted[idx].time < now - 0.05) idx++
  _nextTriggerIdx = idx
  _firedSet = new Set()
}

async function loadAudio(filePath: string, isUserUpload: boolean = false): Promise<boolean> {
  console.log(`[AudioEngine:loadAudio] called with "${filePath}", _loadedPath="${_loadedPath}", hasBuffer=${!!_audioBuffer}, _loadVersion=${_loadVersion}`)

  // Fast path: check LRU cache for a previously decoded buffer
  const cached = cacheGet(filePath)
  if (cached) {
    // IMPORTANT: Bump version to invalidate any in-flight loads from previous switches
    ++_loadVersion
    stopPlayback()
    _startOffset = 0
    _audioBuffer = cached
    _loadedPath = filePath
    const pbCache = usePlaybackStore.getState()
    pbCache.setCurrentTick(0)
    pbCache.setIsPlaying(false)
    pbCache.setDuration(cached.duration)
    pbCache.setAudioMissingPath(null)
    pbCache.setAudioLoadStage('ready')
    pbCache.setAudioLoadProgress(100)
    // Auto-clear the ready banner after 2 s
    setTimeout(() => {
      if (usePlaybackStore.getState().audioLoadStage === 'ready') {
        usePlaybackStore.getState().setAudioLoadStage('idle')
      }
    }, 2000)
    console.log(`[AudioEngine] Cache hit: ${filePath}, duration=${cached.duration}`)
    if (isUserUpload) {
      renameProjectToAudio(filePath)
      autoSaveProject()
    }
    return true
  }

  // Version guard: if another loadAudio call starts before this one finishes,
  // the stale call will bail out after each async boundary.
  const thisVersion = ++_loadVersion

  try {
    stopPlayback()
    _startOffset = 0
    usePlaybackStore.getState().setCurrentTick(0)
    usePlaybackStore.getState().setIsPlaying(false)

    // ── Stage 1: transferring (reading audio data from disk) ──
    usePlaybackStore.getState().setAudioLoadStage('transferring')
    usePlaybackStore.getState().setAudioLoadProgress(5)  // show a sliver immediately

    const ctx = getAudioContext()
    let arrayBuffer: ArrayBuffer

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const electronAPI = (window as any).electronAPI
    if (electronAPI) {
      // v3: Use direct file read via Electron main process (no base64 via Python).
      // This handles MP4/video → WAV conversion automatically via FFmpeg in main.
      if (electronAPI.readAudioFile) {
        const result = await electronAPI.readAudioFile(filePath)
        // Stale check after file read
        if (thisVersion !== _loadVersion) {
          console.log(`[AudioEngine] STALE after readAudioFile: thisVersion=${thisVersion}, _loadVersion=${_loadVersion}, file=${filePath}`)
          usePlaybackStore.getState().setAudioLoadStage('idle')
          return false
        }
        arrayBuffer = result.buffer
        if (result.converted) {
          console.log(`[AudioEngine] Video converted to WAV (original: ${(result.originalSize / 1024 / 1024).toFixed(1)}MB)`)
        }
        usePlaybackStore.getState().setAudioLoadProgress(30)
      } else {
        // Fallback: old base64 path via Python backend (for backward compat)
        const result = await electronAPI.rpcCall('audio.serve', { path: filePath })
        // Stale check after first await
        if (thisVersion !== _loadVersion) {
          console.log(`[AudioEngine] STALE after rpcCall: thisVersion=${thisVersion}, _loadVersion=${_loadVersion}, file=${filePath}`)
          usePlaybackStore.getState().setAudioLoadStage('idle')
          return false
        }
        if (result && result.data) {
          // ── Stage 2: decoding (atob + ArrayBuffer conversion) ──
          usePlaybackStore.getState().setAudioLoadStage('decoding')
          usePlaybackStore.getState().setAudioLoadProgress(10)
          const binaryStr = atob(result.data)
          const bytes = new Uint8Array(binaryStr.length)
          for (let i = 0; i < binaryStr.length; i++) {
            bytes[i] = binaryStr.charCodeAt(i)
          }
          arrayBuffer = bytes.buffer
          usePlaybackStore.getState().setAudioLoadProgress(30)
        } else {
          throw new Error('Backend returned no audio data')
        }
      }
    } else {
      // Browser / dev mode: no backend available without Electron
      throw new Error('Audio loading requires Electron (no backend in browser-only mode)')
    }

    // ── Stage 3: Web Audio decodeAudioData (heaviest step) ──
    usePlaybackStore.getState().setAudioLoadStage('decoding')
    usePlaybackStore.getState().setAudioLoadProgress(40)
    const audioBuffer = await ctx.decodeAudioData(arrayBuffer)
    usePlaybackStore.getState().setAudioLoadProgress(80)

    // Stale check after decode (the heaviest async operation)
    if (thisVersion !== _loadVersion) {
      console.log(`[AudioEngine] STALE after decode: thisVersion=${thisVersion}, _loadVersion=${_loadVersion}, file=${filePath}`)
      // Still cache the decoded buffer even if stale — it may be needed soon
      cachePut(filePath, audioBuffer)
      usePlaybackStore.getState().setAudioLoadStage('idle')
      return false
    }

    _audioBuffer = audioBuffer
    _loadedPath = filePath
    cachePut(filePath, audioBuffer)
    // Audio loaded successfully → clear any prior "file missing" flag
    usePlaybackStore.getState().setAudioMissingPath(null)
    usePlaybackStore.getState().setDuration(audioBuffer.duration)
    usePlaybackStore.getState().setAudioLoadProgress(90)
    console.log(`[AudioEngine] Loaded: ${filePath} (${audioBuffer.duration.toFixed(1)}s, ${audioBuffer.sampleRate}Hz)`)

    // Auto-rename + auto-save only on user upload (not on project switch reload)
    if (isUserUpload) {
      renameProjectToAudio(filePath)
      autoSaveProject()
    }

    // ── Stage 4: BPM analysis ──
    usePlaybackStore.getState().setAudioLoadStage('analyzing')
    await detectBpm(audioBuffer)

    // ── Done ──
    usePlaybackStore.getState().setAudioLoadStage('ready')
    usePlaybackStore.getState().setAudioLoadProgress(100)
    // Auto-clear the ready banner after 2 s so it doesn't linger
    setTimeout(() => {
      if (usePlaybackStore.getState().audioLoadStage === 'ready') {
        usePlaybackStore.getState().setAudioLoadStage('idle')
      }
    }, 2000)

    return true
  } catch (err) {
    console.error('[AudioEngine] loadAudio failed:', err)
    usePlaybackStore.getState().setAudioLoadStage('idle')
    usePlaybackStore.getState().setAudioLoadProgress(0)
    // Distinguish "file moved/deleted on disk" from other failures so the UI
    // can offer a "relocate audio" action instead of silently failing.
    const code = (err as { code?: string } | null)?.code
    if (code === 'not_found') {
      usePlaybackStore.getState().setAudioMissingPath(filePath)
      const fileName = filePath.split('/').pop()?.split('\\').pop() ?? filePath
      toast.error(`音频文件未找到：${fileName}，请重新定位文件`)
    } else {
      toast.error('音频加载失败')
    }
    return false
  }
}

/** Rename the current project to the audio file name (without extension) */
function renameProjectToAudio(filePath: string) {
  const fileName = filePath.split('/').pop()?.split('\\').pop() ?? ''
  const nameWithoutExt = fileName.replace(/\.[^.]+$/, '')
  if (nameWithoutExt) {
    useProjectStore.getState().setProjectName(nameWithoutExt)
  }
}

/** Auto-save project (fire-and-forget, no toast on success) */
async function autoSaveProject() {
  try {
    const store = useProjectStore.getState()
    if (store.isDemo) return // Don't auto-save demo project

    const projectData = storeToBackendUpdate({
      projectName: store.projectName,
      triggers: store.triggers,
      audioFile: store.audioFile,
    })

    if (store.currentProject?.id) {
      const result = await updateProject(String(store.currentProject.id), projectData)
      if (result.project) {
        useProjectStore.setState({
          currentProject: { ...store.currentProject, name: store.projectName, triggers: store.triggers, audioFile: store.audioFile },
        })
        store.markClean()
        console.log('[AudioEngine] Auto-saved project after audio upload')
      }
    } else {
      const result = await createProject(projectData as Parameters<typeof createProject>[0])
      if (result.project) {
        useProjectStore.setState({
          currentProject: {
            id: result.project.id,
            name: result.project.name,
            triggers: store.triggers,
            audioFile: store.audioFile,
          },
        })
        store.markClean()
        console.log('[AudioEngine] Auto-created project after audio upload')
      }
    }
  } catch (err) {
    console.warn('[AudioEngine] Auto-save failed:', err)
  }
}

/** Detect BPM from AudioBuffer using web-audio-beat-detector */
async function detectBpm(buffer: AudioBuffer): Promise<void> {
  try {
    usePlaybackStore.getState().setBpm(0) // reset while detecting
    const { guess } = await import('web-audio-beat-detector')
    const { bpm } = await guess(buffer)
    const rounded = Math.round(bpm)
    usePlaybackStore.getState().setBpm(rounded)
    console.log(`[AudioEngine] BPM detected: ${rounded}`)
  } catch (err) {
    console.warn('[AudioEngine] BPM detection failed:', err)
    usePlaybackStore.getState().setBpm(0)
  }
}

// ─── Store subscriptions (set up once) ────────────────────────────────────────

function setupSubscriptions() {
  if (_subscribed) return
  _subscribed = true

  // Sync triggers from project store
  useProjectStore.subscribe((state) => {
    setTriggers(state.triggers.map(t => ({ ...t, id: String(t.id) })))
  })
  setTriggers(useProjectStore.getState().triggers.map(t => ({ ...t, id: String(t.id) })))

  // Auto-load audio when project audioFile changes, or stop if cleared
  useProjectStore.subscribe((state, prev) => {
    console.log(`[AudioEngine:subscribe] audioFile changed? prev="${prev.audioFile}" → state="${state.audioFile}"`, state.audioFile !== prev.audioFile)
    if (state.audioFile !== prev.audioFile) {
      if (state.audioFile) {
        const isUpload = _nextLoadIsUserUpload
        _nextLoadIsUserUpload = false
        console.log(`[AudioEngine:subscribe] Calling loadAudio("${state.audioFile}", isUpload=${isUpload})`)
        loadAudio(state.audioFile, isUpload)
      } else {
        // Audio cleared (project switch to one without audio, or new project)
        stopPlayback()
        _audioBuffer = null
        _loadedPath = null
        _startOffset = 0
        usePlaybackStore.getState().setCurrentTick(0)
        usePlaybackStore.getState().setDuration(0)
        usePlaybackStore.getState().setIsPlaying(false)
      }
    }
  })

  // Sync engine with playback store's isPlaying state.
  // This ensures that when loadProject() or any external code sets isPlaying=false,
  // the actual audio engine stops its timers and source node.
  usePlaybackStore.subscribe((state, prev) => {
    if (prev.isPlaying && !state.isPlaying && _isPlaying) {
      // Store says "stop" but engine is still running → force stop engine
      stopPlayback()
    }
  })

  // Initial load
  const audioFile = useProjectStore.getState().audioFile
  if (audioFile) loadAudio(audioFile)
}

// ─── Hook (thin wrapper — just sets up subscriptions) ─────────────────────────

export function useAudioEngine() {
  useEffect(() => {
    setupSubscriptions()
  }, [])

  // Cleanup on unmount (only matters if the entire app unmounts)
  useEffect(() => {
    return () => {
      // Don't stop playback on hot-reload; only on true unmount
    }
  }, [])

  return {
    play,
    pause,
    stop,
    seek,
    loadAudio,
    setTriggers,
    getPlayheadSec,
    isPlaying: () => _isPlaying,
    getAudioBuffer: () => _audioBuffer,
    /** Call before setAudioFile() on user upload to trigger auto-rename + auto-save */
    markNextLoadAsUpload: () => { _nextLoadIsUserUpload = true },
  }
}