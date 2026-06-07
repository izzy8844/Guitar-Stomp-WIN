'use client'

import { useEffect, useState } from 'react'
import { Cpu, ChevronDown, Check, Loader2, AlertCircle } from 'lucide-react'
import { useMapperStore } from '@/stores/mapperStore'
import { fetchPlugins, selectMidiPort, type PluginInfo } from '@/lib/api'

/**
 * DeviceSelector — lets user pick an effect pedal plugin directly from the main header.
 * Reads from and writes to mapperStore.selectedPlugin, fully synced with Settings page.
 * On plugin change, resets mapping state so ToneMappingSelector cascades reload.
 */
export function DeviceSelector() {
  const selectedPlugin = useMapperStore((s) => s.selectedPlugin)
  const [plugins, setPlugins] = useState<PluginInfo[]>([])
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [loadError, setLoadError] = useState(false)

  // Load plugin list on mount & sync MIDI port for persisted selection
  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setLoadError(false)

    // Add a timeout to avoid infinite loading when backend is slow/unreachable
    const timeout = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('Plugin detection timed out')), 10000)
    )

    Promise.race([fetchPlugins(), timeout])
      .then((data) => {
        if (!cancelled) {
          setPlugins(data)
          useMapperStore.getState().setPlugins(data.map(p => p.name))
          // If a plugin was previously selected (from localStorage), sync its MIDI port
          const current = useMapperStore.getState().selectedPlugin
          if (current) {
            const match = data.find(p => p.name === current)
            const portName = match?.is_hardware ? match.name : ''
            selectMidiPort(portName).catch(() => {})
          }
        }
      })
      .catch(() => {
        if (!cancelled) {
          setPlugins([])
          setLoadError(true)
        }
      })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [])

  const handleSelect = (plugin: PluginInfo) => {
    useMapperStore.getState().setSelectedPlugin(plugin.name)
    // If hardware device, tell backend to use that MIDI port; otherwise use virtual port
    const portName = plugin.is_hardware ? plugin.name : ''
    selectMidiPort(portName).catch(() => {})
    setOpen(false)
  }

  // Derive display name: use the short plugin name
  const displayName = selectedPlugin || 'Select Device'

  if (loading && plugins.length === 0) {
    return (
      <div className="flex items-center gap-2 px-3 py-1.5 text-xs text-zinc-400">
        <Loader2 size={12} className="animate-spin text-green-400" />
        <span>Detecting...</span>
      </div>
    )
  }

  if (loadError && plugins.length === 0) {
    return (
      <div className="flex items-center gap-2 px-3 py-1.5 text-xs text-zinc-500">
        <AlertCircle size={12} className="text-yellow-500" />
        <span>No plugins found</span>
      </div>
    )
  }

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-zinc-800 border border-zinc-700 hover:border-zinc-600 transition-colors text-xs"
      >
        <Cpu size={12} className="text-purple-400 shrink-0" />
        <span className="truncate max-w-[140px] text-zinc-200">
          {displayName}
        </span>
        {plugins.length > 0 && (
          <ChevronDown size={12} className={`text-zinc-400 shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
        )}
      </button>

      {open && plugins.length > 0 && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute left-0 top-full mt-1.5 w-56 min-w-[200px] rounded-lg overflow-hidden z-50 bg-zinc-900 border border-zinc-700 shadow-xl">
            {plugins.map((plugin) => {
              const isActive = plugin.name === selectedPlugin
              return (
                <button
                  key={plugin.name}
                  onClick={() => handleSelect(plugin)}
                  className={`flex items-center gap-2.5 w-full px-4 py-2.5 text-xs transition-all text-left ${isActive ? 'text-purple-400 bg-purple-500/5' : 'text-zinc-300 hover:bg-zinc-800'}`}
                >
                  {isActive && <Check size={11} className="shrink-0" />}
                  {!isActive && <div className="w-[11px] shrink-0" />}
                  <span className="truncate flex-1">{plugin.name}</span>
                </button>
              )
            })}
            {plugins.length === 0 && (
              <div className="px-4 py-3 text-xs text-zinc-500 text-center">
                No plugins detected
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}
