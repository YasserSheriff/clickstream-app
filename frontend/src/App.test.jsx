import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import StatCards from './components/StatCards.jsx';
import TopPages from './components/TopPages.jsx';
import LiveFeed from './components/LiveFeed.jsx';
import App from './App.jsx';

describe('StatCards', () => {
  it('shows dashes until data arrives, then totals', () => {
    const { rerender } = render(<StatCards minutes={30} />);
    expect(screen.getByTestId('stat-click')).toHaveTextContent('–');
    rerender(<StatCards minutes={30} totals={{ page_view: 1200, click: 5, impression: 0, interaction: 7 }} />);
    expect(screen.getByTestId('stat-page_view')).toHaveTextContent('1,200');
    expect(screen.getByTestId('stat-impression')).toHaveTextContent('0');
  });
});

describe('TopPages', () => {
  it('handles loading, empty and populated states', () => {
    const { rerender } = render(<TopPages />);
    expect(screen.getByText('Loading…')).toBeInTheDocument();
    rerender(<TopPages pages={[]} />);
    expect(screen.getByText('No page views today.')).toBeInTheDocument();
    rerender(<TopPages pages={[{ page_url: '/cart', views: 10 }, { page_url: '/', views: 5 }]} />);
    expect(screen.getByText('/cart')).toBeInTheDocument();
  });
});

describe('LiveFeed', () => {
  it('renders events and reports the selected user', () => {
    const onSelect = vi.fn();
    const events = [{ event_id: '1', event_time: new Date().toISOString(), event_type: 'click', user_id: 'user-7', page_url: '/cart', element_id: 'buy-now' }];
    render(<LiveFeed events={events} onSelectUser={onSelect} />);
    fireEvent.click(screen.getByText('user-7'));
    expect(onSelect).toHaveBeenCalledWith('user-7');
    expect(screen.getByText('buy-now')).toBeInTheDocument();
  });
  it('shows a waiting message when empty', () => {
    render(<LiveFeed events={[]} onSelectUser={() => {}} />);
    expect(screen.getByText('Waiting for events…')).toBeInTheDocument();
  });
});

describe('App', () => {
  let sources;
  beforeEach(() => {
    sources = [];
    globalThis.EventSource = class {
      constructor(url) { this.url = url; this.close = vi.fn(); sources.push(this); }
    };
    globalThis.fetch = vi.fn(async (url) => {
      const body = url.includes('/timeseries')
        ? { points: [], totals: { page_view: 42, click: 3, impression: 9, interaction: 1 } }
        : url.includes('/top-pages') ? [{ page_url: '/products', views: 11 }] : [];
      return { ok: true, json: async () => body };
    });
  });
  afterEach(() => vi.restoreAllMocks());

  it('loads stats for the default site and reloads when the site changes', async () => {
    render(<App />);
    await waitFor(() => expect(screen.getByTestId('stat-page_view')).toHaveTextContent('42'));
    expect(screen.getByText('/products')).toBeInTheDocument();
    expect(sources[0].url).toBe('/api/sites/demo-shop/stream');

    fireEvent.change(screen.getByLabelText('Site ID'), { target: { value: 'other-site' } });
    fireEvent.click(screen.getByText('Load'));
    await waitFor(() => expect(sources.at(-1).url).toBe('/api/sites/other-site/stream'));
    expect(sources[0].close).toHaveBeenCalled();
  });

  it('shows an error banner when the API fails', async () => {
    globalThis.fetch = vi.fn(async () => ({ ok: false, status: 500, json: async () => ({}) }));
    render(<App />);
    expect(await screen.findByRole('alert')).toHaveTextContent('HTTP 500');
  });
});
