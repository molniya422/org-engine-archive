import { app, BrowserWindow } from 'electron';
import path from 'path';

let mainWindow: BrowserWindow | null = null;

async function createWindow() {
  // Start backend server (bundled CJS, require() works)
  // __dirname = electron/dist/ → need ../../ to reach project root
  const { startServer } = require(path.join(__dirname, '../../backend-server/bundle/server.cjs'));
  await startServer();

  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1024,
    minHeight: 700,
    title: 'Org Engine Editor',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
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
