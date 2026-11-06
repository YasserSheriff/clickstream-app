export const TYPE_META = {
  page_view: { label: 'Page views', color: '#2563eb' },
  impression: { label: 'Impressions', color: '#9333ea' },
  click: { label: 'Clicks', color: '#16a34a' },
  interaction: { label: 'Interactions', color: '#ea580c' },
};

export default function StatCards({ totals, minutes }) {
  return (
    <section className="stats">
      {Object.entries(TYPE_META).map(([type, meta]) => (
        <div className="card stat" key={type} style={{ borderTopColor: meta.color }}>
          <div className="muted">{meta.label} (last {minutes} min)</div>
          <div className="stat-value" data-testid={`stat-${type}`}>
            {totals ? (totals[type] ?? 0).toLocaleString() : '–'}
          </div>
        </div>
      ))}
    </section>
  );
}
