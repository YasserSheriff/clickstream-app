import { useEffect, useRef, useState } from 'react';
import { api } from './api.js';

/** Poll an async fetcher every `intervalMs`. Keeps last good data on transient errors. */
export function usePolling(fetcher, deps, intervalMs = 5000) {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;

  useEffect(() => {
    let cancelled = false;
    setData(null);
    const tick = async () => {
      try {
        const d = await fetcherRef.current();
        if (!cancelled) {
          setData(d);
          setError(null);
        }
      } catch (e) {
        if (!cancelled) setError(e.message);
      }
    };
    tick();
    const id = setInterval(tick, intervalMs);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, intervalMs]);

  return { data, error };
}

/** Subscribe to the SSE live feed; keeps the newest `max` events. */
export function useLiveEvents(site, max = 50) {
  const [events, setEvents] = useState([]);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    setEvents([]);
    const es = new EventSource(api.streamUrl(site));
    es.onopen = () => setConnected(true);
    es.onerror = () => setConnected(false); // EventSource auto-reconnects
    es.onmessage = (m) => {
      try {
        const ev = JSON.parse(m.data);
        setEvents((prev) => [ev, ...prev].slice(0, max));
      } catch {
        /* ignore malformed frame */
      }
    };
    return () => es.close();
  }, [site, max]);

  return { events, connected };
}
