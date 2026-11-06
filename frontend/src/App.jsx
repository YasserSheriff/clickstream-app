import { useState } from 'react';
import { api } from './api.js';
import { usePolling, useLiveEvents } from './hooks.js';
import StatCards from './components/StatCards.jsx';
import TrafficChart from './components/TrafficChart.jsx';
import TopPages from './components/TopPages.jsx';
import LiveFeed from './components/LiveFeed.jsx';
import UserJourney from './components/UserJourney.jsx';

const DEFAULT_SITE = 'demo-shop';

export default function App() {
  const [siteInput, setSiteInput] = useState(DEFAULT_SITE);
  const [site, setSite] = useState(DEFAULT_SITE);
  const [minutes, setMinutes] = useState(30);
  const [selectedUser, setSelectedUser] = useState(null);

  const series = usePolling(() => api.timeseries(site, minutes), [site, minutes], 5000);
  const pages = usePolling(() => api.topPages(site), [site], 5000);
  const live = useLiveEvents(site);

  const submit = (e) => {
    e.preventDefault();
    const s = siteInput.trim();
    if (s) {
      setSite(s);
      setSelectedUser(null);
    }
  };

  return (
    <div className="app">
      <header className="header">
        <div>
          <h1>Clickstream Dashboard</h1>
          <p className="muted">Real-time page views, impressions, clicks and interactions stored in Apache Cassandra</p>
        </div>
        <form onSubmit={submit} className="controls">
          <label>
            Site
            <input value={siteInput} onChange={(e) => setSiteInput(e.target.value)} aria-label="Site ID" />
          </label>
          <button type="submit">Load</button>
          <label>
            Window
            <select value={minutes} onChange={(e) => setMinutes(Number(e.target.value))} aria-label="Time window">
              <option value={15}>15 min</option>
              <option value={30}>30 min</option>
              <option value={60}>60 min</option>
              <option value={180}>3 hours</option>
            </select>
          </label>
          <span className={`pill ${live.connected ? 'ok' : 'bad'}`}>{live.connected ? 'live' : 'reconnecting'}</span>
        </form>
      </header>

      {series.error && <div className="banner" role="alert">Could not load data: {series.error}</div>}

      <StatCards totals={series.data?.totals} minutes={minutes} />

      <section className="grid">
        <div className="card wide">
          <h2>Events per minute</h2>
          <TrafficChart points={series.data?.points} />
        </div>
        <div className="card">
          <h2>Top pages today</h2>
          <TopPages pages={pages.data} />
        </div>
        <div className="card wide">
          <h2>Live event feed</h2>
          <LiveFeed events={live.events} onSelectUser={setSelectedUser} />
        </div>
        <div className="card">
          <h2>User journey</h2>
          <UserJourney user={selectedUser} />
        </div>
      </section>
    </div>
  );
}
