import { contextBridge, ipcRenderer } from 'electron';

const DEFAULT_TIMEOUT_MS = 10_000;
const DEFAULT_RETRIES = 3;
const DEFAULT_RETRY_DELAY_MS = 250;

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Invoke the main-process IPC handler with bounded retry + timeout.
 *
 * The IPC handler in main.ts now returns a Promise that fulfils only
 * after the backend has started (or rejects if start fails). This wrapper
 * protects the renderer against:
 *   - the backend taking longer than usual to bind (e.g. slow disk / AV scan)
 *   - the IPC pipe being momentarily busy during heavy start-up I/O
 */
async function invokeWithRetry<T>(
  channel: string,
  timeoutMs: number = DEFAULT_TIMEOUT_MS,
  retries: number = DEFAULT_RETRIES,
  retryDelayMs: number = DEFAULT_RETRY_DELAY_MS,
): Promise<T> {
  let lastErr: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      // Race the IPC invoke against a timeout
      return await Promise.race([
        ipcRenderer.invoke(channel),
        new Promise<T>((_resolve, reject) => {
          setTimeout(
            () => reject(new Error(`IPC '${channel}' timed out after ${timeoutMs}ms`)),
            timeoutMs,
          );
        }),
      ]);
    } catch (err) {
      lastErr = err;
      if (attempt < retries) await delay(retryDelayMs);
    }
  }
  throw lastErr instanceof Error
    ? lastErr
    : new Error(`IPC '${channel}' failed: ${String(lastErr)}`);
}

contextBridge.exposeInMainWorld('electronAPI', {
  platform: process.platform,
  isElectron: true,
  // Get the actual backend port (may differ from 5172 if port was in use).
  // Waits for the backend to start and retries on transient IPC failures.
  getServerPort: (
    options: { timeoutMs?: number; retries?: number; retryDelayMs?: number } = {},
  ): Promise<number> =>
    invokeWithRetry<number>(
      'get-server-port',
      options.timeoutMs,
      options.retries,
      options.retryDelayMs,
    ),
});
