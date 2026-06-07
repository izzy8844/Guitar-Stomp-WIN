'use client'
import { useRef, useEffect, useCallback, useState } from 'react'
import { ZoomIn, ZoomOut, Upload, Maximize2 } from 'lucide-react'
import { usePlaybackStore } from '@/stores/playbackStore'
import { useProjectStore } from '@/stores/projectStore'
import { getAudioEngine } from '@/hooks/useAudioEngine'
import { formatTime } from '@/lib/format'

interface WaveformProps {
  waveformData?: number[]
  onTriggerDrag?: (triggerId: string, newTimeMs: number) => void
  onAddTrigger?: (timeMs: number) => void
  onUpload?: () => void
}

type CursorMode = 'default' | 'ew-resize' | 'grabbing' | 'crosshair'

/* ── Ruler formatting ──────────────────────────────────────────────────────── */
function formatRulerTime(sec: number) {
  const m = Math.floor(sec / 60)
  const s = Math.floor(sec % 60)
  return m > 0 ? `${m}:${String(s).padStart(2, '0')}` : `${s}s`
}

/* ── Compute peaks from raw waveform data ──────────────────────────────────── */
function computePeaks(data: number[], numBuckets: number): Float32Array {
  const peaks = new Float32Array(numBuckets * 2)
  const step = data.length / numBuckets
  for (let i = 0; i < numBuckets; i++) {
    const start = Math.floor(i * step)
    const end = Math.min(Math.floor((i + 1) * step), data.length)
    let hi = 0, lo = 0
    for (let j = start; j < end; j++) {
      const v = data[j]
      if (v > hi) hi = v
      if (v < lo) lo = v
    }
    peaks[i * 2] = hi
    peaks[i * 2 + 1] = lo
  }
  return peaks
}

export function Waveform({ waveformData, onTriggerDrag, onAddTrigger, onUpload }: WaveformProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const visibleWidthRef = useRef(800)

  // Use refs for high-frequency values to avoid re-renders
  const currentTickRef = useRef(usePlaybackStore.getState().currentTick)
  const isPlayingRef = useRef(usePlaybackStore.getState().isPlaying)

  // Only subscribe to values that change infrequently (no currentTick!)
  const duration = usePlaybackStore((s) => s.duration)
  const zoom = usePlaybackStore((s) => s.zoom)
  const setZoom = usePlaybackStore((s) => s.setZoom)
  const loopA = usePlaybackStore((s) => s.loopA)
  const loopB = usePlaybackStore((s) => s.loopB)
  const setLoopA = usePlaybackStore((s) => s.setLoopA)
  const setLoopB = usePlaybackStore((s) => s.setLoopB)
  const abLoopEnabled = usePlaybackStore((s) => s.abLoopEnabled)
  const setAbLoopEnabled = usePlaybackStore((s) => s.setAbLoopEnabled)
  const bpm = usePlaybackStore((s) => s.bpm)
  const triggers = useProjectStore((s) => s.triggers)
  const [cursorMode, setCursorMode] = useState<CursorMode>('crosshair')
  const [settingLoop, setSettingLoop] = useState<'A' | 'B' | null>(null)
  const isDraggingPlayhead = useRef(false)
  const clickTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const pendingSeekTime = useRef<number>(0)
  const rafRef = useRef<number>(0)

  // Memoized peaks to avoid recomputing on every draw
  const peaksCache = useRef<{ data: number[] | undefined; width: number; peaks: Float32Array | null; amps: Float32Array | null }>({ data: undefined, width: 0, peaks: null, amps: null })

  // zoom=1 means the entire song fits the visible container width
  const getCanvasWidth = useCallback(() => {
    return Math.round(visibleWidthRef.current * zoom)
  }, [zoom])

  // Track container width with ResizeObserver
  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        visibleWidthRef.current = entry.contentRect.width
      }
    })
    ro.observe(el)
    visibleWidthRef.current = el.clientWidth
    return () => ro.disconnect()
  }, [])

  // Subscribe to currentTick/isPlaying via ref (no re-renders)
  useEffect(() => {
    const unsub = usePlaybackStore.subscribe((state) => {
      currentTickRef.current = state.currentTick
      isPlayingRef.current = state.isPlaying
    })
    return unsub
  }, [])

  // Helper: convert mouse X (relative to canvas) to seconds
  const xToTime = useCallback((clientX: number) => {
    const canvas = canvasRef.current
    const scroll = scrollRef.current
    if (!canvas || !scroll || duration === 0) return 0
    const rect = canvas.getBoundingClientRect()
    const x = clientX - rect.left + scroll.scrollLeft
    const canvasW = getCanvasWidth()
    return Math.max(0, Math.min(duration, (x / canvasW) * duration))
  }, [duration, getCanvasWidth])

  // Helper: check if mouse is near playhead
  const isNearPlayhead = useCallback((clientX: number) => {
    if (duration === 0) return false
    const canvas = canvasRef.current
    const scroll = scrollRef.current
    if (!canvas || !scroll) return false
    const rect = canvas.getBoundingClientRect()
    const x = clientX - rect.left + scroll.scrollLeft
    const canvasW = getCanvasWidth()
    const playheadX = (currentTickRef.current / duration) * canvasW
    return Math.abs(x - playheadX) < 6
  }, [duration, getCanvasWidth])

  // Helper: check if mouse is near a trigger marker
  const isNearTrigger = useCallback((clientX: number) => {
    if (duration === 0) return null
    const canvas = canvasRef.current
    const scroll = scrollRef.current
    if (!canvas || !scroll) return null
    const rect = canvas.getBoundingClientRect()
    const x = clientX - rect.left + scroll.scrollLeft
    const canvasW = getCanvasWidth()
    for (const t of triggers) {
      const tx = (t.time / duration) * canvasW
      if (Math.abs(x - tx) < 8) return t
    }
    return null
  }, [duration, triggers, getCanvasWidth])

  /* ── Draw (reads currentTick from ref, not state) ────────────────────────── */
  const draw = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const totalDur = duration || 60
    const w = getCanvasWidth()
    const h = 220
    const currentTick = currentTickRef.current

    // Resize canvas only when dimensions change
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w
      canvas.height = h
      canvas.style.width = `${w}px`
      canvas.style.height = `${h}px`
    }
    ctx.setTransform(1, 0, 0, 1, 0, 0)

    const RULER_H = 26
    const waveH = h - RULER_H

    // ===== Ruler =====
    ctx.fillStyle = '#111111'
    ctx.fillRect(0, 0, w, RULER_H)
    ctx.fillStyle = 'rgba(255,255,255,0.06)'
    ctx.fillRect(0, RULER_H - 1, w, 1)

    // Time labels — adaptive interval with sub-ticks for fine zoom levels
    const secsPerPx = totalDur / w
    const rawInterval = secsPerPx * 100
    const niceIntervals = [0.1, 0.2, 0.5, 1, 2, 5, 10, 15, 30, 60, 120, 300]
    let majorInterval = niceIntervals[niceIntervals.length - 1]
    for (const iv of niceIntervals) { if (iv >= rawInterval) { majorInterval = iv; break } }
    // Sub-tick interval: divide major into 5 parts (or 2 for very small intervals)
    const subDivisions = majorInterval <= 0.5 ? 5 : majorInterval <= 2 ? 5 : 4
    const subInterval = majorInterval / subDivisions
    ctx.font = '9px "SF Mono", "Fira Code", monospace'
    // Draw sub-ticks first (behind major labels)
    for (let t = 0; t <= totalDur; t += subInterval) {
      const x = Math.round((t / totalDur) * w)
      if (x > w - 5) break
      // Skip positions that coincide with major ticks
      const isMajor = Math.abs(t - Math.round(t / majorInterval) * majorInterval) < subInterval * 0.1
      if (!isMajor) {
        ctx.fillStyle = 'rgba(255,255,255,0.08)'
        ctx.fillRect(x, RULER_H - 3, 1, 3)
      }
    }
    // Draw major ticks with time labels
    for (let t = 0; t <= totalDur; t += majorInterval) {
      const x = Math.round((t / totalDur) * w)
      if (x > w - 30) break
      ctx.fillStyle = 'rgba(255,255,255,0.15)'
      ctx.fillRect(x, RULER_H - 5, 1, 5)
      ctx.fillStyle = 'rgba(255,255,255,0.5)'
      // Use millisecond precision for very fine intervals
      const label = majorInterval < 1 ? `${t.toFixed(1)}s` : formatRulerTime(t)
      ctx.fillText(label, x + 3, RULER_H - 9)
    }

    // ===== Waveform background =====
    ctx.fillStyle = '#0d0d0d'
    ctx.fillRect(0, RULER_H, w, waveH)

    // Grid lines (subtle)
    const cy = RULER_H + waveH / 2
    ctx.fillStyle = 'rgba(255,255,255,0.03)'
    ctx.fillRect(0, cy, w, 1)
    ctx.fillRect(0, RULER_H + waveH * 0.25, w, 1)
    ctx.fillRect(0, RULER_H + waveH * 0.75, w, 1)

    // Vertical grid
    for (let t = majorInterval; t < totalDur; t += majorInterval) {
      const x = Math.round((t / totalDur) * w)
      ctx.fillStyle = 'rgba(255,255,255,0.03)'
      ctx.fillRect(x, RULER_H, 1, waveH)
    }

    // ===== AB Loop region =====
    const pb = usePlaybackStore.getState()
    if (pb.loopA != null && pb.loopB != null && duration > 0) {
      const aX = (Math.min(pb.loopA, pb.loopB) / totalDur) * w
      const bX = (Math.max(pb.loopA, pb.loopB) / totalDur) * w
      ctx.fillStyle = 'rgba(59, 130, 246, 0.06)'
      ctx.fillRect(aX, RULER_H, bX - aX, waveH)
      ctx.fillStyle = 'rgba(59, 130, 246, 0.25)'
      ctx.fillRect(aX, RULER_H, 1.5, waveH)
      ctx.fillRect(bX, RULER_H, 1.5, waveH)
    }

    // ===== Waveform bars (Spotify style) — with memoized peaks =====
    if (waveformData && waveformData.length > 0) {
      const BAR_W = 2
      const GAP = 1
      const STEP = BAR_W + GAP
      const barCount = Math.floor(w / STEP)
      const halfH = waveH / 2
      const playX = (currentTick / totalDur) * w

      // Memoize peaks computation — only recompute when data or barCount changes
      const cache = peaksCache.current
      if (cache.data !== waveformData || cache.width !== barCount) {
        const peaks = computePeaks(waveformData, barCount)
        const amps = new Float32Array(barCount)
        for (let b = 0; b < barCount; b++) {
          amps[b] = Math.max(Math.abs(peaks[b * 2]), Math.abs(peaks[b * 2 + 1]))
        }
        for (let pass = 0; pass < 2; pass++) {
          for (let b = 1; b < barCount - 1; b++) {
            amps[b] = (amps[b - 1] + amps[b] * 2 + amps[b + 1]) / 4
          }
        }
        cache.data = waveformData
        cache.width = barCount
        cache.peaks = peaks
        cache.amps = amps
      }

      const amps = cache.amps!

      // Draw bars
      for (let b = 0; b < barCount; b++) {
        const x = b * STEP
        const amp = amps[b]
        const barH = Math.max(1, amp * halfH * 0.88)
        const played = (x + BAR_W / 2) <= playX

        ctx.fillStyle = played ? '#1DB954' : '#383838'
        ctx.fillRect(x, cy - barH, BAR_W, barH * 2)
      }
    } else {
      ctx.font = '12px system-ui, sans-serif'
      ctx.fillStyle = 'rgba(255,255,255,0.3)'
      ctx.textAlign = 'center'
      ctx.fillText('Upload a backing track to see the waveform', w / 2, cy + 4)
      ctx.textAlign = 'left'
    }

    // ===== Loop markers =====
    if (pb.loopA != null) {
      const ax = Math.round((pb.loopA / totalDur) * w)
      ctx.save()
      ctx.strokeStyle = '#3b82f6'; ctx.lineWidth = 1.5; ctx.globalAlpha = 0.8
      ctx.setLineDash([4, 3])
      ctx.beginPath(); ctx.moveTo(ax + 0.5, RULER_H); ctx.lineTo(ax + 0.5, h); ctx.stroke()
      ctx.setLineDash([]); ctx.restore()
      ctx.fillStyle = '#3b82f6'
      ctx.beginPath()
      ctx.moveTo(ax, 0); ctx.lineTo(ax + 14, 0); ctx.lineTo(ax + 14, 12)
      ctx.lineTo(ax + 7, 16); ctx.lineTo(ax, 12); ctx.closePath(); ctx.fill()
      ctx.fillStyle = '#fff'; ctx.font = 'bold 8px monospace'
      ctx.textAlign = 'center'; ctx.fillText('A', ax + 7, 10); ctx.textAlign = 'left'
    }
    if (pb.loopB != null) {
      const bx = Math.round((pb.loopB / totalDur) * w)
      ctx.save()
      ctx.strokeStyle = '#f59e0b'; ctx.lineWidth = 1.5; ctx.globalAlpha = 0.8
      ctx.setLineDash([4, 3])
      ctx.beginPath(); ctx.moveTo(bx + 0.5, RULER_H); ctx.lineTo(bx + 0.5, h); ctx.stroke()
      ctx.setLineDash([]); ctx.restore()
      ctx.fillStyle = '#f59e0b'
      ctx.beginPath()
      ctx.moveTo(bx, 0); ctx.lineTo(bx + 14, 0); ctx.lineTo(bx + 14, 12)
      ctx.lineTo(bx + 7, 16); ctx.lineTo(bx, 12); ctx.closePath(); ctx.fill()
      ctx.fillStyle = '#000'; ctx.font = 'bold 8px monospace'
      ctx.textAlign = 'center'; ctx.fillText('B', bx + 7, 10); ctx.textAlign = 'left'
    }

    // ===== Trigger markers =====
    if (duration > 0) {
      triggers.forEach((t) => {
        const x = Math.round((t.time / totalDur) * w)
        ctx.save()
        ctx.shadowColor = t.color; ctx.shadowBlur = 4
        ctx.strokeStyle = t.color; ctx.lineWidth = 1; ctx.globalAlpha = 0.7
        ctx.beginPath(); ctx.moveTo(x + 0.5, RULER_H); ctx.lineTo(x + 0.5, h); ctx.stroke()
        ctx.restore()
        // Flag
        ctx.fillStyle = t.color
        ctx.beginPath()
        ctx.moveTo(x, 2); ctx.lineTo(x + 11, 2); ctx.lineTo(x + 11, 13)
        ctx.lineTo(x + 5, 17); ctx.lineTo(x, 13); ctx.closePath(); ctx.fill()
        ctx.fillStyle = 'rgba(0,0,0,0.8)'
        ctx.font = 'bold 7px monospace'; ctx.textAlign = 'center'
        ctx.fillText(String(t.pc), x + 5.5, 12)
        ctx.textAlign = 'left'
      })
    }

    // ===== Playhead =====
    if (duration > 0) {
      const px = Math.round((currentTick / totalDur) * w)
      ctx.save()
      ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 1.5; ctx.globalAlpha = 0.9
      ctx.beginPath(); ctx.moveTo(px + 0.5, RULER_H); ctx.lineTo(px + 0.5, h); ctx.stroke()
      ctx.restore()
      ctx.fillStyle = '#ffffff'
      ctx.beginPath()
      ctx.moveTo(px - 6, 0); ctx.lineTo(px + 6, 0)
      ctx.lineTo(px + 6, RULER_H - 7); ctx.lineTo(px, RULER_H - 1)
      ctx.lineTo(px - 6, RULER_H - 7); ctx.closePath(); ctx.fill()
      ctx.fillStyle = '#111'; ctx.font = 'bold 7px monospace'; ctx.textAlign = 'center'
      ctx.fillText(formatTime(currentTick).slice(0, 5), px, RULER_H - 9)
      ctx.textAlign = 'left'
    }
  }, [waveformData, duration, triggers, zoom, getCanvasWidth])

  // Single rAF loop — always running when playing, draws without causing React re-renders
  useEffect(() => {
    let running = true
    const loop = () => {
      if (!running) return
      draw()
      // Auto-scroll: keep playhead in visible area during playback
      if (isPlayingRef.current && scrollRef.current) {
        const scroll = scrollRef.current
        const canvasW = getCanvasWidth()
        const playX = (currentTickRef.current / (duration || 1)) * canvasW
        const viewW = scroll.clientWidth
        const scrollLeft = scroll.scrollLeft
        const margin = viewW * 0.3
        if (playX < scrollLeft + margin) {
          scroll.scrollLeft = Math.max(0, playX - margin)
        } else if (playX > scrollLeft + viewW - margin) {
          scroll.scrollLeft = playX - viewW + margin
        }
      }
      rafRef.current = requestAnimationFrame(loop)
    }
    rafRef.current = requestAnimationFrame(loop)
    return () => { running = false; cancelAnimationFrame(rafRef.current) }
  }, [draw, getCanvasWidth, duration])

  // Wheel zoom — centered on mouse position
  const handleWheel = useCallback((e: React.WheelEvent) => {
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault()
      const scroll = scrollRef.current
      if (!scroll) return
      const rect = scroll.getBoundingClientRect()
      const mouseX = e.clientX - rect.left
      const oldScroll = scroll.scrollLeft
      const oldWidth = getCanvasWidth()
      const mouseRatio = (oldScroll + mouseX) / oldWidth

      const newZoom = Math.max(1, Math.min(20, e.deltaY < 0 ? zoom * 1.2 : zoom / 1.2))
      setZoom(newZoom)

      requestAnimationFrame(() => {
        const newWidth = Math.round(visibleWidthRef.current * newZoom)
        scroll.scrollLeft = mouseRatio * newWidth - mouseX
      })
    }
  }, [zoom, setZoom, getCanvasWidth])

  // Mouse move for cursor feedback
  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (isDraggingPlayhead.current) return
    if (isNearPlayhead(e.clientX)) {
      setCursorMode('ew-resize')
    } else if (isNearTrigger(e.clientX)) {
      setCursorMode('ew-resize')
    } else {
      setCursorMode('crosshair')
    }
  }, [isNearPlayhead, isNearTrigger])

  // Right-click: set AB loop points
  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    if (duration === 0) return
    const t = xToTime(e.clientX)
    const pb = usePlaybackStore.getState()
    if (pb.loopA === null) {
      setLoopA(t)
    } else if (pb.loopB === null) {
      setLoopB(t)
      setAbLoopEnabled(true)
    } else {
      setLoopA(null); setLoopB(null); setAbLoopEnabled(false)
    }
  }, [duration, xToTime, setLoopA, setLoopB, setAbLoopEnabled])

  // Click-to-seek + Playhead drag + Trigger drag + AB Loop set mode
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.button !== 0 || duration === 0) return

    // AB Loop set mode intercept
    if (settingLoop) {
      const t = xToTime(e.clientX)
      if (settingLoop === 'A') {
        setLoopA(t); setSettingLoop('B')
      } else {
        setLoopB(t); setSettingLoop(null); setAbLoopEnabled(true)
      }
      return
    }

    // Priority 1: Playhead drag
    if (isNearPlayhead(e.clientX)) {
      isDraggingPlayhead.current = true
      setCursorMode('grabbing')
      const onMove = (me: MouseEvent) => {
        const t = xToTime(me.clientX)
        usePlaybackStore.getState().setCurrentTick(t)
        getAudioEngine()?.seek(t)
      }
      const onUp = () => {
        isDraggingPlayhead.current = false
        setCursorMode('crosshair')
        document.removeEventListener('mousemove', onMove)
        document.removeEventListener('mouseup', onUp)
      }
      document.addEventListener('mousemove', onMove)
      document.addEventListener('mouseup', onUp)
      return
    }

    // Priority 2: Trigger drag
    const nearTrigger = isNearTrigger(e.clientX)
    if (nearTrigger && onTriggerDrag) {
      setCursorMode('grabbing')
      const onMove = (me: MouseEvent) => {
        const t = xToTime(me.clientX)
        onTriggerDrag(String(nearTrigger.id), t * 1000)
      }
      const onUp = () => {
        setCursorMode('crosshair')
        document.removeEventListener('mousemove', onMove)
        document.removeEventListener('mouseup', onUp)
      }
      document.addEventListener('mousemove', onMove)
      document.addEventListener('mouseup', onUp)
      return
    }

    // Priority 3: Click-to-seek (delayed to distinguish from double-click)
    const t = xToTime(e.clientX)
    if (clickTimer.current) {
      clearTimeout(clickTimer.current)
      clickTimer.current = null
    }
    pendingSeekTime.current = t
    clickTimer.current = setTimeout(() => {
      clickTimer.current = null
      usePlaybackStore.getState().setCurrentTick(pendingSeekTime.current)
      getAudioEngine()?.seek(pendingSeekTime.current)
    }, 250)
  }, [duration, isNearPlayhead, isNearTrigger, onTriggerDrag, onAddTrigger, xToTime, settingLoop, setLoopA, setLoopB, setAbLoopEnabled])

  // Double-click to add trigger — cancel pending seek first
  const handleDoubleClick = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    if (clickTimer.current) {
      clearTimeout(clickTimer.current)
      clickTimer.current = null
    }
    if (!onAddTrigger || duration === 0) return
    const t = xToTime(e.clientX)
    onAddTrigger(t * 1000)
  }, [onAddTrigger, duration, xToTime])

  /* ── Zoom controls ───────────────────────────────────────────────────────── */
  const zoomIn = useCallback(() => setZoom((z: number) => Math.min(z * 1.5, 20)), [setZoom])
  const zoomOut = useCallback(() => setZoom((z: number) => Math.max(z / 1.5, 1)), [setZoom])
  const zoomFit = useCallback(() => { setZoom(1); if (scrollRef.current) scrollRef.current.scrollLeft = 0 }, [setZoom])

  const handleZoomSlider = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseFloat(e.target.value)
    const newZoom = Math.pow(20, val)
    setZoom(newZoom)
  }, [setZoom])

  // Convert current zoom to slider position (inverse log)
  const zoomSliderValue = Math.log(zoom) / Math.log(20)

  const cursorClass = cursorMode === 'ew-resize' ? 'cursor-ew-resize' :
    cursorMode === 'grabbing' ? 'cursor-grabbing' : 'cursor-crosshair'

  const hasLoop = loopA !== null || loopB !== null

  return (
    <div className="flex flex-col rounded-lg border border-zinc-800/60 overflow-hidden bg-[#0d0d0d]">
      {/* Toolbar */}
      <div className="flex items-center gap-2 px-3 py-1.5 bg-[#111] border-b border-zinc-800/50 text-xs">
        <span className="text-zinc-500 text-[11px]">Timeline</span>
        <div className="flex-1" />
        {/* BPM Display */}
        <span
          className="font-mono text-[10px] tabular-nums px-1.5 py-0.5 rounded bg-zinc-800 border border-zinc-700/60 text-zinc-400 min-w-[52px] text-center select-none"
          title="Detected BPM"
        >
          BPM={bpm || 0}
        </span>
        {/* AB Loop controls */}
        <button
          onClick={() => setSettingLoop(settingLoop ? null : 'A')}
          className={`px-2 py-0.5 rounded text-[10px] font-mono border transition-colors ${settingLoop ? 'bg-blue-500/90 text-white border-blue-500' : 'text-zinc-400 border-zinc-700/60 hover:border-zinc-500'}`}
        >
          {settingLoop ? `Click ${settingLoop}` : 'AB Loop'}
        </button>
        {hasLoop && (
          <button
            onClick={() => { setLoopA(null); setLoopB(null); setAbLoopEnabled(false); setSettingLoop(null) }}
            className="px-2 py-0.5 rounded text-[10px] font-mono text-zinc-400 border border-zinc-700/60 hover:border-red-500 hover:text-red-400"
          >
            Clear
          </button>
        )}
        {/* Zoom controls with draggable slider */}
        <div className="flex items-center gap-1.5 ml-2 border-l border-zinc-800/50 pl-2">
          <button onClick={zoomOut} className="p-0.5 rounded text-zinc-500 hover:text-white hover:bg-zinc-800" title="Zoom out">
            <ZoomOut size={12} />
          </button>
          <input
            type="range"
            min="0"
            max="1"
            step="0.01"
            value={zoomSliderValue}
            onChange={handleZoomSlider}
            className="w-20 h-1 appearance-none rounded-full bg-zinc-700 cursor-pointer accent-zinc-400
                       [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-2.5 [&::-webkit-slider-thumb]:h-2.5
                       [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-zinc-300 [&::-webkit-slider-thumb]:shadow-sm
                       [&::-webkit-slider-thumb]:hover:bg-white [&::-webkit-slider-thumb]:cursor-grab [&::-webkit-slider-thumb]:active:cursor-grabbing"
            title={`Zoom: ${Math.round(zoom * 100)}%`}
          />
          <button onClick={zoomIn} className="p-0.5 rounded text-zinc-500 hover:text-white hover:bg-zinc-800" title="Zoom in">
            <ZoomIn size={12} />
          </button>
          <button onClick={zoomFit} className="p-0.5 rounded text-zinc-500 hover:text-white hover:bg-zinc-800 ml-0.5" title="Fit to screen">
            <Maximize2 size={11} />
          </button>
          <span className="text-[9px] font-mono text-zinc-600 w-8 text-right">
            {zoom === 1 ? 'Fit' : `${Math.round(zoom * 100)}%`}
          </span>
        </div>
        {onUpload && (
          <button onClick={onUpload} className="flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-mono text-zinc-400 border border-zinc-700/60 hover:border-zinc-500 hover:text-white ml-1.5">
            <Upload size={10} /> Upload Backing Track
          </button>
        )}
      </div>

      {/* Waveform canvas — scrollable container */}
      <div
        ref={scrollRef}
        className={`overflow-x-auto overflow-y-hidden ${cursorClass}`}
        style={{
          scrollbarWidth: 'thin',
          scrollbarColor: '#444 transparent',
        }}
        onWheel={handleWheel}
      >
        <div ref={containerRef} style={{ width: getCanvasWidth(), minWidth: '100%' }}>
          <canvas
            ref={canvasRef}
            style={{ height: 220, display: 'block' }}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onDoubleClick={handleDoubleClick}
            onContextMenu={handleContextMenu}
          />
        </div>
      </div>

    </div>
  )
}