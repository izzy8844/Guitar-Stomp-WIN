/**
 * API layer — all requests go through Electron IPC → main process → Python backend.
 * No direct HTTP connections from the renderer process.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function getElectronAPI(): any {
  if (typeof window !== 'undefined' && window.electronAPI) {
    return window.electronAPI;
  }
  return null;
}

/**
 * Generic API request via Electron IPC → main process → Python backend (stdio JSON-RPC).
 * In v2, there is no HTTP backend. All requests must go through Electron IPC.
 */
async function apiRequest<T>(method: string, path: string, body?: unknown, filePath?: string): Promise<T> {
  const api = getElectronAPI();
  if (!api) {
    throw new Error('Backend communication requires Electron (no HTTP fallback in v2)');
  }
  return api.invoke('api-request', { method, path, body, filePath });
}

// ─── Types ────────────────────────────────────────────────────────────────────

export interface MappingFileInfo {
  filename: string
  tone_count: number
  plugin_name?: string
  path?: string
}

export interface MappingTone {
  name: string
  pc: number
  uid: string
}

export interface MidiPortRaw {
  index: number
  name: string
}

export interface PluginInfo {
name: string
id?: string
is_hardware?: boolean
}

export interface PresetInfo {
  name: string
  uid?: string
  uid_path?: string
  source?: string
  path?: string
  plugin?: string
}

export interface AudioFileInfo {
  filename: string
  path: string
  duration_sec?: number
}

export interface ProjectSummary {
  id: string
  name: string
  trigger_count: number
  updated_at: string
  is_demo?: boolean
}

export interface TriggerPoint {
  id: string
  time: number
  tone_name: string
  program: number
  color: string
  bank?: number | null
}

export interface Project {
  id: string
  name: string
  triggers: TriggerPoint[]
  audio_path?: string
  audio_duration_sec?: number
  playback_settings?: Record<string, unknown>
  is_demo?: boolean
  created_at?: string
  updated_at?: string
}

export interface AutoSetupResult {
  status: 'ready' | 'auto_mapped' | 'no_user_presets' | 'no_plugins'
  plugin: string | null
  user_presets: Array<{ name: string; pc: number; uid: string }>
  mapping_installed: boolean
  mapping_file?: string
  installed_path?: string
}

export interface AutoMapResult {
  success: boolean
  installed_path: string
  xml: string
  filename: string
  mapping_count: number
}

// ─── MIDI APIs ────────────────────────────────────────────────────────────────

export async function fetchMidiPorts(): Promise<{ ports: MidiPortRaw[] }> {
  return apiRequest('GET', '/api/midi/ports');
}

export async function fetchMappingFiles(plugin: string): Promise<{ files: MappingFileInfo[] }> {
  const data = await apiRequest<MappingFileInfo[] | { files: MappingFileInfo[] }>('GET', `/api/midi/mappings?plugin=${encodeURIComponent(plugin)}`);
  const files = Array.isArray(data) ? data : (data.files || []);
  return { files };
}

export async function fetchMappingTones(plugin: string, filename: string): Promise<{ tones: MappingTone[] }> {
  const data = await apiRequest<MappingTone[] | { tones: MappingTone[] }>('GET', `/api/midi/mappings/${encodeURIComponent(plugin)}/${encodeURIComponent(filename)}/tones`);
  const tones = Array.isArray(data) ? data : (data.tones || []);
  return { tones };
}

export async function testMidi(portName: string, pc: number): Promise<{ success: boolean }> {
  return apiRequest('POST', '/api/midi/test', { port_name: portName, program: pc, channel: 0 });
}

export async function selectMidiPort(portName: string): Promise<{ success: boolean }> {
  return apiRequest('POST', '/api/midi/select-port', { port: portName });
}

// ─── Plugin & Preset APIs ─────────────────────────────────────────────────────

export async function fetchPlugins(): Promise<PluginInfo[]> {
  return apiRequest('GET', '/api/plugins');
}

export async function fetchPresets(plugin: string, source?: string): Promise<PresetInfo[]> {
  const params = new URLSearchParams({ plugin });
  if (source && source !== 'all') params.set('source', source);
  return apiRequest('GET', `/api/presets?${params}`);
}

// ─── Audio APIs ───────────────────────────────────────────────────────────────

export async function uploadAudio(file: File): Promise<{ path: string; duration_sec: number; waveform?: number[] }> {
  const api = getElectronAPI();
  if (api) {
    // Electron: get the real filesystem path and send it to backend (no file copy)
    const realPath = api.getFilePath(file);
    return api.invoke('api-request', { method: 'POST', path: '/api/audio/upload', body: { path: realPath } });
  }
  // Fallback for browser dev mode: use webkitRelativePath or name
  // In dev mode the File object doesn't have a real path, so we use a workaround
  // The file input with Electron gives us path via api.getFilePath, but in pure browser
  // we need to read the file's path property (available on Electron File objects)
  const filePath = (file as unknown as { path?: string }).path || file.name;
  return apiRequest('POST', '/api/audio/upload', { path: filePath });
}

export async function fetchAudioFiles(): Promise<AudioFileInfo[]> {
  return apiRequest('GET', '/api/audio/files');
}

export async function fetchWaveform(audioPath: string, numPeaks = 500): Promise<{ peaks: number[] }> {
  const params = new URLSearchParams({ path: audioPath, num_peaks: String(numPeaks) });
  return apiRequest('GET', `/api/audio/waveform?${params}`);
}

// ─── Project CRUD APIs ────────────────────────────────────────────────────────

export async function fetchProjects(): Promise<{ projects: ProjectSummary[] }> {
  return apiRequest('GET', '/api/projects');
}

export async function fetchProject(id: string): Promise<{ project: Project }> {
  return apiRequest('GET', `/api/projects/${id}`);
}

export async function createProject(data: Partial<Project>): Promise<{ project: Project }> {
  return apiRequest('POST', '/api/projects', data);
}

export async function updateProject(id: string, data: Partial<Project>): Promise<{ project: Project }> {
  return apiRequest('PATCH', `/api/projects/${id}`, data);
}

export async function deleteProject(id: string): Promise<void> {
  await apiRequest('DELETE', `/api/projects/${id}`);
}

export async function duplicateProject(id: string, name?: string): Promise<{ project: Project }> {
  return apiRequest('POST', `/api/projects/${id}/duplicate`, name ? { name } : {});
}

// ─── Init / Auto-Setup APIs ──────────────────────────────────────────────────

export async function initAutoSetup(): Promise<AutoSetupResult> {
  return apiRequest('POST', '/api/init/auto-setup');
}

// ─── Refresh Mapping (automap) ────────────────────────────────────────────────

export async function refreshMapping(plugin: string, filename?: string): Promise<AutoMapResult> {
  const payload: Record<string, unknown> = { plugin_name: plugin };
  if (filename) payload.filename = filename;
  return apiRequest('POST', '/api/midi/automap', payload);
}

// ─── MIDI Learn APIs ──────────────────────────────────────────────────────────

export async function startLearnGuide(plugin: string, presetNames: string[], portName: string): Promise<{ session_id: string; instruction?: string }> {
  return apiRequest('POST', '/api/midi/learn/start', { plugin, preset_names: presetNames, port_name: portName });
}

export async function executeLearnStep(sessionId: string): Promise<{ name?: string; uid: string; complete?: boolean; instruction?: string }> {
  return apiRequest('POST', `/api/midi/learn/${sessionId}/execute`);
}

export async function getLearnResults(sessionId: string): Promise<{ results: Array<{ name: string; uid: string }> }> {
  return apiRequest('GET', `/api/midi/learn/${sessionId}/results`);
}
