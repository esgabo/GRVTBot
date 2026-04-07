// REST client for the v2 dashboard API.
//
// In dev, VITE_API_BASE_URL is empty/"" so requests go to "/api/v2/..." and
// the Vite proxy in vite.config.ts forwards to the backend. In prod build,
// the same paths are served from the same origin (no proxy needed).
// To point at a remote backend (e.g. for staging UI hitting prod data),
// set VITE_API_BASE_URL to a full origin like "https://grvt-grid.example.com".

import {
  ApiError,
  type BotSummary,
  type Candle,
  type CandleInterval,
  type DailySnapshot,
  type GridState,
  type HealthV2,
  type Roundtrip,
  type Trade,
} from './api-types';

const BASE_URL = import.meta.env.VITE_API_BASE_URL ?? '';
const API_KEY = import.meta.env.VITE_DASHBOARD_API_KEY ?? '';

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const url = `${BASE_URL}/api/v2${path}`;
  const headers = new Headers(init.headers);
  headers.set('Accept', 'application/json');
  if (API_KEY) {
    headers.set('X-Api-Key', API_KEY);
  }
  if (init.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  let response: Response;
  try {
    response = await fetch(url, { ...init, headers });
  } catch (cause) {
    throw new ApiError(0, null, `network error: ${(cause as Error).message}`);
  }

  let payload: unknown = null;
  const contentType = response.headers.get('content-type') ?? '';
  if (contentType.includes('application/json')) {
    payload = await response.json().catch(() => null);
  }

  if (!response.ok) {
    const message =
      (payload as { error?: string; message?: string } | null)?.message ??
      (payload as { error?: string } | null)?.error ??
      `HTTP ${response.status}`;
    throw new ApiError(response.status, payload, message);
  }

  return payload as T;
}

// ── Endpoints ───────────────────────────────────────────────────────────

export const api = {
  getHealth: () => request<HealthV2>('/health'),

  getBots: () => request<{ bots: BotSummary[] }>('/bots'),
  getBot: (id: number) => request<{ bot: BotSummary }>(`/bots/${id}`),
  getGridState: (id: number) => request<GridState>(`/bots/${id}/grid-state`),

  getInstruments: () => request<{ instruments: unknown[] }>('/instruments'),
  getBalance: () => request<{ balance: unknown }>('/balance'),

  getTrades: (id: number, opts: { limit?: number } = {}) => {
    const qs = new URLSearchParams();
    if (opts.limit) qs.set('limit', String(opts.limit));
    const suffix = qs.toString() ? `?${qs.toString()}` : '';
    return request<{ trades: Trade[] }>(`/bots/${id}/trades${suffix}`);
  },

  getSnapshots: (id: number) =>
    request<{ snapshots: DailySnapshot[] }>(`/bots/${id}/snapshots`),

  getRoundtrips: (id: number) =>
    request<{ roundtrips: Roundtrip[]; count: number; totalProfit: number }>(
      `/bots/${id}/roundtrips`
    ),

  getCandles: (
    pair: string,
    interval: CandleInterval = 'CI_1_H',
    limit = 500
  ) => {
    const qs = new URLSearchParams({
      pair,
      interval,
      limit: String(limit),
    });
    return request<{ pair: string; interval: string; candles: Candle[] }>(
      `/candles?${qs.toString()}`
    );
  },
};
