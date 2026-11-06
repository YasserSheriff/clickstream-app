export default function TopPages({ pages }) {
  if (!pages) return <p className="muted">Loading…</p>;
  if (pages.length === 0) return <p className="muted">No page views today.</p>;
  const max = Math.max(...pages.map((p) => p.views));
  return (
    <ol className="toplist">
      {pages.map((p) => (
        <li key={p.page_url}>
          <div className="row">
            <span className="mono">{p.page_url}</span>
            <strong>{p.views.toLocaleString()}</strong>
          </div>
          <div className="bar"><div style={{ width: `${(p.views / max) * 100}%` }} /></div>
        </li>
      ))}
    </ol>
  );
}
