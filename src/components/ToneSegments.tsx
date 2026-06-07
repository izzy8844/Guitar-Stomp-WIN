'use client'
import { useRef, useEffect, useCallback, useState } from 'react'
import { usePlaybackStore } from '@/stores/playbackStore'
import { useProjectStore, TRIGGER_COLORS } from '@/stores/projectStore'

const SEG_H = 28

function hexToRgba(hex: string, alpha: number) {
  const h = hex.replace('#', '')
  const r = parseInt(h.substring(0, 2), 16)
  const g = parseInt(h.substring(2, 4), 16)
  const b = parseInt(h.substring(4, 6), 16)
  return `rgba(${r},${g},${b},${alpha})`
}

interface ToneSegmentsProps {
  onTriggerDrag?: (triggerId: string, newTimeMs: number) => void
}

export function ToneSegments({ onTriggerDrag }: ToneSegmentsProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const visibleWidthRef = useRef(800)
  const [visibleWidth, setVisibleWidth] = useState(800)
  const duration = usePlaybackStore((s) => s.duration)
  const zoom = usePlaybackStore((s) => s.zoom)
  const triggers = useProjectStore((s) => s.triggers)
  const updateTrigger = useProjectStore((s) => s.updateTrigger)
  const dragRef = useRef<{ triggerId: number; startX: number } | null>(null)
  const [cursorStyle, setCursorStyle] = useState<'default' | 'ew-resize' | 'grabbing'>('default')
  const rafRef = useRef<number>(0)
  const currentTickRef = useRef(usePlaybackStore.getState().currentTick)

  // Use same width calculation as Waveform: visibleWidth * zoom
  const getCanvasWidth = useCallback(() => {
    return Math.round(visibleWidthRef.current * zoom)
  }, [zoom, visibleWidth])

  // Track container width with ResizeObserver
  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const w = entry.contentRect.width
        visibleWidthRef.current = w
        setVisibleWidth(w)
      }
    })
    ro.observe(el)
    visibleWidthRef.current = el.clientWidth
    setVisibleWidth(el.clientWidth)
    return () => ro.disconnect()
  }, [])

  // Subscribe to currentTick via ref (no re-renders)
  useEffect(() => {
    const unsub = usePlaybackStore.subscribe((state) => {
      currentTickRef.current = state.currentTick
    })
    return unsub
  }, [])

  // Sync scroll position from Waveform's broadcast event
  useEffect(() => {
    const handler = (e: Event) => {
      const scrollLeft = (e as CustomEvent).detail as number
      if (scrollRef.current) {
        scrollRef.current.scrollLeft = scrollLeft
      }
    }
    window.addEventListener('timeline-scroll', handler)
    return () => window.removeEventListener('timeline-scroll', handler)
  }, [])

  // Hit-test: find trigger near mouse X (within 8px of left edge)
  const findTriggerAtX = useCallback((clientX: number) => {
    const canvas = canvasRef.current
    if (!canvas || !duration) return null
    const rect = canvas.getBoundingClientRect()
    const x = clientX - rect.left + (scrollRef.current?.scrollLeft || 0)
    const totalW = getCanvasWidth()
    const sorted = [...triggers].sort((a, b) => a.time - b.time)
    for (const tr of sorted) {
      const tx = (tr.time / duration) * totalW
      if (Math.abs(x - tx) <= 8) return tr
    }
    return null
  }, [duration, triggers, getCanvasWidth])

  // Convert clientX to time
  const xToTime = useCallback((clientX: number) => {
    const canvas = canvasRef.current
    if (!canvas || !duration) return 0
    const rect = canvas.getBoundingClientRect()
    const x = clientX - rect.left + (scrollRef.current?.scrollLeft || 0)
    const totalW = getCanvasWidth()
    return Math.max(0, Math.min(duration, (x / totalW) * duration))
  }, [duration, getCanvasWidth])

  const draw = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const totalDur = duration || 60
    const W = getCanvasWidth()
    const currentTick = currentTickRef.current
    if (canvas.width !== W || canvas.height !== SEG_H) {
      canvas.width = W
      canvas.height = SEG_H
      canvas.style.width = `${W}px`
      canvas.style.height = `${SEG_H}px`
    }
    ctx.setTransform(1, 0, 0, 1, 0, 0)

    // Background
    ctx.fillStyle = '#111'
    ctx.fillRect(0, 0, W, SEG_H)
    ctx.fillStyle = 'rgba(255,255,255,0.06)'
    ctx.fillRect(0, 0, W, 1)

    if (!triggers || triggers.length === 0) {
      ctx.font = '10px "SF Mono", "Fira Code", "Consolas", monospace'
      ctx.fillStyle = 'rgba(255,255,255,0.7)'
      ctx.textAlign = 'center'
      ctx.fillText('Double-click timeline to add Tone Preset', W / 2, SEG_H / 2 + 4)
      ctx.textAlign = 'left'
      return
    }

    const sorted = [...triggers].sort((a, b) => a.time - b.time)
    const segments = sorted.map((tr, i) => ({
      tr,
      start: tr.time,
      end: i + 1 < sorted.length ? sorted[i + 1].time : totalDur,
    }))

    // Draw gap before first trigger
    if (sorted[0].time > 0) {
      const x1 = Math.round((sorted[0].time / totalDur) * W)
      ctx.fillStyle = 'rgba(255,255,255,0.04)'
      ctx.fillRect(0, 1, x1, SEG_H - 1)
      ctx.strokeStyle = 'rgba(255,255,255,0.1)'
      ctx.lineWidth = 1
      ctx.setLineDash([3, 3])
      ctx.beginPath(); ctx.moveTo(x1, 1); ctx.lineTo(x1, SEG_H); ctx.stroke()
      ctx.setLineDash([])
    }

    // Draw segments
    segments.forEach(({ tr, start, end }) => {
      const x0 = Math.round((start / totalDur) * W)
      const x1 = Math.round((end / totalDur) * W)
      const segW = x1 - x0
      if (segW <= 0) return

      ctx.fillStyle = hexToRgba(tr.color, 0.28)
      ctx.fillRect(x0, 1, segW, SEG_H - 1)
      ctx.fillStyle = tr.color
      ctx.fillRect(x0, 1, 2, SEG_H - 1)
      ctx.fillStyle = 'rgba(0,0,0,0.3)'
      ctx.fillRect(x1 - 1, 1, 1, SEG_H - 1)

      const label = tr.name || `PC${tr.pc}`
      const PAD = 6
      const maxW = segW - PAD * 2
      if (maxW > 8) {
        ctx.save()
        ctx.beginPath(); ctx.rect(x0 + 2, 0, segW - 2, SEG_H); ctx.clip()
        ctx.font = '10px "SF Mono", "Fira Code", "Consolas", monospace'
        ctx.fillStyle = 'rgba(255,255,255,0.9)'
        ctx.textBaseline = 'middle'
        ctx.fillText(label, x0 + PAD, SEG_H / 2 + 1)
        ctx.restore()
      }
    })

    // Playhead on segments
    if (duration > 0) {
      const px = (currentTick / totalDur) * W
      ctx.fillStyle = 'rgba(255,255,255,0.9)'
      ctx.fillRect(Math.round(px) - 0.5, 0, 1, SEG_H)
    }
  }, [duration, triggers, getCanvasWidth])

  // Single rAF loop — no React re-renders for animation
  useEffect(() => {
    let running = true
    const loop = () => {
      if (!running) return
      draw()
      rafRef.current = requestAnimationFrame(loop)
    }
    rafRef.current = requestAnimationFrame(loop)
    return () => { running = false; cancelAnimationFrame(rafRef.current) }
  }, [draw])

  // Mouse move — cursor feedback
  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (dragRef.current) return
    const nearTrigger = findTriggerAtX(e.clientX)
    setCursorStyle(nearTrigger ? 'ew-resize' : 'default')
  }, [findTriggerAtX])

  // Mouse down — start drag
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.button !== 0) return
    const nearTrigger = findTriggerAtX(e.clientX)
    if (!nearTrigger) return

    dragRef.current = { triggerId: nearTrigger.id, startX: e.clientX }
    setCursorStyle('grabbing')

    const onMove = (me: MouseEvent) => {
      if (!dragRef.current) return
      const t = xToTime(me.clientX)
      updateTrigger(dragRef.current.triggerId, { time: t })
      if (onTriggerDrag) {
        onTriggerDrag(String(dragRef.current.triggerId), t * 1000)
      }
    }

    const onUp = () => {
      dragRef.current = null
      setCursorStyle('default')
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
    }

    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
  }, [findTriggerAtX, xToTime, updateTrigger, onTriggerDrag])

  const cursor = cursorStyle === 'grabbing' ? 'grabbing' : cursorStyle === 'ew-resize' ? 'ew-resize' : 'default'

  return (
    <div ref={scrollRef} className="overflow-x-hidden overflow-y-hidden" style={{ maxHeight: SEG_H }}>
      <div ref={containerRef} style={{ width: getCanvasWidth(), minWidth: '100%' }}>
        <canvas
          ref={canvasRef}
          className="block"
          style={{ height: SEG_H, cursor }}
          onMouseMove={handleMouseMove}
          onMouseDown={handleMouseDown}
        />
      </div>
    </div>
  )
}