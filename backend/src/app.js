import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { EVENT_TYPES, normalizeEvent } from './events.js';

const clampInt = (v, def, min, max) => {
  const n = parseInt(v, 10);
  return Number.isNaN(n) ? def : Math.min(max, Math.max(min, n));
};

/**
 * Build the express app. `store` needs: ready, ping(), writeEvent(), recentEvents(),
 * userEvents(), timeseries(), topPages().
 */
export function createApp({ store, staticDir, version = '1.0.1' }) {
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '64kb' }));

  // Live feed: SSE subscribers per site.
  const subscribers = new Map(); // siteId -> Set<res>
  const publish = (ev) => {
    const subs = subscribers.get(ev.site_id);
    if (!subs) return;
    const payload = `data: ${JSON.stringify(ev)}\n\n`;
    for (const res of subs) res.write(payload);
  };

  const ingest = async (raw) => {
    const ev = normalizeEvent(raw);
    const event_id = await store.writeEvent(ev);
    publish({ ...ev, event_id, event_time: ev.event_time.toISOString() });
    return event_id;
  };

  const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

  // --- health (OpenShift probes) ---
  app.get('/healthz', (_req, res) => res.json({ status: 'ok' })); // liveness: process is up
  app.get('/readyz', async (_req, res) => { // readiness: Cassandra reachable
    try {
      if (!store.ready) throw new Error('store not ready');
      await store.ping();
      res.json({ status: 'ready' });
    } catch (err) {
      res.status(503).json({ status: 'unavailable', error: err.message });
    }
  });
  app.get('/api/info', (_req, res) => res.json({ name: 'clickstream', version, eventTypes: EVENT_TYPES }));

  // --- ingest ---
  app.post('/api/events', wrap(async (req, res) => {
    const batch = Array.isArray(req.body) ? req.body : [req.body];
    if (batch.length === 0 || batch.length > 100) return res.status(400).json({ error: 'send 1-100 events per request' });
    let ids;
    try {
      // validate all first so a batch is accepted or rejected as a whole
      batch.forEach((e) => normalizeEvent(e));
    } catch (err) {
      return res.status(400).json({ error: err.message });
    }
    ids = await Promise.all(batch.map((e) => ingest(e)));
    res.status(202).json({ accepted: ids.length, event_ids: ids });
  }));

  // --- queries ---
  app.get('/api/sites/:site/events', wrap(async (req, res) => {
    const limit = clampInt(req.query.limit, 50, 1, 200);
    res.json(await store.recentEvents(req.params.site, limit));
  }));

  app.get('/api/sites/:site/timeseries', wrap(async (req, res) => {
    const minutes = clampInt(req.query.minutes, 30, 1, 180);
    res.json(await store.timeseries(req.params.site, minutes));
  }));

  app.get('/api/sites/:site/top-pages', wrap(async (req, res) => {
    const limit = clampInt(req.query.limit, 10, 1, 50);
    res.json(await store.topPages(req.params.site, limit));
  }));

  app.get('/api/users/:user/events', wrap(async (req, res) => {
    const limit = clampInt(req.query.limit, 50, 1, 200);
    res.json(await store.userEvents(req.params.user, limit));
  }));

  app.get('/api/sites/:site/stream', (req, res) => {
    res.set({ 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache, no-transform', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' });
    res.flushHeaders();
    res.write(': connected\n\n');
    const site = req.params.site;
    if (!subscribers.has(site)) subscribers.set(site, new Set());
    subscribers.get(site).add(res);
    // keep-alive comment so OpenShift router / proxies do not close idle connections
    const ka = setInterval(() => res.write(': ping\n\n'), 15000);
    req.on('close', () => {
      clearInterval(ka);
      subscribers.get(site)?.delete(res);
    });
  });

  // --- static React build ---
  if (staticDir && fs.existsSync(path.join(staticDir, 'index.html'))) {
    app.use(express.static(staticDir, { index: 'index.html', maxAge: '1h' }));
    app.get(/^\/(?!api\/).*/, (_req, res) => res.sendFile(path.join(staticDir, 'index.html')));
  }

  // eslint-disable-next-line no-unused-vars
  app.use((err, _req, res, _next) => {
    console.error('[error]', err);
    res.status(500).json({ error: 'internal error' });
  });

  return { app, ingest };
}
