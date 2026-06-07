'use client'
import { useEffect, useCallback, useRef, memo } from 'react'
import { Play, Pause, Square, Repeat, SkipBack, SkipForward } from 'lucide-react'
import { usePlaybackStore } from '@/stores/playbackStore'
import { useAudioEngine } from '@/hooks/useAudioEngine'
import { formatTime } from '@/lib/format'

/**
 * TimeDisplay — updates via rAF + ref, zero React re-renders during playback.
 */
const TimeDisplay = memo(function TimeDisplay() {
  const elRef = useRef<HTMLDivElement>(null)
  const rafRef = useRef(0)

  useEffect(() => {
    let running = true
    const update = () => {
      if (!running) return
      const el = elRef.current
      if (el) {
        const { currentTick, duration } = usePlaybackStore.getState()
        el.textContent = `${formatTime(currentTick)} / ${formatTime(duration)}`
      }
      rafRef.current = requestAnimationFrame(update)
    }
    rafRef.current = requestAnimationFrame(update)
    return () => { running = false; cancelAnimationFrame(rafRef.current) }
  }, [])

  return (
    <div
      ref={elRef}
      className="font-mono text-sm tabular-nums text-green-400 min-w-[120px]"
      style={{ textShadow: '0 0 8px rgba(34,197,94,0.3)' }}
    />
  )
})

/**
 * ProgressBar — updates width via rAF + ref, zero React re-renders.
 */
const ProgressBar = memo(function ProgressBar({ onSeek }: { onSeek: (timeSec: number) => void }) {
  const fillRef = useRef<HTMLDivElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const rafRef = useRef(0)
  const loopA = usePlaybackStore((s) => s.loopA)
  const loopB = usePlaybackStore((s) => s.loopB)
  const duration = usePlaybackStore((s) => s.duration)

  useEffect(() => {
    let running = true
    const update = () => {
      if (!running) return
      const fill = fillRef.current
      if (fill) {
        const { currentTick, duration: dur } = usePlaybackStore.getState()
        const pct = dur > 0 ? (currentTick / dur) * 100 : 0
        fill.style.width = `${pct}%`
      }
      rafRef.current = requestAnimationFrame(update)
    }
    rafRef.current = requestAnimationFrame(update)
    return () => { running = false; cancelAnimationFrame(rafRef.current) }
  }, [])

  const handleClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect()
    const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width))
    const t = pct * usePlaybackStore.getState().duration
    onSeek(t)
  }, [onSeek])

  return (
    <div
      ref={containerRef}
      className="flex-1 h-1.5 rounded-full cursor-pointer relative group bg-zinc-800"
      onClick={handleClick}
      role="slider"
      tabIndex={0}
      aria-label="Playback progress"
    >
      <div
        ref={fillRef}
        className="absolute inset-y-0 left-0 rounded-full"
        style={{ width: '0%', background: '#22c55e', boxShadow: '0 0 6px rgba(34,197,94,0.4)' }}
      />
      {loopA !== null && loopB !== null && duration > 0 && (
        <div
          className="absolute inset-y-0 rounded-full"
          style={{
            left: `${(Math.min(loopA, loopB) / duration) * 100}%`,
            width: `${(Math.abs(loopB - loopA) / duration) * 100}%`,
            background: 'rgba(59, 130, 246, 0.2)',
            border: '1px solid rgba(59, 130, 246, 0.4)',
          }}
        />
      )}
    </div>
  )
})

export function Transport() {
  const isPlaying = usePlaybackStore((s) => s.isPlaying)
  const abLoopEnabled = usePlaybackStore((s) => s.abLoopEnabled)
  const setAbLoopEnabled = usePlaybackStore((s) => s.setAbLoopEnabled)

  // Web Audio Engine — owns all playback
  const engine = useAudioEngine()

  const handlePlay = useCallback(() => {
    engine.play()
  }, [engine])

  const handlePause = useCallback(() => {
    engine.pause()
  }, [engine])

  const handleStop = useCallback(() => {
    engine.stop()
  }, [engine])

  const handleSeek = useCallback((timeSec: number) => {
    engine.seek(timeSec)
  }, [engine])

  const handleSkipBack = useCallback(() => {
    const t = Math.max(0, usePlaybackStore.getState().currentTick - 5)
    engine.seek(t)
  }, [engine])

  const handleSkipForward = useCallback(() => {
    const { currentTick, duration } = usePlaybackStore.getState()
    const t = Math.min(duration, currentTick + 5)
    engine.seek(t)
  }, [engine])

  // Keyboard shortcuts
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return
      switch (e.code) {
        case 'Space': {
          e.preventDefault()
          if (usePlaybackStore.getState().isPlaying) {
            engine.pause()
          } else {
            engine.play()
          }
          break
        }
        case 'ArrowLeft': {
          e.preventDefault()
          const t = Math.max(0, usePlaybackStore.getState().currentTick - 5)
          engine.seek(t)
          break
        }
        case 'ArrowRight': {
          e.preventDefault()
          const { currentTick, duration } = usePlaybackStore.getState()
          engine.seek(Math.min(duration, currentTick + 5))
          break
        }
        case 'Home': {
          e.preventDefault()
          engine.stop()
          break
        }
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [engine])

  const btnBase = 'flex items-center justify-center rounded-lg border border-zinc-700 text-zinc-300 hover:bg-zinc-700 hover:text-white transition-all duration-150 cursor-pointer'
  const btnSm = `${btnBase} w-[34px] h-[34px]`

  return (
    <div className="flex items-center gap-4 px-6 py-3 bg-zinc-950 border-t border-zinc-800 shrink-0">
      {/* Controls */}
      <div className="flex items-center gap-1.5">
        <button className={btnSm} onClick={handleSkipBack} title="Back 5s (←)" aria-label="Skip back 5 seconds">
          <SkipBack size={14} />
        </button>
        <button className={btnSm} onClick={handleStop} title="Stop (Home)" aria-label="Stop playback">
          <Square size={12} />
        </button>
        {isPlaying ? (
          <button
            className={`${btnBase} w-[40px] h-[40px] bg-green-500/10 border-green-500/30 text-green-400`}
            onClick={handlePause} title="Pause (Space)" aria-label="Pause"
          >
            <Pause size={16} />
          </button>
        ) : (
          <button
            className={`${btnBase} w-[40px] h-[40px] bg-green-500/10 border-green-500/30 text-green-400`}
            onClick={handlePlay} title="Play (Space)" aria-label="Play"
          >
            <Play size={16} className="ml-0.5" />
          </button>
        )}
        <button className={btnSm} onClick={handleSkipForward} title="Forward 5s (→)" aria-label="Skip forward 5 seconds">
          <SkipForward size={14} />
        </button>

        <button
          className={`${btnSm} ${abLoopEnabled ? 'bg-blue-500/10 border-blue-500/30 text-blue-400' : ''}`}
          onClick={() => {
            const newEnabled = !abLoopEnabled
            setAbLoopEnabled(newEnabled)
          }}
          title="AB Loop" aria-label="Toggle AB Loop" aria-pressed={abLoopEnabled}
        >
          <Repeat size={13} />
        </button>
      </div>

      {/* Time display — updates via rAF, no re-renders */}
      <TimeDisplay />

      {/* Progress bar — updates via rAF, no re-renders */}
      <ProgressBar onSeek={handleSeek} />
    </div>
  )
}
