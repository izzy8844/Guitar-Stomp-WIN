'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { FileText, ChevronDown, Check, Loader2, RefreshCw } from 'lucide-react'
import { useMapperStore } from '@/stores/mapperStore'
import { fetchMappingFiles, fetchMappingTones, refreshMapping, type MappingFileInfo } from '@/lib/api'

/**
 * ToneMappingSelector — user selects an XML mapping file, then tones from that file
 * are loaded and used in ToneAddDialog.
 *
 * Design priorities:
 * 1. On startup: silently regenerate the default user preset XML ({slug}_user.xml),
 *    but display the LAST SELECTED file. If no file was previously selected, show the user XML.
 * 2. User-created XML (from Settings): if filename conflicts, backend overwrites (already supported).
 * 3. Refresh button: reload the full file list dropdown AND regenerate the user preset XML,
 *    but do NOT switch away from the currently selected file.
 */
export function ToneMappingSelector() {
  const selectedPlugin = useMapperStore((s) => s.selectedPlugin)
  const activeMappingFile = useMapperStore((s) => s.activeMappingFile)
  const mappingVersion = useMapperStore((s) => s.mappingVersion)
  const [mappingFiles, setMappingFiles] = useState<MappingFileInfo[]>([])
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const didAutoRefresh = useRef(false)

  // Derive the default user XML filename for this plugin
  const getUserXmlName = useCallback((plugin: string) => {
    const slug = plugin.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
    return `${slug}_user.xml`
  }, [])

  const loadTonesForFile = useCallback(async (plugin: string, filename: string) => {
    try {
      const data = await fetchMappingTones(plugin, filename)
      useMapperStore.getState().setActiveMappingTones(data.tones || [])
    } catch {
      useMapperStore.getState().setActiveMappingTones([])
    }
  }, [])

  useEffect(() => {
    if (!selectedPlugin) return
    let cancelled = false

    ;(async () => {
      // Guard: if auto-setup is still in progress, wait for it to finish before loading
      const mapper = useMapperStore.getState()
      if (!mapper.autoSetupDone && mapper.initStatus === 'loading') {
        // Auto-setup will set tones directly; skip this run.
        // A subsequent mappingVersion bump or state change will re-trigger.
        return
      }

      setLoading(true)
      try {
        // Priority 1: On first mount, silently regenerate the default user preset XML
        // This ensures user presets are always up-to-date, but we don't switch to it
        if (!didAutoRefresh.current) {
          didAutoRefresh.current = true
          try {
            const defaultUserXml = getUserXmlName(selectedPlugin)
            await refreshMapping(selectedPlugin, defaultUserXml)
          } catch { /* ignore — no user presets or backend unavailable */ }
        }

        // Load all XML files in this plugin's directory
        const data = await fetchMappingFiles(selectedPlugin)
        if (cancelled) return
        const files = data.files || []
        setMappingFiles(files)

        if (files.length === 0) {
          useMapperStore.getState().setActiveMappingFile('')
          useMapperStore.getState().setActiveMappingTones([])
        } else {
          // If auto-setup already populated tones, preserve them
          const currentTones = useMapperStore.getState().activeMappingTones
          if (currentTones.length > 0 && useMapperStore.getState().autoSetupDone) {
            // Tones were set by auto-setup; just update the file list without overwriting
          } else {
            // Try to keep the previously selected file (persisted in localStorage)
            const savedFile = useMapperStore.getState().activeMappingFile
            const match = files.find(f => f.filename === savedFile)
            if (match) {
              // User had a file selected before — keep it
              await loadTonesForFile(selectedPlugin, savedFile)
            } else {
              // No previous selection or file was deleted — fall back to default user XML
              const defaultUserXml = getUserXmlName(selectedPlugin)
              const defaultMatch = files.find(f => f.filename === defaultUserXml)
              const fallback = defaultMatch ? defaultUserXml : files[0].filename
              useMapperStore.getState().setActiveMappingFile(fallback)
              await loadTonesForFile(selectedPlugin, fallback)
            }
          }
        }
      } catch {
        if (!cancelled) {
          setMappingFiles([])
          useMapperStore.getState().setActiveMappingTones([])
        }
      }
      if (!cancelled) setLoading(false)
    })()
    return () => { cancelled = true }
  }, [selectedPlugin, mappingVersion, loadTonesForFile, getUserXmlName])

  const handleSelect = async (filename: string) => {
    if (!selectedPlugin) return
    useMapperStore.getState().setActiveMappingFile(filename)
    setOpen(false)
    await loadTonesForFile(selectedPlugin, filename)
  }

  const handleRefresh = async () => {
    if (!selectedPlugin || refreshing) return

    setRefreshing(true)
    try {
      // Priority 3: Regenerate the default user preset XML (keep it fresh)
      const defaultUserXml = getUserXmlName(selectedPlugin)
      try {
        await refreshMapping(selectedPlugin, defaultUserXml)
      } catch { /* no user presets — that's fine */ }

      // Reload full file list (shows all XMLs in the directory)
      const data = await fetchMappingFiles(selectedPlugin)
      const files = data.files || []
      setMappingFiles(files)

      // Keep the currently selected file — do NOT switch
      const currentFile = useMapperStore.getState().activeMappingFile
      const stillExists = files.find(f => f.filename === currentFile)
      if (stillExists) {
        // Reload tones for current file (in case it was the user XML that just got regenerated)
        await loadTonesForFile(selectedPlugin, currentFile)
      } else if (files.length > 0) {
        // Current file was somehow removed — fall back
        const fallback = files.find(f => f.filename === defaultUserXml)?.filename || files[0].filename
        useMapperStore.getState().setActiveMappingFile(fallback)
        await loadTonesForFile(selectedPlugin, fallback)
      }
    } catch {
      // If everything fails, just try to reload file list
      try {
        const data = await fetchMappingFiles(selectedPlugin)
        setMappingFiles(data.files || [])
      } catch { /* ignore */ }
    }
    setRefreshing(false)
  }

  if (!selectedPlugin) {
    return (
      <div className="flex items-center gap-2 px-3 py-1.5 text-xs text-zinc-500">
        <FileText size={12} className="text-zinc-600" />
        <span>Select a device first</span>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="flex items-center gap-2 px-3 py-1.5 text-xs text-zinc-400">
        <Loader2 size={12} className="animate-spin text-green-400" />
        <span>Loading mappings...</span>
      </div>
    )
  }

  return (
    <div className="flex items-center gap-1.5">
      {/* Dropdown selector */}
      <div className="relative">
        <button
          onClick={() => setOpen(!open)}
          className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-zinc-800 border border-zinc-700 hover:border-zinc-600 transition-colors text-xs"
        >
          <FileText size={12} className="text-green-400 shrink-0" />
          <span className="truncate max-w-[180px] text-zinc-200">
            {activeMappingFile
              ? activeMappingFile
              : mappingFiles.length === 0
                ? 'No mapping files'
                : 'Select mapping...'}
          </span>
          {mappingFiles.length > 0 && (
            <ChevronDown size={12} className={`text-zinc-400 shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
          )}
        </button>

        {open && mappingFiles.length > 0 && (
          <>
            <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
            <div className="absolute left-0 top-full mt-1.5 w-64 min-w-[220px] rounded-lg overflow-hidden z-50 bg-zinc-900 border border-zinc-700 shadow-xl">
              {mappingFiles.map((file) => {
                const isActive = file.filename === activeMappingFile
                return (
                  <button
                    key={file.filename}
                    onClick={() => handleSelect(file.filename)}
                    className={`flex items-center gap-2.5 w-full px-4 py-2.5 text-xs transition-all text-left ${isActive ? 'text-green-400 bg-green-500/5' : 'text-zinc-300 hover:bg-zinc-800'}`}
                  >
                    {isActive && <Check size={11} className="shrink-0" />}
                    {!isActive && <div className="w-[11px] shrink-0" />}
                    <span className="truncate flex-1">{file.filename}</span>
                    <span className="text-zinc-500 shrink-0">{file.tone_count} tones</span>
                  </button>
                )
              })}
            </div>
          </>
        )}

        {open && mappingFiles.length === 0 && (
          <>
            <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
            <div className="absolute left-0 top-full mt-1.5 w-64 rounded-lg overflow-hidden z-50 bg-zinc-900 border border-zinc-700 shadow-xl">
              <div className="px-4 py-4 text-xs text-center text-zinc-500">
                No mapping files found.<br />
                <span className="text-zinc-400">Click refresh to scan and generate.</span>
              </div>
            </div>
          </>
        )}
      </div>

      {/* Refresh button */}
      <button
        onClick={handleRefresh}
        disabled={refreshing}
        title="Refresh: re-scan user presets and regenerate mapping"
        className="flex items-center justify-center w-7 h-7 rounded-lg bg-zinc-800 border border-zinc-700 hover:border-green-500/50 hover:bg-green-500/10 transition-colors disabled:opacity-50"
      >
        <RefreshCw size={12} className={`text-zinc-400 hover:text-green-400 ${refreshing ? 'animate-spin text-green-400' : ''}`} />
      </button>
    </div>
  )
}
