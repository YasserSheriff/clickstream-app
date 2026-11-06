import { TYPE_META } from './StatCards.jsx';

export default function LiveFeed({ events, onSelectUser }) {
  if (events.length === 0) return <p className="muted">Waiting for events…</p>;
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr><th>Time</th><th>Type</th><th>User</th><th>Page</th><th>Element</th></tr>
        </thead>
        <tbody>
          {events.map((e) => (
            <tr key={e.event_id}>
              <td>{new Date(e.event_time).toLocaleTimeString()}</td>
              <td><span className="tag" style={{ background: TYPE_META[e.event_type]?.color }}>{e.event_type}</span></td>
              <td><button className="link" onClick={() => onSelectUser(e.user_id)}>{e.user_id}</button></td>
              <td className="mono">{e.page_url}</td>
              <td className="mono">{e.element_id || ''}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
