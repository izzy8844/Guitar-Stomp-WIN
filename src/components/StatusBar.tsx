'use client'

import { Wifi, WifiOff, Music } from 'lucide-react'
import { usePlaybackStore } from '@/stores/playbackStore'
import { useProjectStore } from '@/stores/projectStore'

export function StatusBar() {
  const wsConnected = usePlaybackStore((s) => s.wsConnected)
  const wsStatus = usePlaybackStore((s) => s.wsStatus)
  const currentMidiPort = usePlaybackStore((s) => s.currentMidiPort)
  const lastMidiEvent = usePlaybackStore((s) => s.lastMidiEvent)
  const triggers = useProjectStore((s) => s.triggers)
  const audioFile = useProjectStore((s) => s.audioFile)

  const wsColor = wsConnected ? '#22c55e' : wsStatus === 'error' ? '#ef4444' : wsStatus === 'connecting' ? '#f59e0b' : '#ef4444'
  const WsIcon = wsConnected ? Wifi : WifiOff

  return (
    <footer className="flex items-center gap-4 px-6 py-1.5 text-[10px] font-mono bg-zinc-950 border-t border-zinc-800 text-zinc-500 shrink-0">
      {/* WS status */}
      <div className="flex items-center gap-1.5">
        <WsIcon size={10} style={{ color: wsColor }} />
        <span style={{ color: wsColor }}>{wsStatus}</span>
      </div>

      {/* MIDI port */}
      {currentMidiPort && (
        <>
          <div className="w-px h-2.5 bg-zinc-700" />
          <span className="text-zinc-400">{currentMidiPort}</span>
        </>
      )}

      <div className="flex-1" />

      {/* Audio file */}
      {audioFile && (
        <span className="truncate max-w-[220px] text-zinc-500">{audioFile}</span>
      )}

      <div className="w-px h-2.5 bg-zinc-700" />

      {/* Trigger count */}
      <div className="flex items-center gap-1.5">
        <Music size={9} className="text-zinc-500" />
        <span>{triggers.length} triggers</span>
      </div>

      {/* Last MIDI event */}
      {lastMidiEvent && (
        <>
          <div className="w-px h-2.5 bg-zinc-700" />
          <span className="text-green-400">
            PC{lastMidiEvent.pc ?? lastMidiEvent.program} {lastMidiEvent.name || ''}
          </span>
        </>
      )}

      <div className="w-px h-2.5 bg-zinc-700" />
      <span className="text-zinc-600">v2.1</span>
    </footer>
  )
}
