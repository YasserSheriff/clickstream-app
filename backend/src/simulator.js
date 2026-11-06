// Generates realistic clickstream traffic so the dashboard has data without a real website.
const SITE = 'demo-shop';
const PAGES = ['/', '/products', '/products/shoes', '/products/jackets', '/cart', '/checkout', '/blog', '/support'];
const ELEMENTS = ['nav-home', 'add-to-cart', 'buy-now', 'search-box', 'hero-banner', 'footer-newsletter', 'filter-price'];
const INTERACTIONS = ['scroll_75', 'video_play', 'form_focus', 'tab_switch', 'zoom_image'];
const REFERRERS = ['https://www.google.com', 'https://news.example.com', 'direct', 'https://social.example.com'];
const AD_SLOTS = ['banner-top', 'sidebar-1', 'recommended-1', 'recommended-2'];

const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

export function randomEvent(siteId = SITE) {
  const user = `user-${1 + Math.floor(Math.random() * 200)}`;
  const base = {
    site_id: siteId,
    user_id: user,
    session_id: `${user}-s${1 + Math.floor(Math.random() * 3)}`,
    page_url: pick(PAGES),
    referrer: pick(REFERRERS),
  };
  const r = Math.random();
  if (r < 0.35) return { ...base, event_type: 'page_view' };
  if (r < 0.6) return { ...base, event_type: 'impression', element_id: pick(AD_SLOTS), properties: { campaign: `c${1 + Math.floor(Math.random() * 5)}` } };
  if (r < 0.85) return { ...base, event_type: 'click', element_id: pick(ELEMENTS) };
  return { ...base, event_type: 'interaction', element_id: pick(INTERACTIONS) };
}

export function startSimulator({ ingest, eventsPerSecond }) {
  const interval = Math.max(50, Math.floor(1000 / Math.max(1, eventsPerSecond)));
  const timer = setInterval(() => {
    ingest(randomEvent()).catch((err) => console.error('[simulator] ingest failed:', err.message));
  }, interval);
  console.log(`[simulator] generating ~${eventsPerSecond} events/s for site "${SITE}"`);
  return () => clearInterval(timer);
}
