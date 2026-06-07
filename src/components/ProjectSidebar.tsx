'use client'

import { useEffect, useState, useRef, useCallback } from 'react'
import { Plus, FolderOpen, Loader2, AlertCircle, Copy, Trash2 } from 'lucide-react'
import { useProjectStore } from '@/stores/projectStore'
import {
  fetchProjects, fetchProject, createProject, updateProject, deleteProject, duplicateProject,
} from '@/lib/api'
import { projectToFrontend, summaryToFrontendList, storeToBackendUpdate } from '@/lib/projectMapping'
import { toast } from '@/components/Toast'

export function ProjectSidebar() {
  const projects = useProjectStore((s) => s.projects)
  const currentProject = useProjectStore((s) => s.currentProject)
  const setProjects = useProjectStore((s) => s.setProjects)
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const latestSelectRef = useRef<string | null>(null)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [pendingAction, setPendingAction] = useState<(() => void) | null>(null)
  // Per-row in-flight state (duplicate / delete) and delete confirmation.
  const [busyId, setBusyId] = useState<string | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null)

  /** Guard an action with unsaved-changes prompt */
  const guardUnsaved = useCallback((action: () => void) => {
    if (useProjectStore.getState().isDirty) {
      setPendingAction(() => action)
      setConfirmOpen(true)
    } else {
      action()
    }
  }, [])

  const confirmSave = useCallback(async () => {
    const store = useProjectStore.getState()
    if (store.currentProject?.id) {
      try {
        await updateProject(String(store.currentProject.id), storeToBackendUpdate({
          projectName: store.projectName,
          triggers: store.triggers,
          audioFile: store.audioFile,
        }))
        store.markClean()
        toast.success('Project saved')
      } catch { toast.error('Save failed') }
    }
    setConfirmOpen(false)
    if (pendingAction) { pendingAction(); setPendingAction(null) }
  }, [pendingAction])

  const confirmDiscard = useCallback(() => {
    useProjectStore.getState().markClean()
    setConfirmOpen(false)
    if (pendingAction) { pendingAction(); setPendingAction(null) }
  }, [pendingAction])

  const confirmCancel = useCallback(() => {
    setConfirmOpen(false)
    setPendingAction(null)
  }, [])

  const loadProjects = async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await fetchProjects()
      setProjects(summaryToFrontendList(data.projects || []))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { loadProjects() }, [setProjects])

  // Auto-persist edits to the backend project (single source of truth).
  // The backend JSON store is authoritative; localStorage only buffers un-saved
  // drafts for crash recovery (see projectStore). Here we debounce-sync the dirty
  // store state to the backend whenever a real (non-demo) project with an id is
  // loaded, so edits survive even if the app closes without an explicit save.
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null
    let disposed = false

    const unsubscribe = useProjectStore.subscribe((state) => {
      // Only persist edits for a real, saved project — skip demo and unsaved drafts.
      if (state.isDemo || !state.isDirty || !state.currentProject?.id) return
      if (timer) clearTimeout(timer)
      timer = setTimeout(async () => {
        if (disposed) return
        const store = useProjectStore.getState()
        // Re-check guards inside the debounced callback (state may have changed).
        if (store.isDemo || !store.isDirty || !store.currentProject?.id) return
        try {
          await updateProject(String(store.currentProject.id), storeToBackendUpdate({
            projectName: store.projectName,
            triggers: store.triggers,
            audioFile: store.audioFile,
          }))
          // Only clear dirty if no further edits happened during the request.
          if (useProjectStore.getState().isDirty && useProjectStore.getState().currentProject?.id === store.currentProject.id) {
            useProjectStore.getState().markClean()
          }
        } catch {
          // Keep dirty so a later edit / manual save retries; surface nothing intrusive here.
        }
      }, 1500)
    })

    return () => {
      disposed = true
      if (timer) clearTimeout(timer)
      unsubscribe()
    }
  }, [])

  const doCreateNew = async () => {
    if (creating) return
    setCreating(true)
    try {
      const data = await createProject({ name: 'New Project' } as Parameters<typeof createProject>[0])
      if (data.project) {
        useProjectStore.getState().loadProject(projectToFrontend(data.project))
        // Refresh list
        const listData = await fetchProjects()
        setProjects(summaryToFrontendList(listData.projects || []))
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Create failed')
    } finally {
      setCreating(false)
    }
  }

  const handleNew = () => guardUnsaved(doCreateNew)

  const doSelect = async (id: string) => {
    latestSelectRef.current = id
    try {
      const d = await fetchProject(id)
      if (latestSelectRef.current !== id) return
      if (d.project) {
        useProjectStore.getState().loadProject(projectToFrontend(d.project))
      }
    } catch (e) {
      if (latestSelectRef.current === id) {
        setError(e instanceof Error ? e.message : 'Load failed')
      }
    }
  }

  const handleSelect = (id: string) => guardUnsaved(() => doSelect(id))

  // ─── Duplicate ──────────────────────────────────────────────────────────────
  const doDuplicate = async (id: string, name: string) => {
    if (busyId) return
    setBusyId(id)
    try {
      const data = await duplicateProject(id, `${name} Copy`)
      const listData = await fetchProjects()
      setProjects(summaryToFrontendList(listData.projects || []))
      // Open the freshly created copy for immediate editing.
      if (data.project) {
        useProjectStore.getState().loadProject(projectToFrontend(data.project))
      }
      toast.success('Project duplicated')
    } catch {
      toast.error('Duplicate failed')
    } finally {
      setBusyId(null)
    }
  }

  const handleDuplicate = (id: string, name: string) => guardUnsaved(() => doDuplicate(id, name))

  // ─── Delete ───────────────────────────────────────────────────────────────--
  const doDelete = async (id: string) => {
    setBusyId(id)
    try {
      await deleteProject(id)
      const listData = await fetchProjects()
      const list = summaryToFrontendList(listData.projects || [])
      setProjects(list)
      // If the deleted project was open, fall back to the demo project.
      if (useProjectStore.getState().currentProject?.id === id) {
        useProjectStore.getState().loadDemoProject()
      }
      toast.success('Project deleted')
    } catch {
      toast.error('Delete failed')
    } finally {
      setBusyId(null)
      setDeleteTarget(null)
    }
  }

  return (
    <aside className="w-[280px] h-full bg-zinc-950 border-r border-zinc-800 flex flex-col">
      <div className="px-4 py-3 flex items-center justify-between border-b border-zinc-800">
        <h2 className="text-sm font-semibold text-white">Projects</h2>
        <button onClick={handleNew} disabled={creating} className="p-1 rounded hover:bg-zinc-800 text-zinc-400 hover:text-white disabled:opacity-50 disabled:cursor-not-allowed" title="New Project" aria-label="Create new project">
          {creating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
        </button>
      </div>

      <div className="flex-1 overflow-y-auto">
        {loading && (
          <div className="flex flex-col items-center justify-center h-32 text-zinc-500">
            <Loader2 className="w-5 h-5 animate-spin mb-2" />
            <span className="text-xs">Loading projects...</span>
          </div>
        )}

        {!loading && error && (
          <div className="flex flex-col gap-2 mx-4 mt-4 px-3 py-2.5 rounded-lg bg-red-500/5 border border-red-500/20">
            <div className="flex items-center gap-2">
              <AlertCircle className="w-3.5 h-3.5 text-red-400 shrink-0" />
              <span className="text-xs text-red-300">{error}</span>
            </div>
            <button onClick={loadProjects} className="text-xs text-red-400 hover:text-red-300 underline self-start">
              Retry
            </button>
          </div>
        )}

        {!loading && !error && projects.length === 0 && (
          <div className="flex flex-col items-center justify-center h-40 text-center px-6">
            <div className="w-10 h-10 rounded-xl bg-zinc-800/50 flex items-center justify-center mb-3">
              <FolderOpen className="w-5 h-5 text-zinc-600" />
            </div>
            <p className="text-sm text-zinc-400 mb-1">No projects yet</p>
            <p className="text-xs text-zinc-600">Click + to create your first project</p>
          </div>
        )}

        {!loading && projects.map((p) => {
          const pid = String(p.id)
          const isBusy = busyId === pid
          const isActive = currentProject?.id === p.id
          const count = p.triggerCount ?? (Array.isArray(p.triggers) ? p.triggers.length : 0)
          return (
            <div
              key={p.id}
              className={`group relative w-full border-b border-zinc-800/50 transition-colors ${
                isActive ? 'bg-zinc-800/50 border-l-2 border-l-green-500' : 'hover:bg-zinc-900'
              }`}
            >
              <button
                onClick={() => handleSelect(pid)}
                disabled={isBusy}
                className="w-full text-left px-4 py-3 pr-16 disabled:opacity-50"
              >
                <span className="text-sm text-zinc-300">{p.name}</span>
                <div className="text-xs text-zinc-500 mt-0.5">{count} triggers</div>
              </button>
              {/* Row actions: duplicate / delete (revealed on hover/focus) */}
              <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
                {isBusy ? (
                  <Loader2 className="w-4 h-4 animate-spin text-zinc-500" />
                ) : (
                  <>
                    <button
                      onClick={(e) => { e.stopPropagation(); handleDuplicate(pid, p.name) }}
                      className="p-1.5 rounded hover:bg-zinc-700 text-zinc-400 hover:text-white"
                      title="Duplicate project"
                      aria-label={`Duplicate ${p.name}`}
                    >
                      <Copy className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); setDeleteTarget({ id: pid, name: p.name }) }}
                      className="p-1.5 rounded hover:bg-red-500/20 text-zinc-400 hover:text-red-400"
                      title="Delete project"
                      aria-label={`Delete ${p.name}`}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </>
                )}
              </div>
            </div>
          )
        })}
      </div>
      {/* Unsaved changes confirmation dialog */}
      {confirmOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-zinc-900 border border-zinc-700 rounded-xl p-6 w-[360px] shadow-2xl">
            <h3 className="text-white text-base font-semibold mb-2">Unsaved Changes</h3>
            <p className="text-zinc-400 text-sm mb-6">Save current project before switching?</p>
            <div className="flex justify-end gap-2">
              <button onClick={confirmCancel} className="px-3 py-1.5 rounded-lg text-xs text-zinc-400 hover:text-white hover:bg-zinc-800">Cancel</button>
              <button onClick={confirmDiscard} className="px-3 py-1.5 rounded-lg text-xs text-red-400 hover:text-red-300 hover:bg-red-500/10 border border-red-500/30">Don&apos;t Save</button>
              <button onClick={confirmSave} className="px-3 py-1.5 rounded-lg text-xs text-white bg-green-600 hover:bg-green-500">Save</button>
            </div>
          </div>
        </div>
      )}
      {/* Delete confirmation dialog */}
      {deleteTarget && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-zinc-900 border border-zinc-700 rounded-xl p-6 w-[360px] shadow-2xl">
            <h3 className="text-white text-base font-semibold mb-2">Delete Project</h3>
            <p className="text-zinc-400 text-sm mb-6">
              Delete &ldquo;<span className="text-zinc-200">{deleteTarget.name}</span>&rdquo;? This cannot be undone.
            </p>
            <div className="flex justify-end gap-2">
              <button onClick={() => setDeleteTarget(null)} className="px-3 py-1.5 rounded-lg text-xs text-zinc-400 hover:text-white hover:bg-zinc-800">Cancel</button>
              <button onClick={() => doDelete(deleteTarget.id)} className="px-3 py-1.5 rounded-lg text-xs text-white bg-red-600 hover:bg-red-500">Delete</button>
            </div>
          </div>
        </div>
      )}
    </aside>
  )
}
