// Bot Detail page — hosts the GridChart hero plus a header strip and a
// stats summary. The fills/orders/funding tabs land in B.5; this page is
// scoped to "show me the chart" for B.4.

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { api } from '@/lib/api-client';
import type { GridLevel, GridState } from '@/lib/api-types';
import { useWsChannel } from '@/lib/use-ws-channel';
import { formatPercent, formatPnl, formatSize, formatUsd } from '@/lib/format';
import { Card } from '@/components/primitives/card';
import { Mono } from '@/components/primitives/mono';
import { StatCard } from '@/components/primitives/stat-card';
import { StatusPill } from '@/components/primitives/status-pill';
import { Delta } from '@/components/primitives/delta';
import {
  FILL_FLASH_DURATION_MS,
  GridChart,
} from '@/components/charts/grid-chart';

interface BotTick {
  id: number;
  status: 'running' | 'paused' | 'stopped' | 'error';
  positionSize: number;
  avgEntryPrice: number;
  gridProfit: number;
  trendPnl: number;
  totalPnl: number;
}

interface FillEvent {
  bot_id?: number;
  level_index?: number;
  side?: 'buy' | 'sell';
  price?: number;
}

export function BotDetailPage() {
  const { id } = useParams();
  const botId = Number(id ?? '42');
  const queryClient = useQueryClient();

  // Bot summary (low-frequency)
  const botQuery = useQuery({
    queryKey: ['bot', botId],
    queryFn: () => api.getBot(botId),
    staleTime: 5_000,
  });

  // Grid state — levels + ticker + position. Polled every 3s as the WS
  // dispatcher only pushes summary ticks; level state changes warrant a
  // refresh from REST.
  const gridStateQuery = useQuery<GridState>({
    queryKey: ['gridState', botId],
    queryFn: () => api.getGridState(botId),
    refetchInterval: 3_000,
  });

  // Candles — 1H, last ~7 days. Cached on the server (30s for 1H).
  const candlesQuery = useQuery({
    queryKey: ['candles', botQuery.data?.bot.pair, 'CI_1_H'],
    queryFn: () =>
      api.getCandles(botQuery.data?.bot.pair ?? 'ETH_USDT_Perp', 'CI_1_H', 200),
    enabled: !!botQuery.data?.bot.pair,
    refetchInterval: 60_000,
  });

  // Live tick from WS — overrides the REST snapshot when present.
  const [tick, setTick] = useState<BotTick | null>(null);
  useWsChannel<BotTick>(`bot:${botId}`, (msg) => {
    if (msg.type === 'tick') setTick(msg.data);
  });

  // Fill flash animation: detect levels that just transitioned filled→active
  // (or vice versa) and surface them to GridChart for ~600ms.
  const prevFilledRef = useRef<Set<number>>(new Set());
  const [recentlyFilled, setRecentlyFilled] = useState<Set<number>>(new Set());

  useEffect(() => {
    const levels = gridStateQuery.data?.levels;
    if (!levels) return;
    const currentFilled = new Set(
      levels.filter((l) => l.is_filled === 1).map((l) => l.level_index)
    );
    const prev = prevFilledRef.current;
    const transitioned: number[] = [];
    for (const idx of currentFilled) {
      if (!prev.has(idx)) transitioned.push(idx);
    }
    for (const idx of prev) {
      if (!currentFilled.has(idx)) transitioned.push(idx);
    }
    prevFilledRef.current = currentFilled;

    if (transitioned.length === 0) return;
    setRecentlyFilled(new Set(transitioned));
    const timer = window.setTimeout(() => {
      setRecentlyFilled(new Set());
    }, FILL_FLASH_DURATION_MS);
    return () => window.clearTimeout(timer);
  }, [gridStateQuery.data?.levels]);

  // WS-driven fill events: when the bus pushes a `fill` for this bot,
  // bump the gridState query so the levels refresh immediately.
  useWsChannel<FillEvent>('fills', (msg) => {
    if (msg.type !== 'fill') return;
    if (msg.data.bot_id != null && msg.data.bot_id !== botId) return;
    void queryClient.invalidateQueries({ queryKey: ['gridState', botId] });
  });

  if (botQuery.isPending) return <PageSkeleton />;
  if (botQuery.isError) {
    return (
      <Card className="border-danger/40">
        <h2 className="text-lg font-semibold text-danger mb-2">
          Failed to load bot {botId}
        </h2>
        <p className="text-sm text-text-muted">
          {(botQuery.error as Error).message}
        </p>
      </Card>
    );
  }

  const bot = botQuery.data.bot;
  const status = tick?.status ?? bot.status;
  const positionSize = tick?.positionSize ?? bot.position_size;
  const avgEntry = tick?.avgEntryPrice ?? bot.avg_entry_price;
  const totalPnl = tick?.totalPnl ?? bot.total_pnl_usdt;
  const gridProfit = tick?.gridProfit ?? bot.grid_profit_usdt;
  const trendPnl = tick?.trendPnl ?? bot.trend_pnl_usdt;
  const equity = bot.investment_usdt + totalPnl;
  const equityPct = (totalPnl / bot.investment_usdt) * 100;

  const markPrice = useMarkPrice(gridStateQuery.data);
  const candles = candlesQuery.data?.candles ?? [];
  const levels: GridLevel[] = gridStateQuery.data?.levels ?? [];

  return (
    <div className="flex flex-col gap-6">
      {/* Page header */}
      <div className="flex items-center gap-3 flex-wrap">
        <h1 className="text-2xl font-semibold tracking-tight">
          Bot {bot.id}
        </h1>
        <StatusPill status={status} />
        <span className="text-sm text-text-muted">
          {bot.pair} · {bot.direction.toUpperCase()} · {bot.leverage}x
        </span>
      </div>

      {/* Top stat strip */}
      <div className="grid grid-cols-2 md:grid-cols-6 gap-px bg-border-subtle rounded-lg overflow-hidden">
        <StatCard
          label="Equity"
          value={formatUsd(equity)}
          delta={<Delta value={equityPct} format={formatPercent} />}
        />
        <StatCard
          label="Total PnL"
          value={
            <span
              className={
                totalPnl > 0
                  ? 'text-success'
                  : totalPnl < 0
                    ? 'text-danger'
                    : 'text-text-primary'
              }
            >
              {formatPnl(totalPnl)}
            </span>
          }
        />
        <StatCard label="Realized" value={formatPnl(gridProfit)} />
        <StatCard
          label="Unrealized"
          value={
            <span
              className={
                trendPnl > 0
                  ? 'text-success'
                  : trendPnl < 0
                    ? 'text-danger'
                    : 'text-text-primary'
              }
            >
              {formatPnl(trendPnl)}
            </span>
          }
        />
        <StatCard
          label="Position"
          value={`${formatSize(positionSize)}`}
          delta={
            <span className="text-xs text-text-muted">
              @ <Mono>{formatUsd(avgEntry)}</Mono>
            </span>
          }
        />
        <StatCard
          label="Liquidation"
          value={
            bot.liquidation_price != null && bot.liquidation_price > 0
              ? formatUsd(bot.liquidation_price)
              : '—'
          }
        />
      </div>

      {/* GridChart hero */}
      <Card className="p-0 overflow-hidden">
        <div className="flex items-center justify-between px-5 py-3 border-b border-border-subtle">
          <div>
            <h2 className="text-sm font-semibold text-text-primary">
              Grid Chart
            </h2>
            <p className="text-2xs uppercase tracking-wider text-text-muted mt-0.5">
              {bot.pair} · 1H · {levels.length} levels
            </p>
          </div>
          <ChartLegend />
        </div>
        <div className="h-[480px] md:h-[560px]">
          {candlesQuery.isPending ? (
            <ChartSkeleton message="Loading candles…" />
          ) : candlesQuery.isError ? (
            <ChartSkeleton
              message={`Failed to load candles: ${(candlesQuery.error as Error).message}`}
              error
            />
          ) : (
            <GridChart
              candles={candles}
              levels={levels}
              markPrice={markPrice}
              entryPrice={avgEntry}
              liquidationPrice={bot.liquidation_price}
              recentlyFilled={recentlyFilled}
            />
          )}
        </div>
      </Card>
    </div>
  );
}

function ChartLegend() {
  return (
    <div className="hidden md:flex items-center gap-4 text-2xs">
      <LegendDot color="bg-success" label="BUY" />
      <LegendDot color="bg-danger" label="SELL" />
      <LegendDot color="bg-border-strong" label="FILLED" />
      <LegendDot color="bg-warning" label="PENDING" />
      <LegendDot color="bg-primary" label="MARK" />
    </div>
  );
}

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-text-muted uppercase tracking-wider">
      <span className={`inline-block h-0.5 w-3 ${color}`} />
      {label}
    </span>
  );
}

function ChartSkeleton({
  message,
  error,
}: {
  message: string;
  error?: boolean;
}) {
  return (
    <div className="flex items-center justify-center h-full">
      <p
        className={
          error ? 'text-sm text-danger' : 'text-sm text-text-muted animate-pulse'
        }
      >
        {message}
      </p>
    </div>
  );
}

function PageSkeleton() {
  return (
    <div className="flex flex-col gap-6 animate-pulse">
      <div className="h-8 w-48 bg-bg-elevated rounded" />
      <div className="grid grid-cols-2 md:grid-cols-6 gap-px bg-border-subtle rounded-lg overflow-hidden">
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="h-24 bg-bg-elevated" />
        ))}
      </div>
      <div className="h-[480px] bg-bg-elevated rounded-lg" />
    </div>
  );
}

// Pull a numeric mark price out of the grid-state ticker payload.
// GRVT ticker shape varies; we look for the most likely fields.
function useMarkPrice(state: GridState | undefined): number | null {
  const ticker = state?.ticker as
    | { mark_price?: string | number; last_price?: string | number; price?: string | number }
    | undefined;
  if (!ticker) return null;
  const candidate = ticker.mark_price ?? ticker.last_price ?? ticker.price;
  if (candidate == null) return null;
  const num = typeof candidate === 'string' ? parseFloat(candidate) : candidate;
  return Number.isFinite(num) ? num : null;
}
