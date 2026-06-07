'use client'

import { useState, useEffect } from 'react'
import { X, Plus, FileText, AlertTriangle, Zap, Music, ArrowRight, AlertCircle } from 'lucide-react'
import Link from 'next/link'
import { useProjectStore } from '@/stores/projectStore'
import { useMapperStore } from '@/stores/mapperStore'
import { usePlaybackStore } from '@/stores/playbackStore'
import { formatTime } from '@/lib/format'
import { fetchPresets } from '@/lib/api'

interface Props { open: boolean; onClose: () => void; time: number }

export default function ToneAddDialog({ open, onClose, time }: Props) {
  const addTrigger = useProjectStore((s) => s.addTrigger)
  const [customName, setCustomName] = useState('')
  const [customPC, setCustomPC] = useState('')
  const mappingTones = useMapperStore((s) => s.activeMappingTones)
  const activeMappingFile = useMapperStore((s) => s.activeMappingFile)
  const selectedPlugin = useMapperStore((s) => s.selectedPlugin)
  const userPresets = useMapperStore((s) => s.userPresets)
  const initStatus = useMapperStore((s) => s.initStatus)
  const wsConnected = usePlaybackStore((s) => s.wsConnected)
  const [fallbackPresets, setFallbackPresets] = useState<{ name: string; pc: number }[]>([])
  const [loadingPresets, setLoadingPresets] = useState(false)

  // If no mapping tones and no user presets but plugin selected → load all plugin presets as fallback
  useEffect(() => {
    if (!open) return
    if (mappingTones.length > 0 || userPresets.length > 0 || !selectedPlugin) {
      setFallbackPresets([])
      return
    }
    let cancelled = false
    setLoadingPresets(true)
    fetchPresets(selectedPlugin)
      .then(presets => {
        if (cancelled) return
        setFallbackPresets(presets.map((p, i) => ({ name: p.name || `Preset ${i}`, pc: i })))
      })
      .catch(() => { if (!cancelled) setFallbackPresets([]) })
      .finally(() => { if (!cancelled) setLoadingPresets(false) })
    return () => { cancelled = true }
  }, [open, selectedPlugin, mappingTones.length, userPresets.length])

  // Escape key closes modal
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null

  const handleAdd = (toneName: string, program: number) => {
    addTrigger(time, program, toneName)
    onClose()
  }

  const hasMapping = activeMappingFile && mappingTones.length > 0
  const hasUserPresets = userPresets.length > 0

  // Priority: user presets (from auto-setup) > mapping tones > fallback presets
  const displayTones = hasUserPresets
    ? userPresets.map(t => ({ name: t.name, pc: t.pc }))
    : hasMapping
      ? mappingTones.map(t => ({ name: t.name, pc: t.pc }))
      : fallbackPresets

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4" onClick={onClose} role="dialog" aria-modal="true" aria-label="Add Tone">
      <div className="w-full max-w-lg bg-[#18181b] rounded-2xl p-6 shadow-2xl max-h-[80vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-lg font-semibold text-white">Add Tone</h2>
            <p className="text-xs text-zinc-500">at {formatTime(time)}</p>
          </div>
          <button onClick={onClose} className="text-zinc-500 hover:text-zinc-300"><X className="w-5 h-5" /></button>
        </div>

        {/* ===== STATE: No plugin detected ===== */}
        {!selectedPlugin && initStatus !== 'loading' && (
          <div className="text-center py-8 mb-6">
            <FileText size={28} className="mx-auto text-zinc-600 mb-3" />
            <p className="text-sm text-zinc-400 mb-2">No Neural DSP plugin detected</p>
            <p className="text-xs text-zinc-500 leading-relaxed max-w-sm mx-auto mb-4">
              Make sure you have a Neural DSP plugin installed on your system. Guitar AutoStomp will automatically detect it.
            </p>
            <Link href="/settings" onClick={onClose}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-zinc-800 text-zinc-300 hover:bg-zinc-700 text-sm transition-colors">
              Go to Settings <ArrowRight size={14} />
            </Link>
          </div>
        )}

        {/* ===== STATE: Loading ===== */}
        {initStatus === 'loading' && (
          <div className="text-center py-6 text-sm text-zinc-400">Detecting plugins & presets...</div>
        )}

        {/* ===== STATE: No user presets — guide to save tones ===== */}
        {selectedPlugin && initStatus === 'no_user_presets' && !hasMapping && displayTones.length === 0 && !loadingPresets && (
          <div className="mb-6">
            <div className="flex items-start gap-3 p-4 rounded-xl bg-gradient-to-br from-amber-500/5 to-orange-500/5 border border-amber-500/20">
              <Music size={20} className="text-amber-400 shrink-0 mt-0.5" />
              <div className="space-y-2">
                <p className="text-sm font-medium text-amber-200">No personal tones saved yet</p>
                <p className="text-xs text-zinc-400 leading-relaxed">
                  Open <span className="text-white font-medium">{selectedPlugin}</span> and save your favorite tones to the <span className="text-white font-medium">User</span> folder. 
                  Guitar AutoStomp will automatically detect them on next launch.
                </p>
                <div className="flex items-center gap-3 pt-2">
                  <Link href="/settings" onClick={onClose}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-500/10 text-amber-300 hover:bg-amber-500/20 text-xs transition-colors border border-amber-500/20">
                    Tone Settings <ArrowRight size={12} />
                  </Link>
                  <span className="text-xs text-zinc-600">or add tones manually below</span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ===== STATE: Has user presets — show them + MIDI setup guide ===== */}
        {selectedPlugin && displayTones.length > 0 && (
          <>
            {/* MIDI not connected warning */}
            {!wsConnected && (
              <div className="mb-4 p-3 rounded-xl bg-gradient-to-br from-red-500/5 to-orange-500/5 border border-red-500/20">
                <div className="flex items-start gap-2.5">
                  <AlertCircle size={16} className="text-red-400 shrink-0 mt-0.5" />
                  <div className="space-y-1.5">
                    <p className="text-xs font-medium text-red-300">MIDI connection not detected</p>
                    <p className="text-xs text-zinc-400 leading-relaxed">
                      Open your plugin (e.g. Neural DSP), go to <span className="text-white">Settings → MIDI</span>, and select <span className="text-white">Guitar AutoStomp Virtual Port</span> as input device. Then load the XML mapping file for your plugin.
                    </p>
                    <Link href="/settings" onClick={onClose} className="inline-flex items-center gap-1 text-[11px] text-red-400 hover:text-red-300 mt-1">
                      Open Settings <ArrowRight size={10} />
                    </Link>
                  </div>
                </div>
              </div>
            )}

            {/* MIDI Setup guidance banner — show when connected and mapping exists */}
            {wsConnected && (hasUserPresets || hasMapping) && (
              <div className="mb-4 p-3 rounded-xl bg-gradient-to-br from-green-500/5 to-emerald-500/5 border border-green-500/20">
                <div className="flex items-start gap-2.5">
                  <Zap size={16} className="text-green-400 shrink-0 mt-0.5" />
                  <div className="space-y-1.5">
                    <p className="text-xs font-medium text-green-300">MIDI Auto-Switch Setup</p>
                    <div className="text-xs text-zinc-400 leading-relaxed space-y-1">
                      <p>1. In <span className="text-zinc-200">{selectedPlugin}</span>, open <span className="text-white">Settings → MIDI</span> and enable MIDI input</p>
                      <p>2. Select <span className="text-white">Guitar AutoStomp Virtual Port</span> as input device</p>
                      <p>3. In MIDI settings, click <span className="text-white">OPEN</span> and load the XML file matching your plugin name</p>
                    </div>
                    <Link href="/guide" onClick={onClose} className="inline-flex items-center gap-1 text-[11px] text-green-400 hover:text-green-300 mt-1">
                      View full guide <ArrowRight size={10} />
                    </Link>
                  </div>
                </div>
              </div>
            )}

            {/* Active mapping file indicator */}
            {hasMapping && !hasUserPresets && (
              <div className="flex items-center gap-2 mb-3 px-3 py-2 rounded-lg bg-zinc-800/50 border border-zinc-700/50">
                <FileText size={12} className="text-green-400 shrink-0" />
                <span className="text-xs text-zinc-400">From:</span>
                <span className="text-xs text-zinc-200 truncate">{activeMappingFile}</span>
              </div>
            )}

            {/* User presets section header */}
            {hasUserPresets && (
              <div className="flex items-center gap-2 mb-3">
                <span className="text-xs text-zinc-500 uppercase tracking-wide">Your Tones</span>
                <span className="text-xs text-zinc-600">({userPresets.length})</span>
              </div>
            )}

            {/* Warning when no mapping — showing all presets as fallback */}
            {!hasMapping && !hasUserPresets && displayTones.length > 0 && (
              <div className="flex items-start gap-2 mb-4 px-3 py-2.5 rounded-lg bg-amber-500/5 border border-amber-500/20">
                <AlertTriangle size={14} className="text-amber-400 shrink-0 mt-0.5" />
                <div className="text-xs text-amber-300/90 leading-relaxed">
                  <span className="font-medium">No MIDI mapping active.</span> Showing all plugin presets — 
                  auto-switching won&apos;t work until a mapping is installed. Go to <span className="text-white">Settings → Auto Map &amp; Install</span>.
                </div>
              </div>
            )}

            {/* Tone grid */}
            <div className="grid grid-cols-2 gap-2 mb-6">
              {displayTones.map((p) => (
                <button key={`${p.pc}-${p.name}`} onClick={() => handleAdd(p.name, p.pc)}
                  className="flex items-center gap-3 p-3 rounded-lg border border-zinc-700 hover:border-green-500/50 hover:bg-zinc-800 transition-colors text-left">
                  <div className="min-w-0">
                    <div className="text-sm text-zinc-200 truncate">{p.name}</div>
                    <div className="text-xs text-zinc-500">PC {p.pc}</div>
                  </div>
                </button>
              ))}
            </div>
          </>
        )}

        {/* Loading fallback presets */}
        {loadingPresets && (
          <div className="text-center py-6 text-sm text-zinc-400">Loading presets...</div>
        )}

        {/* Custom tone — always available */}
        <div className="border-t border-zinc-700 pt-4">
          <p className="text-xs text-zinc-500 mb-3">Custom Tone (manual PC#)</p>
          <div className="flex gap-2">
            <input type="text" placeholder="Tone name" value={customName} onChange={e => setCustomName(e.target.value)}
              className="flex-1 bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white placeholder-zinc-500 focus:border-green-500 focus:outline-none" />
            <input type="number" placeholder="PC#" min={0} max={127} value={customPC} onChange={e => setCustomPC(e.target.value)}
              className="w-20 bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white placeholder-zinc-500 focus:border-green-500 focus:outline-none" />
            <button onClick={() => { const pc = parseInt(customPC, 10); if (customName.trim() && !isNaN(pc) && pc >= 0 && pc <= 127) { handleAdd(customName.trim(), pc); setCustomName(''); setCustomPC('') } }}
              className="px-4 py-2 rounded-lg bg-green-500/20 text-green-400 hover:bg-green-500/30 transition-colors"><Plus className="w-4 h-4" /></button>
          </div>
        </div>
      </div>
    </div>
  )
}
