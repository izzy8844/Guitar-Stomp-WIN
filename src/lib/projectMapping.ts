/**
 * Project field mapping — single source of truth for translating between the
 * backend JSON shape and the frontend store shape.
 *
 * Backend (api.ts / project_manager.py):  trigger = { id: string, time, program, tone_name, color }
 * Frontend (projectStore.ts):             trigger = { id: number, time, pc,      name,      color }
 *
 * All conversions live here so the mapping stays consistent across
 * ProjectSidebar (load/select/create) and the auto-save sync path. Previously
 * these casts were duplicated inline in several places with `as unknown as`
 * escape hatches, which drifted easily.
 */
import type { Project, ProjectSummary, TriggerPoint } from './api'
import type { ProjectData, ProjectTrigger } from '@/stores/projectStore'

const DEFAULT_TRIGGER_COLOR = '#f59e0b'

/** Coerce a backend trigger id (string/uuid) into the numeric id the store uses. */
function toNumericId(id: unknown): number {
  if (typeof id === 'number' && Number.isFinite(id)) return id
  const n = Number(id)
  return Number.isFinite(n) && n !== 0 ? n : Date.now()
}

/** Backend trigger → frontend trigger. Tolerant of partial/legacy shapes. */
export function triggerToFrontend(t: TriggerPoint): ProjectTrigger {
  const raw = t as unknown as Record<string, unknown>
  const program = (raw.program ?? raw.pc ?? 0) as number
  return {
    id: toNumericId(t.id),
    time: t.time ?? 0,
    pc: program,
    name: (t.tone_name ?? (raw.name as string | undefined) ?? `Tone ${program}`) as string,
    color: t.color ?? DEFAULT_TRIGGER_COLOR,
  }
}

/** Frontend trigger → backend trigger (for create/update payloads). */
export function triggerToBackend(t: ProjectTrigger): TriggerPoint {
  return {
    id: String(t.id),
    time: t.time,
    tone_name: t.name,
    program: t.pc,
    color: t.color,
  }
}

/**
 * Backend project list summaries → lightweight frontend list rows.
 * These rows only carry the fields the sidebar list needs (id/name/count);
 * the full `triggers` array is fetched lazily when a project is opened.
 */
export function summaryToFrontendList(summaries: ProjectSummary[]): ProjectData[] {
  return summaries.map((s) => ({
    id: s.id,
    name: s.name,
    triggers: [],
    triggerCount: s.trigger_count ?? 0,
    updatedAt: s.updated_at ?? undefined,
  }))
}

/** Backend Project → frontend ProjectData (used after fetch/create/duplicate). */
export function projectToFrontend(raw: Project): ProjectData {
  return {
    id: raw.id,
    name: raw.name,
    audioFile: raw.audio_path ?? null,
    createdAt: raw.created_at ?? undefined,
    updatedAt: raw.updated_at ?? undefined,
    triggers: (raw.triggers || []).map(triggerToFrontend),
  }
}

/**
 * Frontend store snapshot → backend update payload.
 * Mirrors the fields project_manager.update_project knows how to merge.
 */
export function storeToBackendUpdate(snapshot: {
  projectName: string
  triggers: ProjectTrigger[]
  audioFile: string | null
}): Partial<Project> {
  return {
    name: snapshot.projectName,
    triggers: snapshot.triggers.map(triggerToBackend),
    audio_path: snapshot.audioFile || undefined,
  }
}
