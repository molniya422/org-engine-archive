import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('electronAPI', {
  platform: process.platform,
  isElectron: true,
  // Get the actual backend port (may differ from 5172 if port was in use)
  getServerPort: (): Promise<number> => ipcRenderer.invoke('get-server-port'),
});
