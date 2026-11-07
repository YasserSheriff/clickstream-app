import test from 'node:test';
import assert from 'node:assert/strict';
import cassandra from 'cassandra-driver';
import { clientOptions } from '../src/db.js';

const { consistencies } = cassandra.types;
const base = { contactPoints: ['cassandra'], port: 9042, localDataCenter: 'datacenter1', keyspace: 'clickstream' };

test('plain Cassandra keeps the driver default consistency', () => {
  assert.equal(clientOptions(base, true).queryOptions, undefined);
});

test('Astra defaults to LOCAL_QUORUM (Astra rejects ONE/LOCAL_ONE writes)', () => {
  const o = clientOptions({ ...base, astraBundlePath: '/b.zip', astraToken: 't' }, true);
  assert.equal(o.queryOptions.consistency, consistencies.localQuorum);
  assert.equal(o.credentials.username, 'token');
  assert.equal(o.localDataCenter, undefined);
});

test('CASSANDRA_CONSISTENCY overrides and is validated', () => {
  assert.equal(clientOptions({ ...base, consistency: 'LOCAL_QUORUM' }, false).queryOptions.consistency, consistencies.localQuorum);
  assert.equal(clientOptions({ ...base, consistency: 'quorum' }, false).queryOptions.consistency, consistencies.quorum);
  assert.throws(() => clientOptions({ ...base, consistency: 'bogus' }, false), /invalid CASSANDRA_CONSISTENCY/);
});
