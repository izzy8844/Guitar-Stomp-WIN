/** Backend event types (received via IPC 'backend-event' channel) */
export type BackendEvent =
  | { event: 'ready' }
  | { event: 'midi_trigger'; pc?: number; trigger_index?: number; name?: string }
  | { event: 'port_selected'; port?: string }
  | { event: 'midi_ports'; ports?: string[] }

declare global {
  interface Window {
    electronAPI?: {
      invoke: (channel: string, ...args: unknown[]) => Promise<unknown>
      rpcCall: (method: string, params?: Record<string, unknown>) => Promise<unknown>
      fireTrigger: (data: { id: string; pc: number; name: string; time_ms: number; channel?: number }) => Promise<void>
      on: (channel: string, callback: (data: unknown) => void) => () => void
      getFilePath: (file: File) => string
    }
  }
}

export {}
