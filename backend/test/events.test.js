import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeEvent, minuteBucket, hourBucket, dayBucket, daysBetween } from '../src/events.js';

const valid = { site_id: 's1', event_type: 'page_view', user_id: 'u1', session_id: 'sess1', page_url: '/home' };
const now = new Date('2026-11-06T10:15:42.123Z');

test('normalizeEvent accepts a valid event and fills defaults', () => {
  const ev = normalizeEvent(valid, now);
  assert.equal(ev.event_time.getTime(), now.getTime());
  assert.equal(ev.element_id, null);
  assert.deepEqual(ev.properties, {});
});

test('normalizeEvent rejects bad input', () => {
  const bad = [
    null,
    [],
    { ...valid, site_id: '' },
    { ...valid, site_id: 'has space' },
    { ...valid, event_type: 'nope' },
    { ...valid, user_id: undefined },
    { ...valid, page_url: '' },
    { ...valid, event_type: 'click' }, // click needs element_id
    { ...valid, properties: { a: 1 } },
    { ...valid, properties: [] },
    { ...valid, event_time: 'garbage' },
    { ...valid, event_time: '2026-11-06T11:15:00Z' }, // future
    { ...valid, event_time: '2026-11-04T10:15:00Z' }, // too old
    { ...valid, page_url: 'x'.repeat(513) },
  ];
  for (const b of bad) assert.throws(() => normalizeEvent(b, now), Error, JSON.stringify(b));
});

test('click with element_id is valid', () => {
  assert.equal(normalizeEvent({ ...valid, event_type: 'click', element_id: 'btn' }, now).element_id, 'btn');
});

test('time buckets', () => {
  assert.equal(minuteBucket(now).toISOString(), '2026-11-06T10:15:00.000Z');
  assert.equal(hourBucket(now).toISOString(), '2026-11-06T10:00:00.000Z');
  assert.equal(dayBucket(now), '2026-11-06');
});

test('daysBetween spans midnight', () => {
  assert.deepEqual(daysBetween(new Date('2026-11-05T23:50:00Z'), new Date('2026-11-06T00:10:00Z')), ['2026-11-05', '2026-11-06']);
  assert.deepEqual(daysBetween(new Date('2026-11-06T01:00:00Z'), new Date('2026-11-06T02:00:00Z')), ['2026-11-06']);
});
