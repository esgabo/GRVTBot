// Type definitions for the v2 REST API responses.
// Mirrors packages/bot/src/server/v2-router.ts. Hand-written for now;
// promote to autogen (zod schema or openapi) when the API stabilizes.

export type BotStatus = 'running' | 'paused' | 'stopped' | 'error';

export interface BotSummary {
  id: number;
  pair: string;
  direction: 'long' | 'short';
  leverage: number;
  lower_price: number;
  upper_price: number;
  num_grids: number;
  investment_usdt: number;
  grid_profit_usdt: number;
  trend_pnl_usdt: number;
  total_pnl_usdt: number;
  status: BotStatus;
  position_size: number;
  avg_entry_price: number;
  liquidation_price: number | null;
  created_at: string;
  updated_at: string;
}

export interface GridLevel {
  id: number;
  level_index: number;
  price: number;
  side: 'buy' | 'sell';
  quantity: number;
  is_filled: 0 | 1;
  pending_replace: 0 | 1;
  order_id: string | null;
}

export interface GridState {
  botId: number;
  pair: string;
  status: BotStatus;
  levels: GridLevel[];
  ticker: unknown;
  position: unknown;
  openOrders: unknown[];
  ts: number;
}

export interface Trade {
  id: number;
  side: 'buy' | 'sell';
  quantity: number;
  price: number;
  fee: number;
  round_trip_profit: number | null;
  created_at: string;
}

export interface DailySnapshot {
  id: number;
  bot_id: number;
  date: string;
  equity_usdt: number;
  realized_pnl_usdt: number;
  unrealized_pnl_usdt: number;
  num_round_trips: number;
  total_fees_usdt: number;
  funding_usdt: number;
}

export interface Roundtrip {
  id: number;
  buy_fill_id: string;
  sell_fill_id: string;
  buy_price: number;
  sell_price: number;
  size: number;
  profit: number;
  created_at: string;
}

// Kline / candlestick — both timestamps in unix MILLISECONDS (not ns).
// The bot's getKlines() already converts the GRVT ns string format.
export interface Candle {
  openTime: number;
  closeTime: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  trades: number;
}

export type CandleInterval =
  | 'CI_1_M'
  | 'CI_5_M'
  | 'CI_15_M'
  | 'CI_30_M'
  | 'CI_1_H'
  | 'CI_4_H'
  | 'CI_1_D';

export interface HealthV2 {
  status: 'ok';
  uptime: number;
  runningBots: number;
  cacheSize: number;
  memory: { rss: number; heapUsed: number };
  ts: number;
}

// API error envelope thrown by the client when a request fails.
export class ApiError extends Error {
  constructor(
    public status: number,
    public payload: unknown,
    message: string
  ) {
    super(message);
    this.name = 'ApiError';
  }
}
