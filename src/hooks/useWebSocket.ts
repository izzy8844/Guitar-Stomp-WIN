'use client'
/**
 * useWebSocket — v2 stdio JSON-RPC mode.
 *
 * In v2, there is NO WebSocket connection. The Python backend communicates
 * via stdin/stdout through Electron's main process.
 *
 * This hook now:
 *  - Initializes backend state on mount (MIDI ports, plugin list)
 *  - Listens for backend events via IPC (backend 'ready' notification)
 *
 * The name "useWebSocket" is kept for file-level compatibility.
 */
import { useEffect, useCallback } from 'react'
import { usePlaybackStore } from '@/stores/playbackStore'
import { useMapperStore } from '@/stores/mapperStore'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function getElectronAPI(): any {
  if (typeof window !== 'undefined' && window.electronAPI) {
    return window.electronAPI;
  }
  return null;
}

export function useWebSocket() {
  /**
   * Initialize: fetch MIDI ports and mark connection as ready.
   */
  const initialize = useCallback(async () => {
    const api = getElectronAPI();
    if (!api) return;

    const pb = usePlaybackStore.getState();

    try {
      // Mark as connected immediately — stdio is always "connected"
      pb.setWsConnected(true);
      pb.setWsStatus('connected');

      // Fetch MIDI ports
      const portsResult = await api.rpcCall('midi.ports', {});
      if (portsResult?.ports) {
        const portNames = portsResult.ports.map((p: { name: string }) => p.name);
        pb.setMidiPorts(portNames);
        useMapperStore.getState().setMidiPorts(portNames);
        if (portNames.length > 0 && !pb.currentMidiPort) {
          pb.setCurrentMidiPort(portNames[0]);
        }
      }
    } catch (err) {
      console.warn('[useWebSocket] Init error:', err);
      pb.setWsStatus('error');
    }
  }, []);

  useEffect(() => {
    const api = getElectronAPI();
    if (!api) {
      // Dev browser mode without Electron — limited functionality
      usePlaybackStore.getState().setWsStatus('disconnected');
      return;
    }

    // Listen for backend events (notifications from Python process)
    const cleanup = api.on('backend-event', (msg: { event?: string; [key: string]: unknown }) => {
      if (!msg) return;
      if (msg.event === 'ready') {
        // Backend just became ready — initialize
        initialize();
      }
    });

    // Initialize immediately (backend may already be ready)
    initialize();

    return () => {
      cleanup();
      usePlaybackStore.getState().setWsConnected(false);
      usePlaybackStore.getState().setWsStatus('disconnected');
    };
  }, [initialize]);
}
