import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '@/lib/api-client';
import { useWsChannel } from '@/lib/use-ws-channel';
import { formatPercent, formatPnl, formatSize, formatUsd } from '@/lib/format';
import { StatCard } from '@/components/primitives/stat-card';
import { StatusPill } from '@/components/primitives/status-pill';
import { Delta } from '@/components/primitives/delta';
import { Card } from '@/components/primitives/card';
import { Mono } from '@/components/primitives/mono';

// Live tick payload as published by ws-dispatcher.ts (channel `bot:N`).
interface BotTick {
  id: number;
  status: 'running' | 'paused' | 'stopped' | 'error';
  positionSize: number;
  avgEntryPrice: number;
  gridProfit: number;
  trendPnl: number;
  totalPnl: number;
}

export function OverviewPage() {
  const botsQuery = useQuery({
    queryKey: ['bots'],
    queryFn: () => api.getBots(),
    staleTime: 5_000,
  });

  // Live state from WS — falls back to REST data if WS is closed.
  const [tick, setTick] = useState<BotTick | null>(null);
  useWsChannel<BotTick>('bot:42', (msg) => {
    if (msg.type === 'tick') setTick(msg.data);
  });

  const bot = botsQuery.data?.bots.find((b) => b.id === 42) ?? botsQuery.data?.bots[0];

  if (botsQuery.isPending) {
    return <PageSkeleton />;
  }

  if (botsQuery.isError) {
    return (
      <Card className="border-danger/40">
        <h2 className="text-lg font-semibold text-danger mb-2">
          Failed to load bots
        </h2>
        <p className="text-sm text-text-muted">
          {(botsQuery.error as Error).message}
        </p>
        <p className="text-xs text-text-muted mt-3">
          Check that <code className="font-mono">VITE_DASHBOARD_API_KEY</code>{' '}
          is set in <code className="font-mono">.env.local</code>, and that the
          backend is reachable via the Vite proxy or{' '}
          <code className="font-mono">VITE_API_BASE_URL</code>.
        </p>
      </Card>
    );
  }

  if (!bot) {
    return (
      <Card>
        <h2 className="text-lg font-semibold mb-2">No bots yet</h2>
        <p className="text-sm text-text-muted">
          Create your first grid bot to start trading.
        </p>
      </Card>
    );
  }

  // Prefer live tick fields when available; fall back to REST.
  const status = tick?.status ?? bot.status;
  const positionSize = tick?.positionSize ?? bot.position_size;
  const avgEntry = tick?.avgEntryPrice ?? bot.avg_entry_price;
  const totalPnl = tick?.totalPnl ?? bot.total_pnl_usdt;
  const gridProfit = tick?.gridProfit ?? bot.grid_profit_usdt;
  const trendPnl = tick?.trendPnl ?? bot.trend_pnl_usdt;
  const equity = bot.investment_usdt + totalPnl;
  const equityPct = (totalPnl / bot.investment_usdt) * 100;

  return (
    <div className="flex flex-col gap-6">
      {/* Page header */}
      <div className="flex items-center gap-3 flex-wrap">
        <h1 className="text-2xl font-semibold tracking-tight">Overview</h1>
        <StatusPill status={status} />
        <span className="text-sm text-text-muted">
          {bot.pair} · {bot.direction.toUpperCase()} · {bot.leverage}x
        </span>
      </div>

      {/* Top stat strip */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-px bg-border-subtle rounded-lg overflow-hidden">
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
          delta={<Delta value={gridProfit} format={formatPnl} />}
        />
        <StatCard
          label="Position"
          value={`${formatSize(positionSize)} ETH`}
          delta={
            <span className="text-xs text-text-muted">
              @ <Mono>{formatUsd(avgEntry)}</Mono>
            </span>
          }
        />
        <StatCard
          label="Trend PnL"
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
      </div>

      {/* Bot summary card */}
      <Card>
        <div className="flex items-start justify-between mb-4">
          <div>
            <h2 className="text-base font-semibold">{bot.pair}</h2>
            <p className="text-2xs uppercase tracking-wider text-text-muted mt-0.5">
              {bot.direction} · {bot.leverage}x
            </p>
          </div>
          <StatusPill status={status} />
        </div>
        <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-xs">
          <SummaryRow
            label="Range"
            value={`${formatUsd(bot.lower_price)} — ${formatUsd(bot.upper_price)}`}
          />
          <SummaryRow label="Grids" value={`${bot.num_grids} levels`} />
          <SummaryRow label="Investment" value={formatUsd(bot.investment_usdt)} />
          <SummaryRow
            label="Liquidation"
            value={
              bot.liquidation_price != null
                ? formatUsd(bot.liquidation_price)
                : '—'
            }
          />
          <SummaryRow label="Realized" value={formatPnl(gridProfit)} />
          <SummaryRow label="Unrealized" value={formatPnl(trendPnl)} />
        </dl>
      </Card>

      <Link
        to={`/bots/${bot.id}`}
        className="inline-flex items-center gap-2 text-sm text-primary hover:text-primary-strong transition-colors"
      >
        Open bot detail →
      </Link>
    </div>
  );
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between border-b border-border-subtle pb-2">
      <dt className="text-2xs uppercase tracking-wider text-text-muted">
        {label}
      </dt>
      <dd>
        <Mono>{value}</Mono>
      </dd>
    </div>
  );
}

function PageSkeleton() {
  return (
    <div className="flex flex-col gap-6 animate-pulse">
      <div className="h-8 w-32 bg-bg-elevated rounded" />
      <div className="grid grid-cols-2 md:grid-cols-4 gap-px bg-border-subtle rounded-lg overflow-hidden">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="h-24 bg-bg-elevated" />
        ))}
      </div>
      <div className="h-48 bg-bg-elevated rounded-lg" />
    </div>
  );
}
