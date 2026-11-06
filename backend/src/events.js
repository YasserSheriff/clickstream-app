export const EVENT_TYPES = ['page_view', 'click', 'impression', 'interaction'];

const MAX_LEN = 512;
const ID_RE = /^[A-Za-z0-9_.:\-]{1,128}$/;

export function minuteBucket(date) {
  return new Date(Math.floor(date.getTime() / 60000) * 60000);
}

export function hourBucket(date) {
  return new Date(Math.floor(date.getTime() / 3600000) * 3600000);
}

// Day bucket as 'YYYY-MM-DD' (UTC) - used as part of partition keys to bound partition size.
export function dayBucket(date) {
  return date.toISOString().slice(0, 10);
}

// All day buckets touched by [from, to].
export function daysBetween(from, to) {
  const days = [];
  const d = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate()));
  while (d <= to) {
    days.push(dayBucket(d));
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return days;
}

/**
 * Validate and normalise an incoming event. Throws Error with a message
 * suitable for returning in a 400 response.
 */
export function normalizeEvent(raw, now = new Date()) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('event must be an object');

  const { site_id, event_type, user_id, session_id, page_url, element_id, referrer, properties, event_time } = raw;

  if (!ID_RE.test(site_id || '')) throw new Error('site_id is required (1-128 chars: letters, digits, _ . : -)');
  if (!EVENT_TYPES.includes(event_type)) throw new Error(`event_type must be one of ${EVENT_TYPES.join(', ')}`);
  if (!ID_RE.test(user_id || '')) throw new Error('user_id is required (1-128 chars: letters, digits, _ . : -)');
  if (!ID_RE.test(session_id || '')) throw new Error('session_id is required (1-128 chars: letters, digits, _ . : -)');
  if (typeof page_url !== 'string' || !page_url || page_url.length > MAX_LEN) throw new Error('page_url is required (max 512 chars)');

  for (const [name, val] of Object.entries({ element_id, referrer })) {
    if (val !== undefined && (typeof val !== 'string' || val.length > MAX_LEN)) throw new Error(`${name} must be a string (max 512 chars)`);
  }
  if (event_type === 'click' && !element_id) throw new Error('element_id is required for click events');

  let props = {};
  if (properties !== undefined) {
    if (typeof properties !== 'object' || properties === null || Array.isArray(properties)) throw new Error('properties must be an object of strings');
    const entries = Object.entries(properties);
    if (entries.length > 20) throw new Error('properties supports at most 20 entries');
    for (const [k, v] of entries) {
      if (typeof v !== 'string' || k.length > 64 || v.length > MAX_LEN) throw new Error('properties keys/values must be strings (key<=64, value<=512 chars)');
    }
    props = Object.fromEntries(entries);
  }

  let time = now;
  if (event_time !== undefined) {
    time = new Date(event_time);
    if (Number.isNaN(time.getTime())) throw new Error('event_time must be a valid ISO-8601 timestamp');
    // Reject clock-skewed/backfilled events so counters stay in the live window.
    const skew = time.getTime() - now.getTime();
    if (skew > 5 * 60000) throw new Error('event_time is too far in the future');
    if (skew < -24 * 3600000) throw new Error('event_time is older than 24h');
  }

  return {
    site_id,
    event_type,
    user_id,
    session_id,
    page_url,
    element_id: element_id ?? null,
    referrer: referrer ?? null,
    properties: props,
    event_time: time,
  };
}
