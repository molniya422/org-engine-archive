import { app, BrowserWindow, ipcMain } from 'electron';
import path from 'path';

let mainWindow: BrowserWindow | null = null;
let serverPort = 5172;

// Single-instance lock — prevent multiple app windows
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

async function createWindow() {
  // Start backend server (bundled CJS, require() works)
  // __dirname = electron/dist/ → need ../../ to reach project root
  const { startServer } = require(path.join(__dirname, '../../backend-server/bundle/server.cjs'));
  const info = await startServer();
  serverPort = info.port;

  // Register IPC handler so the renderer can discover the actual port
  ipcMain.handle('get-server-port', () => serverPort);

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
  mainWindow.loadFile(path.join(__dirname, '../../frontend/dist/index.html'));

  mainWindow.on('closed', () => { mainWindow = null; });
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (mainWindow === null) createWindow();
});

// Export port for preload script
export { serverPort };
