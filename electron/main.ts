import { app, BrowserWindow, ipcMain, dialog } from 'electron';
import path from 'path';
import fs from 'fs';

let mainWindow: BrowserWindow | null = null;

// ── Dev / Packaged detection (official Electron API) ──────────────────────
const isDev = !app.isPackaged;

// ── Server port resolver (promise-based for IPC overflow) ─────────────────
let serverPort = 5172; // kept as fallback reference
let portResolvers: Array<(port: number) => void> = [];
let serverResolved = false;

/** Returns a promise that fulfils once the backend port is known. */
function waitForPort(): Promise<number> {
  if (serverResolved) return Promise.resolve(serverPort);
  return new Promise((resolve) => { portResolvers.push(resolve); });
}

/** Fulfil every pending port waiter. */
function resolvePort(port: number) {
  serverPort = port;
  serverResolved = true;
  for (const r of portResolvers) r(port);
  portResolvers = [];
}

// ── Project root resolution ───────────────────────────────────────────────
/**
 * Retrieve the project root path.
 *
 * Primary: `app.getAppPath()` — Electron's official API:
 *   - Dev   → directory that contains the project's package.json
 *   - Packed → path to `app.asar` (or the unpacked directory)
 *
 * Both layouts are transparently supported by Electron's patched require()/fs.
 *
 * Fallback: walk up from __dirname (covers edge-cases in older Electron
 * versions where getAppPath() may behave differently under asar).
 */
function resolveProjectRoot(): string {
  try {
    return app.getAppPath();
  } catch {
    // safety net: should rarely be needed
  }

  let dir: string = __dirname;
  for (let i = 0; i < 8; i++) {
    const pkg = path.join(dir, 'package.json');
    try {
      const raw = fs.readFileSync(pkg, 'utf-8');
      if (JSON.parse(raw).name === 'org-engine-editor') return dir;
    } catch { /* walk further up */ }
    dir = path.dirname(dir);
  }
  return path.join(__dirname, '..', '..');
}

// ── Backend server startup (with graceful failure) ────────────────────────
async function startBackendServer(): Promise<number> {
  const projectRoot = resolveProjectRoot();
  const serverPath = path.join(projectRoot, 'backend-server', 'bundle', 'server.cjs');

  if (!fs.existsSync(serverPath)) {
    throw new Error(`Backend server bundle not found at:\n  ${serverPath}`);
  }

  const { startServer } = require(serverPath);
  const info = await startServer();
  return info.port;
}

// ── Single-instance lock ──────────────────────────────────────────────────
let gotLock = false;
try {
  gotLock = app.requestSingleInstanceLock();
  if (gotLock) {
    app.on('second-instance', () => {
      if (mainWindow) {
        if (mainWindow.isMinimized()) mainWindow.restore();
        mainWindow.focus();
      }
    });
  }
} catch (e) {
  console.warn('Single-instance lock unavailable, continuing anyway');
}

// ── Window creation ───────────────────────────────────────────────────────
async function createWindow() {
  let port: number;
  try {
    port = await startBackendServer();
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('Backend server failed to start:', err);
    dialog.showErrorBox(
      'Server Startup Failed',
      `Could not start the backend server.\n\n${msg}\n\nThe application will now close.`,
    );
    app.quit();
    return; // unreachable but keeps strict-mode happy
  }

  resolvePort(port);

  // IPC handler — resolver handles late-renderer calls / multiple windows
  ipcMain.handle('get-server-port', () => waitForPort());

  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1024,
    minHeight: 700,
    title: '组织引擎编辑器',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
    },
  });

  // Load built frontend
  const projectRoot = resolveProjectRoot();
  const frontendPath = path.join(projectRoot, 'frontend', 'dist', 'index.html');
  console.log('[main] projectRoot=', projectRoot);
  console.log('[main] frontendPath=', frontendPath, 'exists=', fs.existsSync(frontendPath));
  console.log('[main] backendPort=', port, 'isPackaged=', app.isPackaged);

  // Open DevTools when debugging so renderer console is visible
  const wantDevtools =
    process.argv.includes('--devtools') ||
    process.argv.includes('--enable-logging') ||
    process.env.OE_DEVTOOLS === '1';
  if (wantDevtools) {
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  }

  mainWindow.webContents.on('did-fail-load', (_e, code, desc, url) => {
    console.error('[main] did-fail-load', code, desc, url);
  });
  mainWindow.webContents.on('console-message', (_e, level, message, line, sourceId) => {
    console.log(`[renderer L${level}] ${message} (${sourceId}:${line})`);
  });

  mainWindow.loadFile(frontendPath).catch((err) => {
    console.error('[main] loadFile failed', err);
  });

  mainWindow.on('closed', () => { mainWindow = null; });
}

app.whenReady().then(() => {
  if (!gotLock) return; // another instance is running
  createWindow();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (mainWindow === null) createWindow();
});