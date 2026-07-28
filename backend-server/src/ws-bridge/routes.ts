import { FastifyInstance } from 'fastify';
import { RunManager } from '../run-manager/manager';
import { RunPersistence } from '../run-manager/persistence';

export function registerWsRoutes(app: FastifyInstance, runManager: RunManager, persistence: RunPersistence): void {
  app.get('/ws/runs/:id', { websocket: true }, (socket, req) => {
    const runId = (req.params as any).id;
    persistence.load(runId).then(state => {
      if (state) socket.send(JSON.stringify({ type: 'state_snapshot', state }));
    }).catch(err => app.log.error(err, 'Failed to load run state'));
    const onEvent = (event: any) => { try { socket.send(JSON.stringify(event)); } catch (err) { app.log.error(err, 'Failed to send event over ws'); } };
    runManager.on('event', onEvent);
    socket.on('close', () => runManager.removeListener('event', onEvent));
    socket.on('error', (err) => app.log.error(err, 'WebSocket error'));
  });
}
