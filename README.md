# Clickstream Tracker (Apache Cassandra + React, OpenShift-ready)

Tracks page views, impressions, clicks and interactions in Apache Cassandra and shows them on a
live React dashboard. Ships as one container (Node/Express API + built React UI).

```
Browser ──► React dashboard ──► Express API ──► Apache Cassandra
sites/SDKs ─► POST /api/events ─┘   └─ SSE live feed
```

## Cassandra data model (query-first)

| Table | Partition key | Clustering | Serves |
|---|---|---|---|
| `events_by_site_hour` | `(site_id, hour)` | `event_time DESC, event_id` | live/latest feed (TTL 7d) |
| `events_by_user` | `(user_id, day)` | `event_time DESC, event_id` | one user's journey (TTL 7d) |
| `event_counts_by_minute` | `(site_id, event_type, day)` | `minute DESC` | counter time series |
| `page_views_by_day` | `(site_id, day)` | `page_url` | counter top pages |

Time-bucketed partition keys keep partitions bounded. Tables and keyspace are created on startup.
Counters are not idempotent: a retried write can double-count, which is acceptable for dashboards.

## API

| Method | Path | Notes |
|---|---|---|
| POST | `/api/events` | one event or an array (max 100); batch accepted/rejected as a whole |
| GET | `/api/sites/:site/events?limit=` | latest events |
| GET | `/api/sites/:site/timeseries?minutes=` | per-minute counts + totals |
| GET | `/api/sites/:site/top-pages?limit=` | today's top pages |
| GET | `/api/users/:user/events?limit=` | user journey |
| GET | `/api/sites/:site/stream` | Server-Sent Events live feed |
| GET | `/healthz`, `/readyz` | liveness / readiness (readiness pings Cassandra) |

```bash
curl -X POST $URL/api/events -H 'content-type: application/json' -d '{
  "site_id":"demo-shop","event_type":"click","user_id":"u1","session_id":"s1",
  "page_url":"/cart","element_id":"buy-now"}'
```
`event_type`: `page_view | click | impression | interaction` (`click` requires `element_id`).

## Run locally

```bash
docker compose up --build        # Cassandra + app with the traffic simulator on
# open http://localhost:8080  (change the host port if 8080 is taken)
```
Dev mode: `cd backend && npm i && npm start`, `cd frontend && npm i && npm run dev`.
Tests: `cd backend && npm test`, `cd frontend && npm test`.

## Configuration (env vars)

`CASSANDRA_CONTACT_POINTS`, `CASSANDRA_PORT`, `CASSANDRA_LOCAL_DC`, `CASSANDRA_KEYSPACE`,
`CASSANDRA_REPLICATION_FACTOR`, `CASSANDRA_USERNAME/PASSWORD`, `EVENT_TTL_SECONDS`,
`SIMULATOR_ENABLED`, `SIMULATOR_EVENTS_PER_SECOND`, `PORT`.

Astra DB: set `ASTRA_BUNDLE_PATH` (Secure Connect Bundle) + `ASTRA_TOKEN`, create the keyspace in the
Astra portal and set `CASSANDRA_CREATE_KEYSPACE=false`. This path is implemented but **not tested**.

## OpenShift deployment (project `messaging-app`)

Images are built in-cluster, so no external registry is needed.

```bash
oc login --token=<token> --server=<api-url>
oc new-project messaging-app
oc apply -f openshift/01-builds.yaml
oc start-build cassandra-openshift --from-dir=cassandra --follow
oc start-build clickstream-app --from-dir=. --follow
oc apply -f openshift/02-cassandra.yaml
oc apply -f openshift/03-app.yaml
oc get route clickstream-app
```

OpenShift notes:
- Both images run as an arbitrary non-root UID (group 0) under the `restricted-v2` SCC.
- The upstream Cassandra image refuses to start with GID 0, so `cassandra/Dockerfile` adds `-R`
  and fixes group permissions.
- The Route uses edge TLS and a 1h timeout so SSE connections are not cut.
- `02-cassandra.yaml` is a **single-node demo** (RF=1, 10Gi PVC). Use a multi-node ring or an
  operator for production.

## CI/CD (GitHub Actions)

`.github/workflows/deploy.yml`:
- **Pull requests to `main`:** run backend and frontend tests only. No secrets are exposed.
- **Push to `main`:** test, then log in to OpenShift, build the app image in-cluster, and roll out the
  `clickstream-app` Deployment. Smoke-tests `/readyz` and `/` on the Route afterwards.
- Cassandra is only touched when `cassandra/` or `openshift/02-cassandra.yaml` change (this restarts
  the database). `openshift/03-app.yaml` is only re-applied when it changes. Run the workflow
  manually with `full_deploy` to force both.

Repository secrets (Settings > Secrets and variables > Actions):

| Secret | Value |
|---|---|
| `OPENSHIFT_SERVER` | API URL, e.g. `https://c107-e.us-south.containers.cloud.ibm.com:31149` |
| `OPENSHIFT_TOKEN` | token from `oc whoami -t` (user tokens expire; re-set the secret when it does) |

A namespaced service account (`github-deployer` with the `edit` role in `messaging-app`) is a better
long-lived credential than a personal login token. It exists in the project; to switch, set
`OPENSHIFT_TOKEN` to `oc get secret github-deployer-token -n messaging-app -o jsonpath='{.data.token}' | base64 -d`.

## Known limitations

- The live feed (SSE) is per pod: with several replicas, an event posted to one pod only reaches
  browsers connected to that pod. Charts, top pages and the user journey read from Cassandra and
  are consistent. Fix with a shared pub/sub or by polling Cassandra for the feed.
- No authentication on `/api/events` or the dashboard. Add it before exposing real traffic.
- Each replica runs its own simulator when `SIMULATOR_ENABLED=true`.
