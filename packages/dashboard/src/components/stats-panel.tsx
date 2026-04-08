// Bot Detail stats panel — sidebar next to the equity curve.
// Shows roundtrip count, win rate, fees, funding, avg/day.

import { useQuery } from '@tanstack/react-query';
import { Card } from './primitives/card';
import { Mono } from './primitives/mono';
import { api } from '@/lib/api-client';
import { formatPnl, formatUsd } from '@/lib/format';
import type { BotSummary } from '@/lib/api-types';

interface StatsPanelProps {
  bot: BotSummary;
}

export function StatsPanel({ bot }: StatsPanelProps) {
  const roundtrips = useQuery({
    queryKey: ['roundtrips', bot.id],
    queryFn: () => api.getRoundtrips(bot.id),
    staleTime: 30_000,
  });

  const snapshots = useQuery({
    queryKey: ['snapshots', bot.id],
    queryFn: () => api.getSnapshots(bot.id),
    staleTime: 5 * 60_000,
  });

  // Real maker rebate summary, sourced from fills_archive (every fee is what
  // GRVT actually charged or refunded on this account — never estimated).
  const rebate = useQuery({
    queryKey: ['rebate-summary', bot.id],
    queryFn: () => api.getRebateSummary(bot.id),
    refetchInterval: 30_000,
  });

  const rtCount = roundtrips.data?.count ?? 0;
  const rtTotalProfit = roundtrips.data?.totalProfit ?? 0;
  const winningRts = (roundtrips.data?.roundtrips ?? []).filter(
    (r) => r.profit > 0
  ).length;
  const winRate = rtCount > 0 ? (winningRts / rtCount) * 100 : 0;

  // Aggregate fees + funding from daily_snapshots (the source of truth).
  const snaps = snapshots.data?.snapshots ?? [];
  const totalFees = snaps.reduce((sum, s) => sum + (s.total_fees_usdt ?? 0), 0);
  const totalFunding = snaps.reduce((sum, s) => sum + (s.funding_usdt ?? 0), 0);
  const days = snaps.length || 1;
  const avgPerDay = bot.grid_profit_usdt / days;

  return (
    <Card className="p-5">
      <h3 className="text-sm font-semibold text-text-primary mb-4">Statistics</h3>
      <dl className="space-y-3">
        <Row label="Round trips" value={String(rtCount)} />
        <Row
          label="Win rate"
          value={`${winRate.toFixed(1)}%`}
          tone={winRate >= 80 ? 'success' : winRate >= 60 ? 'default' : 'danger'}
        />
        <Row label="Avg profit/RT" value={formatPnl(rtCount > 0 ? rtTotalProfit / rtCount : 0)} />
        <Row label="Days active" value={String(days)} />
        <Row label="Avg/day" value={formatUsd(avgPerDay)} />
        <hr className="border-border-subtle" />
        <Row
          label="Fees"
          value={formatUsd(totalFees)}
          tone={totalFees < 0 ? 'danger' : 'default'}
        />
        <Row
          label="Funding"
          value={formatPnl(totalFunding)}
          tone={totalFunding > 0 ? 'success' : totalFunding < 0 ? 'danger' : 'default'}
        />
        <Row
          label={`Maker rebate (${rebate.data?.count ?? 0} fills)`}
          value={formatPnl(rebate.data?.netRebateUsdt ?? 0)}
          tone={
            (rebate.data?.netRebateUsdt ?? 0) > 0
              ? 'success'
              : (rebate.data?.netRebateUsdt ?? 0) < 0
                ? 'danger'
                : 'default'
          }
        />
      </dl>
    </Card>
  );
}

function Row({
  label,
  value,
  tone = 'default',
}: {
  label: string;
  value: string;
  tone?: 'default' | 'success' | 'danger';
}) {
  const toneClass =
    tone === 'success'
      ? 'text-success'
      : tone === 'danger'
        ? 'text-danger'
        : 'text-text-primary';
  return (
    <div className="flex items-center justify-between">
      <dt className="text-2xs uppercase tracking-wider text-text-muted">
        {label}
      </dt>
      <dd className={toneClass}>
        <Mono className="text-sm">{value}</Mono>
      </dd>
    </div>
  );
}
