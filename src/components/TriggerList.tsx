'use client'

import { useState, useEffect } from 'react'
import { Trash2, Music } from 'lucide-react'
import { usePlaybackStore } from '@/stores/playbackStore'
import { useProjectStore, TRIGGER_COLORS } from '@/stores/projectStore'
import { getAudioEngine } from '@/hooks/useAudioEngine'
import { formatTime } from '@/lib/format'

export function TriggerList() {
  const triggers = useProjectStore((s) => s.triggers)
  const activeTriggerIndex = usePlaybackStore((s) => s.activeTriggerIndex)
  const removeTrigger = useProjectStore((s) => s.removeTrigger)
  const setCurrentTick = usePlaybackStore((s) => s.setCurrentTick)
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null)

  // Auto-dismiss confirmation after 3s
  useEffect(() => {
    if (confirmDeleteId === null) return
    const timer = setTimeout(() => setConfirmDeleteId(null), 3000)
    return () => clearTimeout(timer)
  }, [confirmDeleteId])

  const handleJump = (time: number) => {
    setCurrentTick(time)
    getAudioEngine()?.seek(time)
  }

  if (triggers.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-10 gap-3 text-zinc-500">
        <Music size={28} className="opacity-40" />
        <span className="text-xs">Double-click timeline to add Tone Preset</span>
      </div>
    )
  }

  return (
    <div className="flex flex-col" style={{ maxHeight: '100%' }}>
      {/* Table header */}
      <div className="grid items-center gap-3 px-3 py-2 text-[10px] font-medium uppercase tracking-wider text-zinc-500 border-b border-zinc-800 bg-zinc-900/50 rounded-t-md"
        style={{ gridTemplateColumns: '1.5rem 1fr 5rem 2rem' }}>
        <span>#</span>
        <span>Tone Preset</span>
        <span>Time</span>
        <span></span>
      </div>

      {/* Trigger rows */}
      <div className="flex flex-col overflow-y-auto" style={{ maxHeight: 220 }}>
        {triggers.map((tr, idx) => {
          const isActive = idx === activeTriggerIndex
          return (
            <div
              key={tr.id}
              className={`grid items-center gap-3 px-3 py-2 cursor-pointer transition-all group rounded-lg ${isActive ? 'bg-zinc-800/70' : 'hover:bg-zinc-900/50'}`}
              style={{
                gridTemplateColumns: '1.5rem 1fr 5rem 2rem',
                border: `1px solid ${isActive ? 'rgba(255,255,255,0.1)' : 'transparent'}`,
              }}
              onClick={() => handleJump(tr.time)}
            >
              {/* Color dot with glow */}
              <div className="flex items-center justify-center">
                <div
                  className="w-3 h-3 rounded-full transition-shadow"
                  style={{
                    background: tr.color || TRIGGER_COLORS[idx % TRIGGER_COLORS.length],
                    boxShadow: isActive ? `0 0 8px ${tr.color || TRIGGER_COLORS[idx % TRIGGER_COLORS.length]}` : 'none',
                  }}
                />
              </div>

              {/* Name + PC sub-label */}
              <div className="min-w-0">
                <div className="text-sm font-medium truncate text-zinc-200">
                  {tr.name || `Tone ${tr.pc}`}
                </div>
                <div className="text-[10px] font-mono text-zinc-500">
                  PC {tr.pc}
                </div>
              </div>

              {/* Time */}
              <div className="font-mono text-xs text-zinc-500">
                {formatTime(tr.time)}
              </div>

              {/* Delete with confirmation */}
              <button
                className={`p-1 rounded-md transition-all ${confirmDeleteId === tr.id ? 'opacity-100 text-red-400 bg-red-400/10' : 'opacity-0 group-hover:opacity-100 text-zinc-500 hover:text-red-400 hover:bg-red-400/10'}`}
                onClick={(e) => {
                  e.stopPropagation()
                  if (confirmDeleteId === tr.id) {
                    removeTrigger(tr.id)
                    setConfirmDeleteId(null)
                  } else {
                    setConfirmDeleteId(tr.id)
                  }
                }}
                title={confirmDeleteId === tr.id ? 'Click again to confirm' : 'Remove trigger'}
                aria-label={confirmDeleteId === tr.id ? 'Confirm removal' : `Remove ${tr.name || 'trigger'}`}
              >
                {confirmDeleteId === tr.id
                  ? <span className="text-[10px] font-medium px-0.5">Del?</span>
                  : <Trash2 size={13} />
                }
              </button>
            </div>
          )
        })}
      </div>
    </div>
  )
}
