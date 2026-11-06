import { config } from './config.js';
import { Store } from './db.js';
import { createApp } from './app.js';
import { startSimulator } from './simulator.js';

const store = new Store(config.cassandra);
const { app, ingest } = createApp({ store, staticDir: config.staticDir });

// Start listening immediately so /healthz works (liveness) while Cassandra is still coming up;
// /readyz keeps the pod out of the Service until the database is reachable.
const server = app.listen(config.port, () => console.log(`[server] listening on :${config.port}`));
// SSE connections are long-lived
server.keepAliveTimeout = 65000;

let stopSimulator = () => {};

store
  .connect()
  .then(() => {
    console.log(`[cassandra] connected, keyspace "${config.cassandra.keyspace}" ready`);
    if (config.simulator.enabled) {
      stopSimulator = startSimulator({ ingest, eventsPerSecond: config.simulator.eventsPerSecond });
    }
  })
  .catch((err) => {
    console.error('[cassandra] giving up:', err.message);
    process.exit(1); // let the orchestrator restart the pod
  });

async function shutdown(signal) {
  console.log(`[server] ${signal} received, shutting down`);
  stopSimulator();
  server.close();
  await store.shutdown().catch(() => {});
  process.exit(0);
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
