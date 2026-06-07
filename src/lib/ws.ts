/**
 * Backend communication helper — v2 stdio JSON-RPC mode.
 *
 * In v2 there is NO WebSocket. All communication goes through Electron IPC → stdin/stdout.
 * The only time-critical path exposed here is fireTrigger(); general RPC calls go through
 * window.electronAPI.rpcCall() directly.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function getElectronAPI(): any {
  if (typeof window !== 'undefined' && window.electronAPI) {
    return window.electronAPI;
  }
  return null;
}

/**
 * Fire a MIDI trigger — time-critical path.
 * Uses a dedicated IPC channel for minimum latency. Fire-and-forget.
 */
export function fireTrigger(data: { id: string; pc: number; name: string; time_ms: number; channel?: number }): void {
  const api = getElectronAPI();
  if (api) {
    // Don't await — minimize latency
    api.fireTrigger(data).catch(() => {});
  }
}
