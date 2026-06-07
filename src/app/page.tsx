'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import Link from 'next/link'
import { Save, Settings, BookOpen, Pencil, Upload, Menu, Loader2, AlertTriangle } from 'lucide-react'
import { usePlaybackStore, hydratePlaybackStore } from '@/stores/playbackStore'
import { useProjectStore, hydrateProjectStore } from '@/stores/projectStore'
import { useWebSocket } from '@/hooks/useWebSocket'
import { useAudioEngine, getAudioBuffer } from '@/hooks/useAudioEngine'
import { Transport } from '@/components/Transport'
import { Waveform } from '@/components/Waveform'
import { ToneSegments } from '@/components/ToneSegments'
import { TriggerList } from '@/components/TriggerList'
import { ProjectSidebar } from '@/components/ProjectSidebar'
import { StatusBar } from '@/components/StatusBar'
import { ToneMappingSelector } from '@/components/ToneMappingSelector'
import { DeviceSelector } from '@/components/DeviceSelector'
import ToneAddDialog from '@/components/ToneAddDialog'
import ExportButton from '@/components/ExportButton'
import { toast } from '@/components/Toast'

import { initAutoSetup, fetchWaveform, uploadAudio, updateProject, createProject } from '@/lib/api'
import { useMapperStore } from '@/stores/mapperStore'
import { useUndoStore } from '@/stores/undoStore'

/** Extract peaks from an AudioBuffer for waveform display */
function extractPeaksFromBuffer(buffer: AudioBuffer, numPeaks: number): number[] {
  const channelData = buffer.getChannelData(0)
  const samplesPerPeak = Math.floor(channelData.length / numPeaks)
  const peaks: number[] = new Array(numPeaks)
  for (let i = 0; i < numPeaks; i++) {
    let max = 0
    const start = i * samplesPerPeak
    const end = Math.min(start + samplesPerPeak, channelData.length)
    for (let j = start; j < end; j++) {
      const abs = Math.abs(channelData[j])
      if (abs > max) max = abs
    }
    peaks[i] = max
  }
  return peaks
}

export default function Home() {
  const projectName = useProjectStore((s) => s.projectName)
  useWebSocket() // Initializes MIDI ports & backend connection via stdio
  const engine = useAudioEngine()
  const fileInputRef = useRef<HTMLInputElement>(null)

  const triggers = useProjectStore((s) => s.triggers)
  const sidebarOpen = useProjectStore((s) => s.sidebarOpen)
  const setSidebarOpen = useProjectStore((s) => s.setSidebarOpen)

  const [isEditingName, setIsEditingName] = useState(false)
  const [editName, setEditName] = useState(projectName)
  const [addDialogOpen, setAddDialogOpen] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [unsavedDialogOpen, setUnsavedDialogOpen] = useState(false)
  const [pendingAction, setPendingAction] = useState<(() => void) | null>(null)
  const isDirty = useProjectStore((s) => s.isDirty)

  // Sync editName when projectName changes externally (hydration, project switch)
  useEffect(() => { if (!isEditingName) setEditName(projectName) }, [projectName, isEditingName])
  const [addDialogTime, setAddDialogTime] = useState(0)
  const [waveformData, setWaveformData] = useState<number[] | undefined>(undefined)

  // Hydrate stores and init project (synchronous — no race condition)
  useEffect(() => {
    hydrateProjectStore()
    hydratePlaybackStore()
    if (!useProjectStore.getState().currentProject && !useProjectStore.getState().isDemo) {
      useProjectStore.getState().newProject()
    }
  }, [])

  // Undo/Redo keyboard shortcuts (Cmd/Ctrl+Z and Cmd/Ctrl+Shift+Z)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey
      if (!mod || e.key.toLowerCase() !== 'z') return
      // Don't interfere with input fields
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return
      e.preventDefault()
      if (e.shiftKey) {
        useUndoStore.getState().redo()
      } else {
        useUndoStore.getState().undo()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  // Auto-setup on first launch: detect plugin, auto-map user presets
  useEffect(() => {
    const mapper = useMapperStore.getState()
    // Skip if already initialized or already has a plugin selected
    if (mapper.autoSetupDone || mapper.selectedPlugin) return

    let cancelled = false
    mapper.setInitStatus('loading')
    initAutoSetup()
      .then((result) => {
        if (cancelled) return
        const m = useMapperStore.getState()
        m.setAutoSetupDone(true)
        m.setInitStatus(result.status as typeof result.status)

        if (result.plugin) {
          m.setSelectedPlugin(result.plugin)
        }
        if (result.mapping_file) {
          m.setActiveMappingFile(result.mapping_file)
        }
        if (result.user_presets && result.user_presets.length > 0) {
          m.setUserPresets(result.user_presets)
          // Also set as active mapping tones for the ToneAddDialog
          m.setActiveMappingTones(result.user_presets.map(p => ({ name: p.name, pc: p.pc, uid: p.uid })))
        }

        if (result.status === 'auto_mapped') {
          toast.success(`Auto-mapped ${result.user_presets.length} user presets for ${result.plugin}`)
        }

        // Signal ToneMappingSelector to load the file list (tones are already set, won't be overwritten)
        m.bumpMappingVersion()
      })
      .catch(() => {
        if (cancelled) return
        useMapperStore.getState().setInitStatus('error')
        useMapperStore.getState().setAutoSetupDone(true)
      })
    return () => { cancelled = true }
  }, [])

  // Generate waveform from AudioBuffer when audio is decoded (duration changes)
  const audioFile = useProjectStore((s) => s.audioFile)
  const duration = usePlaybackStore((s) => s.duration)
  const audioMissingPath = usePlaybackStore((s) => s.audioMissingPath)
  useEffect(() => {
    if (!audioFile || duration === 0) { setWaveformData(undefined); return }
    // Try to get peaks from the decoded AudioBuffer (client-side, no backend dependency)
    const buf = getAudioBuffer()
    if (buf) {
      const peaks = extractPeaksFromBuffer(buf, 800)
      setWaveformData(peaks)
      return
    }
    // Fallback: try fetching from backend API for any loaded audio file
    if (audioFile) {
      fetchWaveform(audioFile, 800)
        .then(d => { if (d?.peaks) setWaveformData(d.peaks) })
        .catch(() => {})
    }
  }, [audioFile, duration])

  const handleSave = useCallback(async () => {
    const store = useProjectStore.getState()
    if (store.isDemo) {
      toast.info('Demo project cannot be saved. Create a new project first.')
      return
    }
    setSaving(true)
    try {
      const projectData = {
        name: store.projectName,
        triggers: store.triggers.map(t => ({
          id: String(t.id),
          time: t.time,
          tone_name: t.name,
          program: t.pc,
          color: t.color,
        })),
        audio_path: store.audioFile || undefined,
      }

      if (store.currentProject?.id) {
        // Update existing project
        const result = await updateProject(String(store.currentProject.id), projectData)
        if (result.project) {
          // Update the currentProject reference with latest data
          useProjectStore.setState({
            currentProject: { ...store.currentProject, name: store.projectName, triggers: store.triggers, audioFile: store.audioFile },
          })
          store.markClean()
          toast.success('Project saved')
        }
      } else {
        // Create new project
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
          toast.success('Project created')
        }
      }
    } catch (err) {
      toast.error(`Save failed: ${err instanceof Error ? err.message : 'Unknown error'}`)
    } finally {
      setSaving(false)
    }
  }, [])

  /** Guard navigation with unsaved-changes prompt */
  const guardUnsaved = useCallback((action: () => void) => {
    if (useProjectStore.getState().isDirty) {
      setPendingAction(() => action)
      setUnsavedDialogOpen(true)
    } else {
      action()
    }
  }, [])

  // Warn on browser/window close if there are unsaved changes
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (useProjectStore.getState().isDirty) {
        e.preventDefault()
      }
    }
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [])

  const handleUnsavedSave = useCallback(async () => {
    await handleSave()
    setUnsavedDialogOpen(false)
    if (pendingAction) { pendingAction(); setPendingAction(null) }
  }, [handleSave, pendingAction])

  const handleUnsavedDiscard = useCallback(() => {
    setUnsavedDialogOpen(false)
    useProjectStore.getState().markClean()
    if (pendingAction) { pendingAction(); setPendingAction(null) }
  }, [pendingAction])

  const handleUnsavedCancel = useCallback(() => {
    setUnsavedDialogOpen(false)
    setPendingAction(null)
  }, [])

  const setProjectName = (name: string) => {
    useProjectStore.getState().setProjectName(name)
  }

  const handleAddTrigger = useCallback((timeSec: number) => {
    setAddDialogTime(timeSec)
    setAddDialogOpen(true)
  }, [])

  const handleTriggerDrag = useCallback((triggerId: string, newTimeMs: number) => {
    useProjectStore.getState().updateTrigger(Number(triggerId), { time: newTimeMs / 1000 })
  }, [])

  const handleUpload = () => fileInputRef.current?.click()

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    // Stop playback before uploading new audio to avoid desync
    if (usePlaybackStore.getState().isPlaying) {
      engine.stop()
    }

    // Validate file size (max 100MB)
    const MAX_SIZE = 100 * 1024 * 1024
    if (file.size > MAX_SIZE) {
      toast.error('File too large. Maximum size is 100 MB.')
      e.target.value = ''
      return
    }

    // Validate file type
    const ALLOWED_EXT = /\.(mp3|wav|flac|ogg|m4a|aac|wma|mp4)$/i
    if (!ALLOWED_EXT.test(file.name)) {
      toast.error('Unsupported format. Use MP3, WAV, FLAC, OGG, M4A, AAC, WMA, or MP4.')
      e.target.value = ''
      return
    }

    setUploading(true)
    try {
      const data = await uploadAudio(file)
      if (data.path) {
        engine.markNextLoadAsUpload()
        useProjectStore.getState().setAudioFile(data.path)
        // useAudioEngine auto-loads when audioFile changes (via store subscription)
        // But we also set duration from upload response for immediate UI feedback
        if (data.duration_sec) usePlaybackStore.getState().setDuration(data.duration_sec)
      }
    } catch {
      // Fallback: decode locally and extract waveform client-side
      let audioCtx: AudioContext | null = null
      try {
        audioCtx = new AudioContext()
        if (audioCtx.state === 'suspended') await audioCtx.resume()
        const arrayBuffer = await file.arrayBuffer()
        const audioBuffer = await audioCtx.decodeAudioData(arrayBuffer)
        engine.markNextLoadAsUpload()
        useProjectStore.getState().setAudioFile(file.name)
        usePlaybackStore.getState().setDuration(audioBuffer.duration)
        // Generate waveform peaks directly from decoded audio buffer
        const peaks = extractPeaksFromBuffer(audioBuffer, 800)
        setWaveformData(peaks)
      } catch {
        toast.error('Failed to load audio file')
      } finally {
        audioCtx?.close()
      }
    } finally {
      setUploading(false)
    }
    e.target.value = ''
  }

  const SyncIcon = Save

  return (
    <div className="flex h-screen flex-col bg-[#0a0a0a]">
      {/* Header */}
      <header className="flex items-center justify-between pl-20 pr-6 py-3 border-b border-zinc-800 bg-zinc-950/50 backdrop-blur-sm shrink-0">
        <div className="flex items-center gap-3">
          <button onClick={() => setSidebarOpen(!sidebarOpen)} className="p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800" title="Toggle sidebar">
            <Menu className="w-4 h-4" />
          </button>
          {isEditingName ? (
            <input type="text" value={editName} onChange={e => setEditName(e.target.value)}
              onBlur={() => { setProjectName(editName || 'Untitled Project'); setIsEditingName(false) }}
              onKeyDown={e => { if (e.key === 'Enter') { setProjectName(editName || 'Untitled Project'); setIsEditingName(false) } if (e.key === 'Escape') setIsEditingName(false) }}
              className="bg-zinc-800 border border-zinc-700 rounded-lg px-2 py-1 text-sm text-white focus:outline-none focus:border-green-500" autoFocus />
          ) : (
            <button onClick={() => { setEditName(projectName); setIsEditingName(true) }} className="flex items-center gap-2 group">
              <h1 className="text-lg font-semibold text-white truncate max-w-[300px]">{projectName}</h1>
              <Pencil className="w-3.5 h-3.5 text-zinc-700 group-hover:text-zinc-400 transition-colors shrink-0" />
            </button>
          )}
        </div>

        <div className="flex items-center gap-3">
          <input ref={fileInputRef} type="file" accept=".mp3,.wav,.flac,.ogg,.m4a,.aac,.wma,.mp4" className="hidden" onChange={handleFileChange} />
          <button onClick={handleUpload} disabled={uploading} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs text-zinc-400 hover:text-white hover:bg-zinc-800 disabled:opacity-50 disabled:cursor-not-allowed" title="Upload audio" aria-label="Upload audio file">
            {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
            <span>{uploading ? 'Uploading...' : 'Upload Backing Track'}</span>
          </button>
          <DeviceSelector />
          <ToneMappingSelector />
          <button onClick={handleSave} disabled={saving} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs transition-colors ${isDirty ? 'border-green-600 text-green-400 hover:border-green-400' : 'border-zinc-700 text-zinc-400 hover:text-green-400 hover:border-green-500'} disabled:opacity-50`}>
            {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <SyncIcon className="w-3.5 h-3.5" />}
          </button>
          <ExportButton />
          <Link href="/guide" className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-zinc-400 hover:text-zinc-200 text-xs"><BookOpen className="w-3.5 h-3.5" />Guide</Link>
          <Link href="/settings" className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-zinc-400 hover:text-zinc-200 text-xs"><Settings className="w-3.5 h-3.5" />Tones</Link>
        </div>
      </header>

      {/* Body */}
      <div className="flex flex-1 overflow-hidden">
        {sidebarOpen && <ProjectSidebar />}
        <main className="flex-1 flex flex-col overflow-hidden">
          <div className="flex-1 flex flex-col px-6 py-4 overflow-y-auto gap-4">
            {audioMissingPath && (
              <div className="flex items-center justify-between gap-3 px-4 py-2.5 rounded-lg border border-amber-500/40 bg-amber-500/10">
                <div className="flex items-center gap-2 min-w-0">
                  <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
                  <span className="text-xs text-amber-200 truncate">
                    音频文件丢失：{audioMissingPath.split('/').pop()?.split('\\').pop()}（可能被移动或删除）
                  </span>
                </div>
                <button
                  onClick={handleUpload}
                  disabled={uploading}
                  className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs text-amber-100 bg-amber-600/80 hover:bg-amber-600 disabled:opacity-50"
                >
                  {uploading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
                  重新定位
                </button>
              </div>
            )}
            <Waveform waveformData={waveformData} onTriggerDrag={handleTriggerDrag} onAddTrigger={(timeMs) => handleAddTrigger(timeMs / 1000)} />
            <ToneSegments onTriggerDrag={handleTriggerDrag} />
            <div className="flex items-center justify-between px-4 py-2 border-b border-zinc-800">
              <span className="text-xs text-zinc-500 uppercase tracking-wide">Triggers</span>
              <button onClick={() => handleAddTrigger(usePlaybackStore.getState().currentTick)}
                className="w-6 h-6 flex items-center justify-center rounded-full bg-green-600 hover:bg-green-500 text-white text-sm">+</button>
            </div>
            <TriggerList />
          </div>
          <Transport />
        </main>
      </div>
      <StatusBar />
      <ToneAddDialog open={addDialogOpen} onClose={() => setAddDialogOpen(false)} time={addDialogTime} />

      {/* Unsaved Changes Dialog */}
      {unsavedDialogOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-zinc-900 border border-zinc-700 rounded-xl p-6 w-[380px] shadow-2xl">
            <h3 className="text-white text-base font-semibold mb-2">Unsaved Changes</h3>
            <p className="text-zinc-400 text-sm mb-6">
              You have unsaved changes in &ldquo;{projectName}&rdquo;. Would you like to save before continuing?
            </p>
            <div className="flex justify-end gap-2">
              <button onClick={handleUnsavedCancel} className="px-3 py-1.5 rounded-lg text-xs text-zinc-400 hover:text-white hover:bg-zinc-800">
                Cancel
              </button>
              <button onClick={handleUnsavedDiscard} className="px-3 py-1.5 rounded-lg text-xs text-red-400 hover:text-red-300 hover:bg-red-500/10 border border-red-500/30">
                Don&apos;t Save
              </button>
              <button onClick={handleUnsavedSave} className="px-3 py-1.5 rounded-lg text-xs text-white bg-green-600 hover:bg-green-500">
                Save
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
