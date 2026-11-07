import cassandra from 'cassandra-driver';
import { dayBucket, daysBetween, hourBucket, minuteBucket, EVENT_TYPES } from './events.js';

const { Client, types } = cassandra;
const { Uuid } = types;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Keyspace name is interpolated into CQL (it cannot be a bind marker), so validate strictly.
function assertIdentifier(name) {
  if (!/^[a-zA-Z][a-zA-Z0-9_]{0,47}$/.test(name)) throw new Error(`invalid keyspace name: ${name}`);
  return name;
}

export function clientOptions(cfg, withKeyspace) {
  const opts = { localDataCenter: cfg.localDataCenter };
  if (cfg.astraBundlePath) {
    opts.cloud = { secureConnectBundle: cfg.astraBundlePath };
    opts.credentials = { username: 'token', password: cfg.astraToken };
    delete opts.localDataCenter;
  } else {
    opts.contactPoints = cfg.contactPoints.map((h) => (h.includes(':') ? h : `${h}:${cfg.port}`));
    if (cfg.username) opts.credentials = { username: cfg.username, password: cfg.password };
  }
  if (withKeyspace) opts.keyspace = cfg.keyspace;
  const level = cfg.consistency || (cfg.astraBundlePath ? 'LOCAL_QUORUM' : undefined);
  if (level) {
    const code = types.consistencies[level.toLowerCase().replace(/_(\w)/g, (_m, c) => c.toUpperCase())];
    if (code === undefined) throw new Error(`invalid CASSANDRA_CONSISTENCY: ${level}`);
    opts.queryOptions = { consistency: code };
  }
  return opts;
}

/**
 * Data model (query-first design):
 *  - events_by_site_hour      : latest-events feed, partition (site, hour), newest first, TTL'd
 *  - events_by_user           : a user's journey, partition (user, day), newest first, TTL'd
 *  - event_counts_by_minute   : COUNTER time series, partition (site, event_type, day)
 *  - page_views_by_day        : COUNTER per page for top-pages, partition (site, day)
 */
export function schemaStatements(cfg) {
  const ks = assertIdentifier(cfg.keyspace);
  const ttl = Number(cfg.eventTtlSeconds);
  return [
    `CREATE TABLE IF NOT EXISTS ${ks}.events_by_site_hour (
       site_id text, hour timestamp, event_time timestamp, event_id uuid,
       event_type text, user_id text, session_id text, page_url text,
       element_id text, referrer text, properties map<text,text>,
       PRIMARY KEY ((site_id, hour), event_time, event_id)
     ) WITH CLUSTERING ORDER BY (event_time DESC, event_id ASC)
       AND default_time_to_live = ${ttl}`,
    `CREATE TABLE IF NOT EXISTS ${ks}.events_by_user (
       user_id text, day text, event_time timestamp, event_id uuid,
       site_id text, event_type text, session_id text, page_url text,
       element_id text, referrer text, properties map<text,text>,
       PRIMARY KEY ((user_id, day), event_time, event_id)
     ) WITH CLUSTERING ORDER BY (event_time DESC, event_id ASC)
       AND default_time_to_live = ${ttl}`,
    `CREATE TABLE IF NOT EXISTS ${ks}.event_counts_by_minute (
       site_id text, event_type text, day text, minute timestamp, count counter,
       PRIMARY KEY ((site_id, event_type, day), minute)
     ) WITH CLUSTERING ORDER BY (minute DESC)`,
    `CREATE TABLE IF NOT EXISTS ${ks}.page_views_by_day (
       site_id text, day text, page_url text, views counter,
       PRIMARY KEY ((site_id, day), page_url)
     )`,
  ];
}

export class Store {
  constructor(cfg) {
    this.cfg = cfg;
    this.client = null;
    this.ready = false;
  }

  async connect() {
    const cfg = this.cfg;
    if (cfg.astraBundlePath && !cfg.astraToken) throw new Error('ASTRA_TOKEN is required with ASTRA_BUNDLE_PATH');

    let lastErr;
    for (let attempt = 1; attempt <= cfg.connectRetries; attempt++) {
      try {
        if (cfg.createKeyspace && !cfg.astraBundlePath) {
          const bootstrap = new Client(clientOptions(cfg, false));
          await bootstrap.connect();
          await bootstrap.execute(
            `CREATE KEYSPACE IF NOT EXISTS ${assertIdentifier(cfg.keyspace)}
             WITH replication = {'class': 'SimpleStrategy', 'replication_factor': ${Number(cfg.replicationFactor)}}`,
          );
          await bootstrap.shutdown();
        }
        this.client = new Client(clientOptions(cfg, true));
        await this.client.connect();
        for (const stmt of schemaStatements(cfg)) await this.client.execute(stmt);
        this.#prepareQueries();
        this.ready = true;
        return;
      } catch (err) {
        lastErr = err;
        console.error(`[cassandra] connect attempt ${attempt}/${cfg.connectRetries} failed: ${err.message}`);
        if (this.client) await this.client.shutdown().catch(() => {});
        this.client = null;
        await sleep(cfg.connectRetryDelayMs);
      }
    }
    throw lastErr;
  }

  #prepareQueries() {
    const ks = this.cfg.keyspace;
    this.q = {
      insertFeed: `INSERT INTO ${ks}.events_by_site_hour
        (site_id, hour, event_time, event_id, event_type, user_id, session_id, page_url, element_id, referrer, properties)
        VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
      insertUser: `INSERT INTO ${ks}.events_by_user
        (user_id, day, event_time, event_id, site_id, event_type, session_id, page_url, element_id, referrer, properties)
        VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
      incMinute: `UPDATE ${ks}.event_counts_by_minute SET count = count + 1 WHERE site_id=? AND event_type=? AND day=? AND minute=?`,
      incPage: `UPDATE ${ks}.page_views_by_day SET views = views + 1 WHERE site_id=? AND day=? AND page_url=?`,
      feed: `SELECT * FROM ${ks}.events_by_site_hour WHERE site_id=? AND hour=? LIMIT ?`,
      userEvents: `SELECT * FROM ${ks}.events_by_user WHERE user_id=? AND day=? LIMIT ?`,
      counts: `SELECT minute, count FROM ${ks}.event_counts_by_minute WHERE site_id=? AND event_type=? AND day=? AND minute>=?`,
      pages: `SELECT page_url, views FROM ${ks}.page_views_by_day WHERE site_id=? AND day=?`,
    };
  }

  async ping() {
    await this.client.execute('SELECT release_version FROM system.local');
  }

  async shutdown() {
    if (this.client) await this.client.shutdown();
  }

  /** Persist one normalised event (feed + per-user journey + counters). */
  async writeEvent(ev) {
    const eventId = Uuid.random();
    const day = dayBucket(ev.event_time);
    const hour = hourBucket(ev.event_time);
    const minute = minuteBucket(ev.event_time);
    const opts = { prepare: true };

    const ops = [
      this.client.execute(
        this.q.insertFeed,
        [ev.site_id, hour, ev.event_time, eventId, ev.event_type, ev.user_id, ev.session_id, ev.page_url, ev.element_id, ev.referrer, ev.properties],
        opts,
      ),
      this.client.execute(
        this.q.insertUser,
        [ev.user_id, day, ev.event_time, eventId, ev.site_id, ev.event_type, ev.session_id, ev.page_url, ev.element_id, ev.referrer, ev.properties],
        opts,
      ),
      this.client.execute(this.q.incMinute, [ev.site_id, ev.event_type, day, minute], opts),
    ];
    if (ev.event_type === 'page_view') ops.push(this.client.execute(this.q.incPage, [ev.site_id, day, ev.page_url], opts));
    await Promise.all(ops);
    return eventId.toString();
  }

  /** Latest events for a site, walking back up to 3 hourly partitions. */
  async recentEvents(siteId, limit = 50, now = new Date()) {
    const out = [];
    let hour = hourBucket(now).getTime();
    for (let i = 0; i < 3 && out.length < limit; i++, hour -= 3600000) {
      const rs = await this.client.execute(this.q.feed, [siteId, new Date(hour), limit - out.length], { prepare: true });
      out.push(...rs.rows.map(rowToEvent));
    }
    return out;
  }

  async userEvents(userId, limit = 50, now = new Date()) {
    const out = [];
    const d = new Date(now);
    for (let i = 0; i < 2 && out.length < limit; i++, d.setUTCDate(d.getUTCDate() - 1)) {
      const rs = await this.client.execute(this.q.userEvents, [userId, dayBucket(d), limit - out.length], { prepare: true });
      out.push(...rs.rows.map(rowToEvent));
    }
    return out;
  }

  /** Per-minute counts for each event type over the last `minutes` minutes. */
  async timeseries(siteId, minutes, now = new Date()) {
    const from = minuteBucket(new Date(now.getTime() - (minutes - 1) * 60000));
    const days = daysBetween(from, now);
    const series = {};
    await Promise.all(
      EVENT_TYPES.map(async (type) => {
        const perMinute = new Map();
        for (const day of days) {
          const rs = await this.client.execute(this.q.counts, [siteId, type, day, from], { prepare: true });
          for (const row of rs.rows) perMinute.set(row.minute.getTime(), Number(row.count));
        }
        series[type] = perMinute;
      }),
    );

    const points = [];
    const totals = Object.fromEntries(EVENT_TYPES.map((t) => [t, 0]));
    for (let t = from.getTime(); t <= now.getTime(); t += 60000) {
      const point = { minute: new Date(t).toISOString() };
      for (const type of EVENT_TYPES) {
        const n = series[type].get(t) || 0;
        point[type] = n;
        totals[type] += n;
      }
      points.push(point);
    }
    return { points, totals };
  }

  async topPages(siteId, limit = 10, now = new Date()) {
    const rs = await this.client.execute(this.q.pages, [siteId, dayBucket(now)], { prepare: true });
    return rs.rows
      .map((r) => ({ page_url: r.page_url, views: Number(r.views) }))
      .sort((a, b) => b.views - a.views)
      .slice(0, limit);
  }
}

function rowToEvent(r) {
  return {
    event_id: r.event_id.toString(),
    site_id: r.site_id,
    event_type: r.event_type,
    user_id: r.user_id,
    session_id: r.session_id,
    page_url: r.page_url,
    element_id: r.element_id,
    referrer: r.referrer,
    properties: r.properties || {},
    event_time: r.event_time.toISOString(),
  };
}
