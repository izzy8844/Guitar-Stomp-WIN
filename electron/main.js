const { app, BrowserWindow, dialog, ipcMain, protocol, net: electronNet } = require('electron');
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
const { pathToFileURL } = require('url');
const { randomUUID } = require('crypto');

// --- Configuration ---
const IS_DEV = process.env.NODE_ENV === 'development';
const CUSTOM_SCHEME = 'app';

// Register custom scheme before app is ready (must be synchronous)
protocol.registerSchemesAsPrivileged([
  {
    scheme: CUSTOM_SCHEME,
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      corsEnabled: false,
    },
  },
]);

let mainWindow = null;
let backendProcess = null;

// ─────────────────────────────────────────────────────────────
// Single-instance lock — prevent two copies of the app running
// ─────────────────────────────────────────────────────────────
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });
}

// ─────────────────────────────────────────────────────────────
// stdio JSON-RPC communication with Python backend
// ─────────────────────────────────────────────────────────────

/** Pending RPC calls: id → { resolve, reject, timer } */
const pendingCalls = new Map();

/** Buffer for incomplete lines from stdout */
let stdoutBuffer = '';

/** Whether backend has sent the "ready" event */
let backendReady = false;
let backendReadyResolve = null;
const backendReadyPromise = new Promise((resolve) => { backendReadyResolve = resolve; });

/**
 * Send a JSON-RPC request to the Python backend via stdin.
 * Returns a Promise that resolves with the result or rejects with the error.
 */
function rpcCall(method, params = {}, timeoutMs = 60000) {
  return new Promise((resolve, reject) => {
    if (!backendProcess || !backendProcess.stdin.writable) {
      reject(new Error('Backend process not available'));
      return;
    }

    const id = randomUUID();
    const timer = setTimeout(() => {
      pendingCalls.delete(id);
      reject(new Error(`RPC timeout: ${method} (${timeoutMs}ms)`));
    }, timeoutMs);

    pendingCalls.set(id, { resolve, reject, timer });

    const request = JSON.stringify({ id, method, params }) + '\n';
    try {
      backendProcess.stdin.write(request);
    } catch (err) {
      pendingCalls.delete(id);
      clearTimeout(timer);
      reject(new Error(`Failed to write to backend stdin: ${err.message}`));
    }
  });
}

/**
 * Process a line of JSON from backend stdout.
 */
function handleBackendLine(line) {
  let msg;
  try {
    msg = JSON.parse(line);
  } catch {
    console.warn('[Backend] Non-JSON output:', line);
    return;
  }

  // Event (notification from backend)
  if (msg.event) {
    if (msg.event === 'ready') {
      backendReady = true;
      if (backendReadyResolve) backendReadyResolve();
      console.log('[Backend] Ready signal received');
    }
    // Forward events to renderer if needed
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('backend-event', msg);
    }
    return;
  }

  // RPC response
  if (msg.id && pendingCalls.has(msg.id)) {
    const { resolve, reject, timer } = pendingCalls.get(msg.id);
    pendingCalls.delete(msg.id);
    clearTimeout(timer);
    if (msg.error) {
      // Support both legacy string errors and new structured {code, message} format
      const errMsg = typeof msg.error === 'object' ? msg.error.message : msg.error;
      const err = new Error(errMsg || 'Unknown error');
      if (typeof msg.error === 'object' && msg.error.code) {
        err.code = msg.error.code;
      }
      reject(err);
    } else {
      resolve(msg.result);
    }
  }
}

// ─────────────────────────────────────────────────────────────
// Start Python Backend (stdio mode)
// ──────��──────────────────────────────────────────────────────

function startBackend() {
  let execPath;
  let args;
  let cwd;

  if (IS_DEV) {
    execPath = process.platform === 'win32' ? 'python' : 'python3';
    cwd = path.join(__dirname, '..', 'backend');
    args = ['main_stdio.py'];
  } else {
    const platform = process.platform;
    const exeName = platform === 'win32' ? 'guitar-autostomp-backend.exe' : 'guitar-autostomp-backend';
    // PyInstaller onedir output lives in a nested folder:
    //   Resources/backend/guitar-autostomp-backend/guitar-autostomp-backend (exe)
    //   Resources/backend/guitar-autostomp-backend/_internal/...            (deps)
    // The executable MUST run from inside that folder so it can locate _internal.
    const backendDir = path.join(process.resourcesPath, 'backend', 'guitar-autostomp-backend');
    execPath = path.join(backendDir, exeName);
    cwd = backendDir;
    args = [];  // PyInstaller entry point is main_stdio.py
  }

  console.log(`[Backend] Starting: ${execPath} ${args.join(' ')}`);
  console.log(`[Backend] CWD: ${cwd}`);

  // Verify executable exists before spawning
  if (!IS_DEV && !fs.existsSync(execPath)) {
    const msg = `Backend executable not found:\n${execPath}`;
    console.error(`[Backend] ${msg}`);
    dialog.showErrorBox('Backend Not Found', msg + '\n\nPlease reinstall the application.');
    return;
  }

  backendProcess = spawn(execPath, args, {
    cwd: cwd,
    stdio: ['pipe', 'pipe', 'pipe'],
    env: { ...process.env, PYTHONUNBUFFERED: '1' },
  });

  // Handle stdout: parse JSON lines
  backendProcess.stdout.on('data', (chunk) => {
    stdoutBuffer += chunk.toString();
    const lines = stdoutBuffer.split('\n');
    // Keep the last incomplete line in the buffer
    stdoutBuffer = lines.pop() || '';
    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed) handleBackendLine(trimmed);
    }
  });

  // Handle stderr: log for diagnostics
  let stderrBuffer = '';
  backendProcess.stderr.on('data', (data) => {
    const text = data.toString().trim();
    stderrBuffer += text + '\n';
    if (stderrBuffer.length > 4096) {
      stderrBuffer = stderrBuffer.slice(stderrBuffer.length - 4096);
    }
    console.error(`[Backend:stderr] ${text}`);
  });

  backendProcess.on('error', (err) => {
    console.error('[Backend] Failed to start:', err.message);
  });

  backendProcess.on('exit', (code) => {
    console.log(`[Backend] exited with code ${code}`);
    backendProcess = null;
    backendReady = false;

    // Reject all pending calls
    for (const [id, { reject, timer }] of pendingCalls) {
      clearTimeout(timer);
      reject(new Error('Backend process exited'));
    }
    pendingCalls.clear();

    if (code !== 0 && code !== null && !app.isQuitting) {
      if (mainWindow && !mainWindow.isDestroyed()) {
        const detail = stderrBuffer.trim()
          ? `Last error output:\n${stderrBuffer.trim().slice(-800)}`
          : 'No error output captured.';
        dialog.showErrorBox(
          'Backend Crashed',
          `The audio backend exited unexpectedly (code ${code}).\n\n${detail}\n\nPlease restart the application.`
        );
      }
    }
  });
}

// ─────────────────────────────────────────────────────────────
// IPC Handlers — renderer communicates with backend via main process
// ─────────────────────────────────────────────────────────────

// Electron's `ipcRenderer.invoke` serializes a rejected Error but DROPS any
// custom properties (like `err.code`), keeping only `message`. To let the
// renderer recover the structured error code, we prefix it into the message as
// `[code:<code>] <message>`; the preload layer parses it back into `err.code`.
function withErrorCode(promise) {
  return promise.catch((err) => {
    if (err && err.code) {
      const wrapped = new Error(`[code:${err.code}] ${err.message}`);
      throw wrapped;
    }
    throw err;
  });
}

// Unified RPC call from renderer
ipcMain.handle('rpc-call', async (_event, { method, params, timeout }) => {
  await backendReadyPromise;
  return withErrorCode(rpcCall(method, params || {}, timeout || 60000));
});

// Legacy api-request handler — maps HTTP-style calls to RPC methods
// This keeps the existing frontend api.ts working with minimal changes
ipcMain.handle('api-request', async (_event, { method: httpMethod, path: reqPath, body }) => {
  await backendReadyPromise;

  // Map HTTP routes to RPC methods
  const rpcMethod = mapHttpToRpc(httpMethod, reqPath);
  const params = buildRpcParams(httpMethod, reqPath, body);

  return withErrorCode(rpcCall(rpcMethod, params));
});

// Fire trigger — dedicated fast path (no waiting for ready, assumes already ready)
ipcMain.handle('fire-trigger', async (_event, triggerData) => {
  return rpcCall('midi.fire_trigger', triggerData, 5000);
});

/**
 * Map HTTP method + path to RPC method name.
 */
function mapHttpToRpc(httpMethod, reqPath) {
  // Parse the path
  const url = new URL(reqPath, 'http://localhost');
  const pathname = url.pathname;

  // Audio
  if (pathname === '/api/audio/upload') return 'audio.upload';
  if (pathname === '/api/audio/waveform') return 'audio.waveform';
  if (pathname === '/api/audio/serve') return 'audio.serve';

  // Projects
  if (pathname === '/api/projects' && httpMethod === 'POST') return 'projects.create';
  if (pathname === '/api/projects' && httpMethod === 'GET') return 'projects.list';
  if (pathname.match(/^\/api\/projects\/[^/]+\/duplicate$/)) return 'projects.duplicate';
  if (pathname.match(/^\/api\/projects\/[^/]+$/) && httpMethod === 'GET') return 'projects.get';
  if (pathname.match(/^\/api\/projects\/[^/]+$/) && (httpMethod === 'PUT' || httpMethod === 'PATCH')) return 'projects.update';
  if (pathname.match(/^\/api\/projects\/[^/]+$/) && httpMethod === 'DELETE') return 'projects.delete';

  // Plugins & Presets
  if (pathname === '/api/plugins') return 'plugins.list';
  if (pathname === '/api/presets') return 'presets.list';

  // MIDI
  if (pathname === '/api/midi/ports') return 'midi.ports';
  if (pathname === '/api/midi/connect') return 'midi.connect';
  if (pathname === '/api/midi/generate') return 'midi.generate';
  if (pathname === '/api/midi/automap') return 'midi.automap';
  if (pathname === '/api/midi/install') return 'midi.install';
  if (pathname === '/api/midi/test') return 'midi.test';
  if (pathname === '/api/midi/mappings' && httpMethod === 'GET') return 'midi.mappings.list';
  if (pathname.match(/^\/api\/midi\/mappings\/[^/]+\/[^/]+\/tones$/)) return 'midi.mappings.tones';
  if (pathname.match(/^\/api\/midi\/mappings\/[^/]+\/[^/]+$/) && httpMethod === 'DELETE') return 'midi.mappings.delete';

  // MIDI Learn
  if (pathname === '/api/midi/learn/start') return 'midi.learn.start';
  if (pathname.match(/^\/api\/midi\/learn\/[^/]+\/step$/)) return 'midi.learn.step';
  if (pathname.match(/^\/api\/midi\/learn\/[^/]+\/execute$/)) return 'midi.learn.execute';
  if (pathname.match(/^\/api\/midi\/learn\/[^/]+\/results$/)) return 'midi.learn.results';

  // Init
  if (pathname === '/api/init/auto-setup') return 'init.auto_setup';

  // Health
  if (pathname === '/health') return 'health';

  throw new Error(`Unknown route: ${httpMethod} ${pathname}`);
}

/**
 * Build RPC params from HTTP request path, query, and body.
 */
function buildRpcParams(httpMethod, reqPath, body) {
  const url = new URL(reqPath, 'http://localhost');
  const pathname = url.pathname;
  const query = Object.fromEntries(url.searchParams);
  let params = { ...query, ...(body || {}) };

  // Extract path parameters
  let match;

  // /api/projects/:id/duplicate
  match = pathname.match(/^\/api\/projects\/([^/]+)\/duplicate$/);
  if (match) return { project_id: match[1], ...(body || {}) };

  // /api/projects/:id
  match = pathname.match(/^\/api\/projects\/([^/]+)$/);
  if (match) {
    if (httpMethod === 'GET' || httpMethod === 'DELETE') {
      return { project_id: match[1] };
    }
    return { project_id: match[1], data: body || {} };
  }

  // /api/midi/mappings/:plugin/:filename/tones
  match = pathname.match(/^\/api\/midi\/mappings\/([^/]+)\/([^/]+)\/tones$/);
  if (match) return { plugin: decodeURIComponent(match[1]), filename: decodeURIComponent(match[2]) };

  // /api/midi/mappings/:plugin/:filename (DELETE)
  match = pathname.match(/^\/api\/midi\/mappings\/([^/]+)\/([^/]+)$/);
  if (match) return { plugin: decodeURIComponent(match[1]), filename: decodeURIComponent(match[2]) };

  // /api/midi/learn/:session_id/step
  match = pathname.match(/^\/api\/midi\/learn\/([^/]+)\/step$/);
  if (match) return { session_id: match[1] };

  // /api/midi/learn/:session_id/execute
  match = pathname.match(/^\/api\/midi\/learn\/([^/]+)\/execute$/);
  if (match) return { session_id: match[1] };

  // /api/midi/learn/:session_id/results
  match = pathname.match(/^\/api\/midi\/learn\/([^/]+)\/results$/);
  if (match) return { session_id: match[1] };

  // Query params for GET requests
  if (httpMethod === 'GET') {
    // Convert numeric strings
    for (const [key, val] of Object.entries(params)) {
      if (/^\d+$/.test(val)) params[key] = parseInt(val);
    }
    return params;
  }

  return params;
}

// ─────────────────────────────────────────────────────────────
// Create Main Window
// ─────────────────────────────────────────────────────────────

function createWindow() {
  const isMac = process.platform === 'darwin';
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1024,
    minHeight: 700,
    title: 'Guitar AutoStomp',
    // macOS: hide native title bar and show traffic-light buttons in custom position
    // Windows/Linux: use default frame (draggable title bar with min/max/close)
    ...(isMac ? {
      titleBarStyle: 'hiddenInset',
      trafficLightPosition: { x: 16, y: 14 },
    } : {}),
    backgroundColor: '#0a0a0a',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
    },
  });

  if (IS_DEV) {
    mainWindow.loadURL('http://127.0.0.1:3000');
  } else {
    mainWindow.loadURL(`${CUSTOM_SCHEME}://renderer/`);
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// ─────────────────────────────────────────────────────────────
// Custom Protocol Handler
// ─────────────────────────────────────────────────────────────

function registerCustomProtocol() {
  let rendererDir = path.join(process.resourcesPath, 'renderer');
  if (!fs.existsSync(rendererDir)) {
    rendererDir = path.join(__dirname, '..', 'out');
  }

  protocol.handle(CUSTOM_SCHEME, (request) => {
    const url = new URL(request.url);
    let filePath = decodeURIComponent(url.pathname);
    let fullPath = path.join(rendererDir, filePath);

    if (!path.extname(fullPath)) {
      const indexPath = path.join(fullPath, 'index.html');
      if (fs.existsSync(indexPath)) {
        fullPath = indexPath;
      } else {
        const htmlPath = fullPath + '.html';
        if (fs.existsSync(htmlPath)) {
          fullPath = htmlPath;
        } else {
          fullPath = path.join(rendererDir, 'index.html');
        }
      }
    }

    const resolved = path.resolve(fullPath);
    if (!resolved.startsWith(rendererDir)) {
      return new Response('Forbidden', { status: 403 });
    }

    if (!fs.existsSync(resolved)) {
      return new Response('Not Found', { status: 404 });
    }

    return electronNet.fetch(pathToFileURL(resolved).href);
  });

  console.log(`[App] Custom protocol "${CUSTOM_SCHEME}://" registered, serving from: ${rendererDir}`);
}

// ─────────────────────────────────────────────────────────────
// App Lifecycle
// ─────────────────────────────────────────────────────────────

app.whenReady().then(async () => {
  console.log('[App] Starting Guitar AutoStomp...');
  console.log(`[App] IS_DEV: ${IS_DEV}`);
  console.log(`[App] resourcesPath: ${process.resourcesPath}`);
  console.log('[App] Communication: stdio JSON-RPC (no TCP ports)');

  if (!IS_DEV) {
    registerCustomProtocol();
  }

  createWindow();
  console.log('[App] Window opened.');

  // Start backend — communicates via stdin/stdout pipe, no ports needed
  startBackend();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', () => {
  app.isQuitting = true;
  // Kill backend process — since it's our child process using stdio,
  // closing stdin will cause it to exit gracefully
  if (backendProcess) {
    try {
      backendProcess.stdin.end();  // Close stdin → Python reads EOF → exits
    } catch {}
    // Give it a moment, then force kill
    // Note: SIGTERM is not supported on Windows; calling kill() with no args
    // sends SIGTERM on Unix and terminates the process on Windows.
    setTimeout(() => {
      if (backendProcess) {
        try { backendProcess.kill(); } catch {}
        backendProcess = null;
      }
    }, 1000);
  }
});

app.on('activate', () => {
  if (mainWindow === null && app.isReady()) {
    createWindow();
  }
});
