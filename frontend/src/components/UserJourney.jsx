import { api } from '../api.js';
import { usePolling } from '../hooks.js';
import { TYPE_META } from './StatCards.jsx';

export default function UserJourney({ user }) {
  const { data, error } = usePolling(() => (user ? api.userEvents(user, 30) : Promise.resolve([])), [user], 5000);
  if (!user) return <p className="muted">Click a user in the live feed to see their journey.</p>;
  if (error) return <p className="banner">{error}</p>;
  if (!data) return <p className="muted">Loading…</p>;
  return (
    <div>
      <p><strong>{user}</strong> · {data.length} recent events</p>
      <ul className="journey">
        {data.map((e) => (
          <li key={e.event_id}>
            <span className="dot" style={{ background: TYPE_META[e.event_type]?.color }} />
            <span className="muted">{new Date(e.event_time).toLocaleTimeString()}</span>{' '}
            {e.event_type} <span className="mono">{e.page_url}</span>
            {e.element_id ? <span className="mono"> #{e.element_id}</span> : null}
          </li>
        ))}
      </ul>
    </div>
  );
}
