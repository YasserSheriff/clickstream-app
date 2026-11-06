import test from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../src/app.js';

function fakeStore() {
  const written = [];
  return {
    ready: true,
    written,
    ping: async () => {},
    writeEvent: async (ev) => {
      written.push(ev);
      return `id-${written.length}`;
    },
    recentEvents: async (site, limit) => [{ site, limit }],
    userEvents: async (user, limit) => [{ user, limit }],
    timeseries: async (site, minutes) => ({ points: [], totals: {}, site, minutes }),
    topPages: async (site, limit) => [{ page_url: '/', views: 1, site, limit }],
  };
}

async function withServer(store, fn) {
  const { app } = createApp({ store });
  const server = app.listen(0);
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    await fn(base);
  } finally {
    server.closeAllConnections?.();
    await new Promise((r) => server.close(r));
  }
}

const ev = { site_id: 's1', event_type: 'page_view', user_id: 'u1', session_id: 'x1', page_url: '/' };
const post = (base, body) => fetch(`${base}/api/events`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });

test('health endpoints', async () => {
  await withServer(fakeStore(), async (base) => {
    assert.equal((await fetch(`${base}/healthz`)).status, 200);
    assert.equal((await fetch(`${base}/readyz`)).status, 200);
  });
});

test('readyz is 503 when the store is not ready', async () => {
  const store = fakeStore();
  store.ready = false;
  await withServer(store, async (base) => {
    assert.equal((await fetch(`${base}/readyz`)).status, 503);
  });
});

test('POST /api/events accepts single and batch events', async () => {
  const store = fakeStore();
  await withServer(store, async (base) => {
    let r = await post(base, ev);
    assert.equal(r.status, 202);
    assert.equal((await r.json()).accepted, 1);
    r = await post(base, [ev, { ...ev, event_type: 'click', element_id: 'b' }]);
    assert.equal((await r.json()).accepted, 2);
    assert.equal(store.written.length, 3);
  });
});

test('POST /api/events rejects invalid payloads and writes nothing for a bad batch', async () => {
  const store = fakeStore();
  await withServer(store, async (base) => {
    let r = await post(base, { ...ev, event_type: 'bogus' });
    assert.equal(r.status, 400);
    r = await post(base, [ev, { ...ev, user_id: '' }]);
    assert.equal(r.status, 400);
    r = await post(base, []);
    assert.equal(r.status, 400);
    r = await post(base, Array.from({ length: 101 }, () => ev));
    assert.equal(r.status, 400);
    assert.equal(store.written.length, 0);
  });
});

test('query endpoints clamp parameters', async () => {
  await withServer(fakeStore(), async (base) => {
    assert.equal((await (await fetch(`${base}/api/sites/s1/events?limit=9999`)).json())[0].limit, 200);
    assert.equal((await (await fetch(`${base}/api/sites/s1/events?limit=abc`)).json())[0].limit, 50);
    assert.equal((await (await fetch(`${base}/api/sites/s1/timeseries?minutes=0`)).json()).minutes, 1);
    assert.equal((await (await fetch(`${base}/api/sites/s1/top-pages`)).json())[0].limit, 10);
    assert.equal((await (await fetch(`${base}/api/users/u1/events`)).json())[0].user, 'u1');
  });
});

test('SSE stream delivers ingested events to subscribers of that site', async () => {
  await withServer(fakeStore(), async (base) => {
    const ctrl = new AbortController();
    const res = await fetch(`${base}/api/sites/s1/stream`, { signal: ctrl.signal });
    assert.match(res.headers.get('content-type'), /^text\/event-stream/);
    const reader = res.body.getReader();
    await reader.read(); // ": connected"
    await post(base, { ...ev, site_id: 'other' }); // different site: must not be delivered
    await post(base, ev);
    const dec = new TextDecoder();
    let buf = '';
    while (!buf.includes('data:')) buf += dec.decode((await reader.read()).value);
    const payload = JSON.parse(buf.split('data: ')[1]);
    assert.equal(payload.site_id, 's1');
    assert.equal(payload.event_id, 'id-2');
    ctrl.abort();
  });
});
