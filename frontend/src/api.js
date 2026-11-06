async function getJson(path) {
  const res = await fetch(path);
  if (!res.ok) throw new Error(`${path} -> HTTP ${res.status}`);
  return res.json();
}

const enc = encodeURIComponent;

export const api = {
  timeseries: (site, minutes = 30) => getJson(`/api/sites/${enc(site)}/timeseries?minutes=${minutes}`),
  topPages: (site, limit = 8) => getJson(`/api/sites/${enc(site)}/top-pages?limit=${limit}`),
  recentEvents: (site, limit = 50) => getJson(`/api/sites/${enc(site)}/events?limit=${limit}`),
  userEvents: (user, limit = 50) => getJson(`/api/users/${enc(user)}/events?limit=${limit}`),
  streamUrl: (site) => `/api/sites/${enc(site)}/stream`,
};
