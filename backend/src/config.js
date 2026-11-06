// All configuration comes from environment variables so the same image runs
// locally, in docker-compose and on OpenShift (ConfigMap / Secret).
const bool = (v, d) => (v === undefined ? d : ['1', 'true', 'yes'].includes(String(v).toLowerCase()));
const int = (v, d) => (v === undefined || v === '' ? d : parseInt(v, 10));

export const config = {
  port: int(process.env.PORT, 8080),
  cassandra: {
    contactPoints: (process.env.CASSANDRA_CONTACT_POINTS || '127.0.0.1').split(',').map((s) => s.trim()),
    port: int(process.env.CASSANDRA_PORT, 9042),
    localDataCenter: process.env.CASSANDRA_LOCAL_DC || 'datacenter1',
    keyspace: process.env.CASSANDRA_KEYSPACE || 'clickstream',
    replicationFactor: int(process.env.CASSANDRA_REPLICATION_FACTOR, 1),
    username: process.env.CASSANDRA_USERNAME || undefined,
    password: process.env.CASSANDRA_PASSWORD || undefined,
    // Optional: DataStax Astra DB (managed Cassandra) via Secure Connect Bundle + app token.
    astraBundlePath: process.env.ASTRA_BUNDLE_PATH || undefined,
    astraToken: process.env.ASTRA_TOKEN || undefined,
    // On Astra the keyspace is created in the portal; set to false to skip CREATE KEYSPACE.
    createKeyspace: bool(process.env.CASSANDRA_CREATE_KEYSPACE, true),
    eventTtlSeconds: int(process.env.EVENT_TTL_SECONDS, 7 * 24 * 3600),
    connectRetries: int(process.env.CASSANDRA_CONNECT_RETRIES, 30),
    connectRetryDelayMs: int(process.env.CASSANDRA_CONNECT_RETRY_DELAY_MS, 2000),
  },
  simulator: {
    enabled: bool(process.env.SIMULATOR_ENABLED, false),
    eventsPerSecond: int(process.env.SIMULATOR_EVENTS_PER_SECOND, 10),
  },
  staticDir: process.env.STATIC_DIR || new URL('../public', import.meta.url).pathname,
};
