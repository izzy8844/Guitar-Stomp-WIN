'use client'
import { Download } from 'lucide-react'
import { useProjectStore } from '@/stores/projectStore'
import { usePlaybackStore } from '@/stores/playbackStore'
import { downloadMidiFile, type MidiTrigger, type MidiMetadata } from '@/lib/midi-export'
import { toast } from '@/components/Toast'

export default function ExportButton() {
  const triggers = useProjectStore((s) => s.triggers)
  const projectName = useProjectStore((s) => s.projectName)
  const duration = usePlaybackStore((s) => s.duration)
  const bpm = usePlaybackStore((s) => s.bpm)

  const handleExport = () => {
    try {
      if (triggers.length === 0) { toast.info('Add at least one trigger before exporting.'); return }
      const midiTriggers: MidiTrigger[] = triggers.map((t) => ({
        id: String(t.id), time: t.time, toneName: t.name, program: t.pc, bank: 0,
      }))
      const metadata: MidiMetadata = { name: projectName, duration, bpm: bpm || 120 }
      downloadMidiFile(midiTriggers, metadata)
      toast.success('MIDI file exported!')
    } catch { toast.error('Failed to export MIDI file.') }
  }

  return (
    <button onClick={handleExport} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-zinc-700 text-zinc-400 hover:border-green-500 hover:text-green-400 text-xs transition-colors">
      <Download className="w-3.5 h-3.5" />Export MIDI
    </button>
  )
}
