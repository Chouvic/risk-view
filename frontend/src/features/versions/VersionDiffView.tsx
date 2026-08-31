import { ArrowRight, Minus, Plus, PencilLine } from "lucide-react";
import type {
  CashflowAmountChange,
  CashflowSnapshot,
  HedgeChange,
  IrrChange,
  VersionDiff,
} from "@/api/types";
import { Badge } from "@/components/ui/Badge";
import { InfoLabel } from "@/components/ui/InfoLabel";
import { SpacerTd, SpacerTh, Table, Td, Th } from "@/components/ui/Table";
import { formatBps, formatDate, formatMoney, formatPercent, toNumber } from "@/lib/format";
import { currencyColor } from "@/lib/series";
import { cn } from "@/lib/cn";

/**
 * What one revision did. Ordered by what a reviewer asks in sequence: how much
 * moved, what it did to the return, what it did to the hedges, and only then the
 * rows themselves.
 */
export function VersionDiffView({ diff, baseCurrency }: { diff: VersionDiff; baseCurrency: string }) {
  const rowCount = diff.added.length + diff.removed.length + diff.changed.length;
  if (rowCount === 0) {
    return (
      <p className="px-5 py-4 text-sm leading-relaxed text-ink-2">
        No rows differ between v{diff.from_version} and v{diff.to_version}.
      </p>
    );
  }

  const currencyMoves = Object.entries(diff.currency_irr);

  return (
    <div className="divide-y divide-hairline">
      <div className="flex flex-wrap items-center gap-2 px-5 py-3.5">
        <Count icon={PencilLine} n={diff.changed.length} noun="changed" />
        <Count icon={Plus} n={diff.added.length} noun="added" />
        <Count icon={Minus} n={diff.removed.length} noun="removed" />
      </div>

      <div className="px-5 py-4">
        <p className="mb-3 text-sm font-medium text-ink-2">
          <InfoLabel metric="fundIrr" label="Return" />
        </p>
        <div className="flex flex-wrap gap-x-8 gap-y-3">
          <IrrMove label="Fund" change={diff.fund_irr} />
          {currencyMoves.map(([currency, change]) => (
            <IrrMove key={currency} label={currency} change={change!} color={currencyColor(currency)} />
          ))}
          {currencyMoves.length === 0 ? (
            <p className="text-sm text-ink-3">No position IRR moved.</p>
          ) : null}
        </div>
      </div>

      <div className="px-5 py-4">
        <p className="mb-1 text-sm font-medium text-ink-2">
          <InfoLabel metric="hedgeProgramme" label="Hedge programme" />
        </p>
        {diff.hedge_changes.length === 0 ? (
          <p className="text-sm leading-relaxed text-ink-3">
            Unchanged. Forwards are sized from local-currency open exposure, so a revision that leaves
            local amounts alone leaves every roll alone.
          </p>
        ) : (
          <>
            <p className="mb-3 text-sm text-ink-3">
              {diff.hedge_changes.length} roll{diff.hedge_changes.length === 1 ? "" : "s"} differ.
            </p>
            <HedgeChangeTable changes={diff.hedge_changes} />
          </>
        )}
      </div>

      {diff.changed.length > 0 ? (
        <RowBlock title="Amounts restated" count={diff.changed.length}>
          <ChangedRowTable rows={diff.changed} baseCurrency={baseCurrency} />
        </RowBlock>
      ) : null}

      {diff.removed.length > 0 ? (
        <RowBlock title="Rows removed" count={diff.removed.length}>
          <SnapshotTable rows={diff.removed} baseCurrency={baseCurrency} />
        </RowBlock>
      ) : null}

      {diff.added.length > 0 ? (
        <RowBlock title="Rows added" count={diff.added.length}>
          <SnapshotTable rows={diff.added} baseCurrency={baseCurrency} />
        </RowBlock>
      ) : null}
    </div>
  );
}

function Count({
  icon: Icon,
  n,
  noun,
}: {
  icon: React.ComponentType<{ size?: number; className?: string }>;
  n: number;
  noun: string;
}) {
  return (
    <Badge className={cn(n === 0 && "text-ink-3")}>
      <Icon size={11} className="text-ink-3" />
      {n} {noun}
    </Badge>
  );
}

/** A rate move stated as both endpoints and the basis-point difference. */
function IrrMove({ label, change, color }: { label: string; change: IrrChange; color?: string }) {
  const delta = change.old !== null && change.new !== null ? change.new - change.old : null;
  // A move smaller than half a basis point rounds to zero, and "-0 bps" in red
  // claims a change the reader cannot see in either rate. Show the endpoints only.
  const material = delta !== null && Math.round(delta * 10_000) !== 0 ? delta : null;
  return (
    <div>
      <p className="flex items-center gap-1.5 text-sm text-ink-3">
        {color ? (
          <span aria-hidden className="size-1.5 rounded-full" style={{ background: color }} />
        ) : null}
        {label}
      </p>
      <p className="mt-1 flex items-center gap-2 text-sm tabular-nums text-ink">
        <span>{change.old === null ? "—" : formatPercent(change.old)}</span>
        <ArrowRight size={12} className="text-ink-3" />
        <span className="font-semibold">{change.new === null ? "—" : formatPercent(change.new)}</span>
        {material !== null ? (
          <span className={cn("font-medium", material > 0 ? "text-good" : "text-critical")}>
            {formatBps(material)}
          </span>
        ) : null}
      </p>
    </div>
  );
}

function RowBlock({
  title,
  count,
  children,
}: {
  title: string;
  count: number;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="flex items-center gap-2 px-5 pt-4 pb-2">
        <p className="text-sm font-medium text-ink-2">{title}</p>
        <span className="text-sm text-ink-3">{count}</span>
      </div>
      {children}
    </div>
  );
}

/** Notionals are in the sold currency, so each row carries its own symbol. */
function HedgeChangeTable({ changes }: { changes: HedgeChange[] }) {
  return (
    <Table>
      <thead>
        <tr>
          <Th>Currency</Th>
          <Th>
            <InfoLabel metric="tradeDate" label="Trade date" />
          </Th>
          <Th>
            <InfoLabel metric="valueDate" label="Value date" />
          </Th>
          <Th numeric>Was</Th>
          <Th numeric>
            <InfoLabel metric="notional" label="Now" />
          </Th>
          <SpacerTh />
        </tr>
      </thead>
      <tbody>
        {changes.map((change) => (
          <tr key={`${change.sell_currency}-${change.trade_date}`}>
            <Td>
              <span className="inline-flex items-center gap-1.5">
                <span
                  aria-hidden
                  className="size-1.5 rounded-full"
                  style={{ background: currencyColor(change.sell_currency) }}
                />
                {change.sell_currency}
              </span>
            </Td>
            <Td>{formatDate(change.trade_date)}</Td>
            <Td>{formatDate(change.value_date)}</Td>
            <Td numeric className="text-ink-3">
              {change.old_notional === null
                ? "—"
                : formatMoney(change.old_notional, change.sell_currency)}
            </Td>
            <Td numeric>
              {change.new_notional === null ? (
                <span className="text-ink-3">closed</span>
              ) : (
                formatMoney(change.new_notional, change.sell_currency)
              )}
            </Td>
            <SpacerTd />
          </tr>
        ))}
      </tbody>
    </Table>
  );
}

function ChangedRowTable({ rows, baseCurrency }: { rows: CashflowAmountChange[]; baseCurrency: string }) {
  return (
    <Table>
      <thead>
        <tr>
          <Th>Date</Th>
          <Th>Type</Th>
          <Th>Currency</Th>
          <Th numeric>Local was</Th>
          <Th numeric>Local now</Th>
          <Th numeric>Base was</Th>
          <Th numeric>Base now</Th>
          <SpacerTh />
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={`${row.currency}-${row.cashflow_date}-${row.cashflow_type}`}>
            <Td>{formatDate(row.cashflow_date)}</Td>
            <Td>{row.cashflow_type}</Td>
            <Td>{row.currency}</Td>
            <Td numeric className="text-ink-3">
              {formatMoney(row.old_amount_local, row.currency)}
            </Td>
            <Td numeric className={moved(row.old_amount_local, row.new_amount_local)}>
              {formatMoney(row.new_amount_local, row.currency)}
            </Td>
            <Td numeric className="text-ink-3">
              {formatMoney(row.old_amount_base, baseCurrency)}
            </Td>
            <Td numeric className={moved(row.old_amount_base, row.new_amount_base)}>
              {formatMoney(row.new_amount_base, baseCurrency)}
            </Td>
            <SpacerTd />
          </tr>
        ))}
      </tbody>
    </Table>
  );
}

/** Only the amounts that actually moved are marked; an FX restatement moves one side. */
function moved(before: string, after: string): string {
  return toNumber(before) === toNumber(after) ? "text-ink-3" : "font-medium text-ink";
}

function SnapshotTable({ rows, baseCurrency }: { rows: CashflowSnapshot[]; baseCurrency: string }) {
  return (
    <Table>
      <thead>
        <tr>
          <Th>Date</Th>
          <Th>Type</Th>
          <Th>Currency</Th>
          <Th numeric>Local</Th>
          <Th numeric>Base</Th>
          <SpacerTh />
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={`${row.currency}-${row.cashflow_date}-${row.cashflow_type}`}>
            <Td>{formatDate(row.cashflow_date)}</Td>
            <Td>{row.cashflow_type}</Td>
            <Td>{row.currency}</Td>
            <Td numeric>{formatMoney(row.amount_local, row.currency)}</Td>
            <Td numeric>{formatMoney(row.amount_base, baseCurrency)}</Td>
            <SpacerTd />
          </tr>
        ))}
      </tbody>
    </Table>
  );
}
