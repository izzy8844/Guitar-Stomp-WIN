'use client'
import { useRef, useEffect, useCallback } from 'react'
import { usePlaybackStore } from '@/stores/playbackStore'

const RULER_H = 20

/**
 * Standalone timeline ruler that syncs with Waveform zoom.
 * Shows time markers with fine grid lines.
 * Note: Waveform component has its own internal ruler — this component
 * provides an additional reference point above the timeline area.
 */
export function TimelineRuler() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const duration = usePlaybackStore((s) => s.duration)
  const zoom = usePlaybackStore((s) => s.zoom)
  const pxPerSec = 100 * zoom

  const draw = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const totalDur = duration || 60
    const W = Math.max(800, totalDur * pxPerSec)
    const targetW = W * 2
    const targetH = RULER_H * 2
    if (canvas.width !== targetW || canvas.height !== targetH) {
      canvas.width = targetW
      canvas.height = targetH
      canvas.style.width = `${W}px`
      canvas.style.height = `${RULER_H}px`
    }
    ctx.setTransform(2, 0, 0, 2, 0, 0)

    // Background
    ctx.fillStyle = 'rgba(0,0,0,0.3)'
    ctx.fillRect(0, 0, W, RULER_H)

    // Calculate nice intervals
    const rawInterval = (totalDur / W) * 100
    const niceIntervals = [0.25, 0.5, 1, 2, 5, 10, 15, 30, 60, 120, 300]
    let majorInterval = niceIntervals[niceIntervals.length - 1]
    for (const iv of niceIntervals) { if (iv >= rawInterval) { majorInterval = iv; break } }
    const minorInterval = majorInterval / 4

    // Minor grid lines
    ctx.strokeStyle = 'rgba(255,255,255,0.05)'
    ctx.lineWidth = 0.5
    for (let t = 0; t <= totalDur; t += minorInterval) {
      const x = Math.round((t / totalDur) * W)
      ctx.beginPath(); ctx.moveTo(x, RULER_H - 4); ctx.lineTo(x, RULER_H); ctx.stroke()
    }

    // Major markers + labels
    ctx.font = '8px "SF Mono", "Fira Code", monospace'
    ctx.fillStyle = 'rgba(255,255,255,0.5)'
    ctx.strokeStyle = 'rgba(255,255,255,0.15)'
    ctx.lineWidth = 1
    for (let t = 0; t <= totalDur; t += majorInterval) {
      const x = Math.round((t / totalDur) * W)
      if (x > W - 20) break
      // Tick
      ctx.beginPath(); ctx.moveTo(x, RULER_H - 8); ctx.lineTo(x, RULER_H); ctx.stroke()
      // Label
      const m = Math.floor(t / 60)
      const s = Math.floor(t % 60)
      const label = m > 0 ? `${m}:${String(s).padStart(2, '0')}` : `${s}s`
      ctx.fillText(label, x + 2, RULER_H - 10)
    }

    // Bottom border
    ctx.fillStyle = 'rgba(255,255,255,0.06)'
    ctx.fillRect(0, RULER_H - 1, W, 1)
  }, [duration, zoom, pxPerSec])

  useEffect(() => { draw() }, [draw])

  if (duration === 0) return null

  return (
    <div className="overflow-x-auto overflow-y-hidden" style={{ maxHeight: RULER_H }}>
      <canvas ref={canvasRef} className="block" style={{ height: RULER_H }} />
    </div>
  )
}
