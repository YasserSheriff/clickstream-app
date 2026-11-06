import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { TYPE_META } from './StatCards.jsx';

const fmtTime = (iso) => new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

export default function TrafficChart({ points }) {
  if (!points) return <p className="muted">Loading…</p>;
  if (points.every((p) => Object.keys(TYPE_META).every((t) => !p[t]))) {
    return <p className="muted">No events in this window yet.</p>;
  }
  return (
    <div className="chart" data-testid="traffic-chart">
      <ResponsiveContainer width="100%" height={280}>
        <LineChart data={points} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
          <XAxis dataKey="minute" tickFormatter={fmtTime} minTickGap={32} />
          <YAxis allowDecimals={false} />
          <Tooltip labelFormatter={fmtTime} />
          <Legend />
          {Object.entries(TYPE_META).map(([type, m]) => (
            <Line key={type} type="monotone" dataKey={type} name={m.label} stroke={m.color} dot={false} strokeWidth={2} isAnimationActive={false} />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
