import { motion } from "motion/react";
import { useMemo, useState } from "react";
import {
  Area,
  CartesianGrid,
  ComposedChart,
  Line,
  ReferenceArea,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { Prediction } from "../lib/api";
import { cx, fmtDate, fmtLongDate } from "../lib/format";

const SERIES = [
  { key: "readiness", label: "Harvest readiness", color: "var(--accent)" },
  { key: "health", label: "Crop health", color: "var(--primary-2)" },
  { key: "maturity", label: "Maturity", color: "var(--sky)" },
] as const;
type Key = (typeof SERIES)[number]["key"];

interface Row {
  date: string;
  readiness: number;
  health: number;
  maturity: number;
}

function ChartTooltip({ active, payload, label, visible }: { active?: boolean; payload?: { payload: Row }[]; label?: string; visible: Set<Key> }) {
  if (!active || !payload?.length || !label) return null;
  const row = payload[0].payload;
  return (
    <div className="min-w-[180px] rounded-2xl border border-line bg-surface/95 p-3 text-sm shadow-[var(--shadow-lift)] backdrop-blur">
      <div className="mb-2 text-xs font-medium text-muted">{fmtLongDate(label)}</div>
      {SERIES.filter((s) => visible.has(s.key)).map((s) => (
        <div key={s.key} className="flex items-center justify-between gap-4 py-0.5">
          <span className="flex items-center gap-2 text-ink-2">
            <span className="size-2 rounded-full" style={{ background: s.color }} />
            {s.label}
          </span>
          <span className="font-mono font-medium tabular">{Math.round(row[s.key])}%</span>
        </div>
      ))}
    </div>
  );
}

export function ReadinessChart({ prediction, height = 300 }: { prediction: Prediction; height?: number }) {
  const [visible, setVisible] = useState<Set<Key>>(new Set(["readiness", "health", "maturity"]));
  const data = useMemo<Row[]>(
    () =>
      prediction.curve.map((p) => ({
        date: p.date,
        readiness: p.readiness * 100,
        health: p.health * 100,
        maturity: Math.min(p.maturity_pct, 120),
      })),
    [prediction.curve],
  );
  const toggle = (k: Key) =>
    setVisible((v) => {
      const n = new Set(v);
      if (n.has(k) && n.size > 1) n.delete(k);
      else n.add(k);
      return n;
    });

  const ticks = useMemo(() => {
    const step = Math.max(1, Math.round(data.length / 6));
    return data.filter((_, i) => i % step === 0).map((d) => d.date);
  }, [data]);

  const inRange = (d: string) => data.length > 0 && d >= data[0].date && d <= data[data.length - 1].date;
  const yMax = visible.has("maturity") && data.some((d) => d.maturity > 100) ? 120 : 100;

  return (
    <div>
      <div className="mb-4 flex flex-wrap gap-2 px-5 sm:px-6">
        {SERIES.map((s) => {
          const on = visible.has(s.key);
          return (
            <button
              key={s.key}
              onClick={() => toggle(s.key)}
              aria-pressed={on}
              className={cx(
                "flex items-center gap-2 rounded-full border px-3 py-1.5 text-[13px] font-medium transition-all",
                on ? "border-line-strong bg-surface text-ink" : "border-line bg-transparent text-muted line-through decoration-muted/50",
              )}
            >
              <motion.span animate={{ scale: on ? 1 : 0.6, opacity: on ? 1 : 0.4 }} className="size-2.5 rounded-full" style={{ background: s.color }} />
              {s.label}
            </button>
          );
        })}
        <span className="ml-auto hidden items-center gap-2 text-xs text-muted sm:flex">
          <span className="h-3 w-5 rounded-sm bg-accent/25 ring-1 ring-accent/50" /> Best harvest window
        </span>
      </div>
      <div style={{ height }} className="pr-3 sm:pr-5">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data} margin={{ top: 10, right: 6, left: -6, bottom: 0 }}>
            <defs>
              <linearGradient id="gReady" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--accent)" stopOpacity={0.45} />
                <stop offset="100%" stopColor="var(--accent)" stopOpacity={0} />
              </linearGradient>
              <linearGradient id="gHealth" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--primary-2)" stopOpacity={0.16} />
                <stop offset="100%" stopColor="var(--primary-2)" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid vertical={false} stroke="var(--line)" strokeDasharray="3 6" />
            <XAxis
              dataKey="date"
              ticks={ticks}
              tickFormatter={(d: string) => fmtDate(d)}
              tick={{ fill: "var(--muted)", fontSize: 12 }}
              axisLine={false}
              tickLine={false}
              dy={8}
            />
            <YAxis
              domain={[0, yMax]}
              ticks={[0, 25, 50, 75, 100]}
              tickFormatter={(v: number) => `${v}%`}
              tick={{ fill: "var(--muted)", fontSize: 12 }}
              axisLine={false}
              tickLine={false}
              width={46}
            />
            {inRange(prediction.window_start) || inRange(prediction.window_end) ? (
              <ReferenceArea
                x1={inRange(prediction.window_start) ? prediction.window_start : data[0]?.date}
                x2={inRange(prediction.window_end) ? prediction.window_end : data[data.length - 1]?.date}
                fill="var(--accent)"
                fillOpacity={0.14}
                stroke="var(--accent)"
                strokeOpacity={0.35}
                strokeDasharray="4 4"
              />
            ) : null}
            {inRange(prediction.as_of_date) && (
              <ReferenceLine x={prediction.as_of_date} stroke="var(--ink-2)" strokeDasharray="2 4" label={{ value: "Today", position: "insideTopLeft", fill: "var(--ink-2)", fontSize: 11, offset: 8 }} />
            )}
            {inRange(prediction.recommended_harvest_date) && (
              <ReferenceLine x={prediction.recommended_harvest_date} stroke="var(--accent)" strokeWidth={1.5} label={{ value: "🌾 Harvest", position: "insideTopRight", fill: "var(--ink)", fontSize: 11, offset: 8 }} />
            )}
            <Tooltip content={<ChartTooltip visible={visible} />} cursor={{ stroke: "var(--line-strong)", strokeWidth: 1 }} />
            {visible.has("health") && (
              <Area type="monotone" dataKey="health" stroke="var(--primary-2)" strokeWidth={2} fill="url(#gHealth)" dot={false} activeDot={{ r: 4, strokeWidth: 2, stroke: "var(--surface)" }} animationDuration={1100} />
            )}
            {visible.has("maturity") && (
              <Line type="monotone" dataKey="maturity" stroke="var(--sky)" strokeWidth={2} strokeDasharray="5 5" dot={false} activeDot={{ r: 4, strokeWidth: 2, stroke: "var(--surface)" }} animationDuration={1100} />
            )}
            {visible.has("readiness") && (
              <Area type="monotone" dataKey="readiness" stroke="var(--accent)" strokeWidth={2.5} fill="url(#gReady)" dot={false} activeDot={{ r: 5, strokeWidth: 2, stroke: "var(--surface)" }} animationDuration={1300} />
            )}
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
