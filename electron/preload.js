/**
 * Electron preload script — exposes a minimal, safe API to the renderer.
 * Runs in an isolated context (contextIsolation: true).
 *
 * v2: stdio JSON-RPC mode — no WebSocket, no TCP ports.
 */
const { contextBridge, ipcRenderer, webUtils } = require('electron');

/**
 * Errors crossing the IPC boundary lose custom properties — the main process
 * encodes the structured error code into the message as `[code:<code>] <msg>`
 * (see withErrorCode in main.js). Here we parse it back into `err.code` and
 * restore the clean message so renderer code can do `err.code === 'not_found'`.
 *
 * Electron also prefixes invoke() errors with "Error: " boilerplate, which we
 * tolerate by matching the `[code:...]` token anywhere in the message.
 */
function parseErrorCode(promise) {
  return promise.catch((err) => {
    const msg = err && err.message ? String(err.message) : '';
    const match = msg.match(/\[code:([^\]]+)\]\s*/);
    if (match) {
      err.code = match[1];
      err.message = msg.replace(match[0], '').replace(/^Error:\s*/, '');
    }
    throw err;
  });
}

contextBridge.exposeInMainWorld('electronAPI', {
  /**
   * Get the platform (darwin / win32 / linux).
   */
  platform: process.platform,

  /**
   * Get the real file path from a File object (drag-drop or <input> file picker).
   */
  getFilePath: (file) => {
    return webUtils.getPathForFile(file);
  },

  // ─── RPC: Direct method calls to Python backend ────────────────────────────

  /**
   * Call a backend RPC method directly.
   * This is the preferred API for new code.
   *
   * @param {string} method - The RPC method name (e.g. "midi.fire_trigger")
   * @param {object} params - Parameters object
   * @param {number} [timeout] - Optional timeout in ms (default 60000)
   * @returns {Promise<any>} The result from the backend
   */
  rpcCall: (method, params, timeout) => {
    return parseErrorCode(ipcRenderer.invoke('rpc-call', { method, params, timeout }));
  },

  /**
   * Fire a MIDI trigger — dedicated fast path for time-critical MIDI PC sends.
   * @param {object} triggerData - { id, pc, name, time_ms, channel }
   * @returns {Promise<{fired: boolean, id: string, pc: number}>}
   */
  fireTrigger: (triggerData) => {
    return ipcRenderer.invoke('fire-trigger', triggerData);
  },

  /**
   * Read an audio file via Electron main process.
   * For video files (MP4, MOV, etc.), ffmpeg is used to extract audio to WAV first.
   * Returns { buffer: ArrayBuffer, converted: boolean, originalSize: number }
   */
  readAudioFile: (filePath) => {
    return parseErrorCode(ipcRenderer.invoke('read-audio-file', filePath));
  },

  // ─── Legacy IPC (kept for backward compatibility during migration) ─────────

  /**
   * Invoke an IPC handler in the main process.
   * Supported: 'api-request' (maps HTTP-style calls to RPC under the hood)
   */
  invoke: (channel, ...args) => {
    const allowedChannels = ['api-request', 'rpc-call', 'fire-trigger', 'read-audio-file'];
    if (allowedChannels.includes(channel)) {
      return parseErrorCode(ipcRenderer.invoke(channel, ...args));
    }
    return Promise.reject(new Error(`IPC channel "${channel}" not allowed`));
  },

  // ─── Events from main process ──────────────────────────────────────────────

  /**
   * Listen for events pushed from the main process (e.g. backend notifications).
   * Returns a cleanup function to remove the listener.
   */
  on: (channel, callback) => {
    const allowedChannels = ['backend-event'];
    if (allowedChannels.includes(channel)) {
      const listener = (_event, ...args) => callback(...args);
      ipcRenderer.on(channel, listener);
      return () => ipcRenderer.removeListener(channel, listener);
    }
    return () => {};
  },

  /**
   * IPC: send a one-way message to the main process.
   */
  send: (channel, data) => {
    const allowed = ['log'];
    if (allowed.includes(channel)) ipcRenderer.send(channel, data);
  },
});
