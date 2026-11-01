import { motion } from "motion/react";
import {
  CalendarRange,
  CheckCircle2,
  ChevronRight,
  Droplets,
  FlaskConical,
  IndianRupee,
  MapPin,
  Store,
  TrendingDown,
  TrendingUp,
} from "lucide-react";
import { Link } from "react-router";
import type { Alert, CropCalendar, Farm, Market, Prediction, Soil } from "../lib/api";
import { addDays, cx, daysBetween, fmtDate, fmtNumber, fmtRange, fmtRelativeDays, fmtRupees, pct } from "../lib/format";
import { alertMeta, cropMeta, LANGUAGES, SEVERITY_TONE, STATUS_META } from "../lib/meta";
import { AnimatedNumber, Badge, Bar, Card, CardHeader, CropGlyph, EmptyState, Ring, rise, toneColor } from "./ui";
import { Sparkline } from "./Sparkline";

export function StatusBadge({ status }: { status: Prediction["harvest_status"] }) {
  const m = STATUS_META[status] ?? STATUS_META.growing;
  return (
    <Badge tone={m.tone} dot pulse={status === "ready" || status === "overdue"}>
      {m.label}
    </Badge>
  );
}

export function harvestLine(p: Prediction) {
  const d = daysBetween(p.as_of_date, p.recommended_harvest_date);
  if (p.harvest_status === "overdue") return `Best window was ${fmtRange(p.window_start, p.window_end)}`;
  if (p.harvest_status === "ready") return `Harvest now · window ends ${fmtDate(p.window_end)}`;
  return `Harvest ${fmtRelativeDays(d)} · ${fmtDate(p.recommended_harvest_date)}`;
}

export function FarmCard({ farm, prediction, index = 0 }: { farm: Farm; prediction: Prediction | null; index?: number }) {
  const m = cropMeta(farm.crop);
  const tone = prediction ? STATUS_META[prediction.harvest_status]?.tone ?? "primary" : "neutral";
  return (
    <motion.div variants={rise} layout>
      <Link to={`/farms/${farm.farm_id}`} className="group block h-full">
        <Card interactive className="@container flex h-full flex-col overflow-hidden p-5">
          <div
            aria-hidden
            className="pointer-events-none absolute -right-16 -top-16 size-48 rounded-full opacity-60 blur-2xl transition-opacity group-hover:opacity-90"
            style={{ background: `radial-gradient(circle, color-mix(in oklab, ${m.hue} 22%, transparent), transparent 70%)` }}
          />
          <div className="relative flex items-start gap-3.5">
            <CropGlyph emoji={m.emoji} hue={m.hue} />
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <h3 className="truncate text-[16px] font-semibold tracking-tight">{farm.farmer_name || farm.farm_id}</h3>
              </div>
              <p className="mt-0.5 flex items-center gap-1 truncate text-[13px] text-muted">
                <MapPin className="size-3.5 shrink-0" />
                {[farm.district, farm.state].filter(Boolean).join(", ") || `${farm.latitude.toFixed(2)}, ${farm.longitude.toFixed(2)}`}
              </p>
            </div>
            <ChevronRight className="size-5 text-muted transition-transform group-hover:translate-x-0.5" />
          </div>

          <div className="relative mt-4 flex flex-wrap items-center gap-1.5">
            <Badge tone="neutral">
              {m.label}
              {farm.area_ha ? ` · ${farm.area_ha} ha` : ""}
            </Badge>
            {prediction && <StatusBadge status={prediction.harvest_status} />}
            {prediction && prediction.alerts.filter((a) => !a.type.includes("harvest")).length > 0 && (
              <Badge tone="danger">{prediction.alerts.filter((a) => !a.type.includes("harvest")).length} alert(s)</Badge>
            )}
          </div>

          {prediction ? (
            <div className="relative mt-5 flex items-end justify-between gap-3 border-t border-line pt-4">
              <div className="flex min-w-0 flex-1 items-center gap-3">
                <Ring value={Math.min(prediction.maturity_pct, 100) / 100} size={54} stroke={5} color={toneColor(tone)} delay={0.1 + index * 0.05}>
                  <span className="text-[13px] font-semibold tabular">{Math.round(Math.min(prediction.maturity_pct, 100))}%</span>
                </Ring>
                <div className="min-w-0">
                  <div className="text-[11px] font-medium uppercase tracking-wider text-muted">Maturity</div>
                  <div className="text-[13px] font-medium text-ink-2">{harvestLine(prediction)}</div>
                </div>
              </div>
              <div className="hidden shrink-0 @[24rem]:block">
                <Sparkline prediction={prediction} />
              </div>
            </div>
          ) : (
            <div className="relative mt-5 border-t border-line pt-4 text-[13px] text-muted">No forecast yet · open to run the model</div>
          )}
        </Card>
      </Link>
    </motion.div>
  );
}

export function AlertList({ alerts, farmLabel }: { alerts: (Alert & { farm?: Farm })[]; farmLabel?: boolean }) {
  if (!alerts.length)
    return <EmptyState icon={<CheckCircle2 className="size-6 text-primary" />} title="All clear" body="No weather or harvest warnings for the coming week." />;
  return (
    <ul className="flex flex-col gap-2.5 p-5 pt-3 sm:p-6 sm:pt-3">
      {alerts.map((a, i) => {
        const meta = alertMeta(a.type);
        const tone = SEVERITY_TONE[a.severity] ?? "neutral";
        return (
          <motion.li
            key={`${a.type}-${a.date}-${i}`}
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.05 * i, duration: 0.4 }}
            className="flex gap-3 rounded-2xl border border-line bg-bg/40 p-3.5"
          >
            <div className="grid size-10 shrink-0 place-items-center rounded-xl" style={{ background: `color-mix(in oklab, ${toneColor(tone)} 16%, transparent)`, color: toneColor(tone) }}>
              <meta.icon className="size-5" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <span className="text-sm font-semibold">{meta.label}</span>
                <Badge tone={tone} className="!py-0.5 !text-[11px] capitalize">
                  {a.severity}
                </Badge>
                <span className="text-xs text-muted">{fmtDate(a.date, { weekday: "short", day: "numeric", month: "short" })}</span>
                {farmLabel && a.farm && (
                  <Link to={`/farms/${a.farm.farm_id}`} className="text-xs font-medium text-primary hover:underline">
                    {cropMeta(a.farm.crop).emoji} {a.farm.farmer_name || a.farm.farm_id}
                  </Link>
                )}
              </div>
              <p className="mt-1 text-[13.5px] leading-relaxed text-ink-2">{a.advice}</p>
            </div>
          </motion.li>
        );
      })}
    </ul>
  );
}

export function MarketCard({ market, crop }: { market: Market; crop: string }) {
  const trend = market.trend_7d_pct ?? null;
  const up = (trend ?? 0) >= 0;
  const best = market.best_markets ?? [];
  const maxBest = Math.max(...best.map((b) => b.modal_price_rs_qtl), 1);
  return (
    <Card className="h-full">
      <CardHeader icon={<Store className="size-[18px]" />} title="Mandi prices" subtitle={market.commodity ?? cropMeta(crop).label} />
      {market.available && market.avg_modal_price_rs_qtl ? (
        <div className="p-5 pt-4 sm:p-6 sm:pt-4">
          <div className="flex items-end gap-3">
            <div className="font-display text-4xl font-medium tabular">
              <AnimatedNumber value={market.avg_modal_price_rs_qtl} format={(n) => fmtRupees(n)} />
            </div>
            <span className="mb-1.5 text-sm text-muted">/ quintal</span>
          </div>
          <div className="mt-2 flex flex-wrap gap-2">
            {trend !== null && (
              <Badge tone={up ? "primary" : "danger"}>
                {up ? <TrendingUp className="size-3.5" /> : <TrendingDown className="size-3.5" />}
                {up ? "+" : ""}
                {trend}% this week
              </Badge>
            )}
            {market.n_markets != null && (
              <Badge tone="neutral">
                {market.n_markets} {market.n_markets === 1 ? "market" : "markets"}
              </Badge>
            )}
          </div>
          {best.length > 0 && (
            <div className="mt-5">
              <div className="mb-2 text-[11px] font-medium uppercase tracking-wider text-muted">Best markets today</div>
              <ul className="flex flex-col gap-2.5">
                {best.slice(0, 4).map((b, i) => (
                  <li key={`${b.market}-${i}`}>
                    <div className="mb-1 flex items-center justify-between text-[13px]">
                      <span className="flex items-center gap-2 font-medium">
                        {i === 0 && <span className="rounded-md bg-accent-soft px-1.5 text-[10px] font-semibold uppercase text-[#8a5a00] dark:text-accent">Top</span>}
                        {b.market}
                      </span>
                      <span className="font-mono tabular text-ink-2">{fmtRupees(b.modal_price_rs_qtl)}</span>
                    </div>
                    <Bar value={b.modal_price_rs_qtl / maxBest} color={i === 0 ? "var(--accent)" : "var(--line-strong)"} delay={0.1 * i} />
                  </li>
                ))}
              </ul>
            </div>
          )}
          {market.latest_date && <p className="mt-4 text-xs text-muted">Prices as of {fmtDate(market.latest_date, { day: "numeric", month: "short", year: "numeric" })}</p>}
        </div>
      ) : (
        <EmptyState icon={<IndianRupee className="size-6" />} title="No prices yet" body="Mandi prices for this crop aren't available from the data source." />
      )}
    </Card>
  );
}

const NITROGEN_SCALE = 140; // Kaggle crop-recommendation maximum (available N, kg/ha)

export function SoilCard({ soil, irrigated }: { soil?: Soil; irrigated: boolean }) {
  return (
    <Card className="h-full">
      <CardHeader icon={<FlaskConical className="size-[18px]" />} title="Soil" subtitle={soil ? `${soil.soil_type} soil · ${irrigated ? "irrigated" : "rain-fed"}` : "No reading yet"} />
      {soil ? (
        <div className="grid gap-5 p-5 pt-4 sm:p-6 sm:pt-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div className="rounded-2xl bg-surface-2/70 p-3">
              <div className="text-xs font-semibold text-muted">Nitrogen</div>
              <div className="mt-1 font-display text-2xl font-medium tabular">{Math.round(soil.N)}</div>
              <Bar className="mt-2 !h-1.5" value={soil.N / NITROGEN_SCALE} color="var(--primary-2)" />
            </div>
            <PhScale ph={soil.ph} />
            <div className="rounded-2xl bg-surface-2/70 p-3">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-muted">
                <Droplets className="size-3.5" /> Moisture
              </div>
              <div className="mt-1 font-display text-2xl font-medium tabular">{Math.round(soil.moisture)}%</div>
              <Bar className="mt-2 !h-1.5" value={soil.moisture / 100} color="var(--sky)" delay={0.2} />
            </div>
          </div>
        </div>
      ) : (
        <EmptyState icon={<FlaskConical className="size-6" />} title="No soil data" body="Run a forecast to collect the latest soil reading." />
      )}
    </Card>
  );
}

function PhScale({ ph }: { ph: number }) {
  const pos = Math.max(0, Math.min(1, (ph - 4) / 6));
  const label = ph < 6 ? "Acidic" : ph > 7.5 ? "Alkaline" : "Neutral";
  return (
    <div className="rounded-2xl bg-surface-2/70 p-3">
      <div className="text-xs font-semibold text-muted">pH · {label}</div>
      <div className="mt-1 font-display text-2xl font-medium tabular">{ph.toFixed(1)}</div>
      <div className="relative mt-2 h-1.5 rounded-full" style={{ background: "linear-gradient(90deg,#d65a3a,#e0a526,#5fae6e,#2f78a8,#6a4fb0)" }}>
        <motion.div
          className="absolute top-1/2 size-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-surface bg-ink shadow"
          initial={{ left: "50%" }}
          animate={{ left: `${pos * 100}%` }}
          transition={{ type: "spring", stiffness: 120, damping: 14, delay: 0.2 }}
        />
      </div>
    </div>
  );
}

export function SeasonTimeline({ prediction }: { prediction: Prediction }) {
  const farm = prediction.farm;
  const cal: CropCalendar | undefined = farm.crop_calendar;
  const start = farm.sowing_date;
  const end = addDays(prediction.window_end, 10);
  const span = Math.max(1, daysBetween(start, end));
  const at = (d: string) => Math.max(0, Math.min(1, daysBetween(start, d) / span)) * 100;
  const today = at(prediction.as_of_date);
  const ws = at(prediction.window_start);
  const we = at(prediction.window_end);
  const marks = [
    { label: "Sown", date: start, pos: 0 },
    { label: "Today", date: prediction.as_of_date, pos: today },
    { label: "Harvest", date: prediction.recommended_harvest_date, pos: at(prediction.recommended_harvest_date) },
  ];
  return (
    <Card>
      <CardHeader
        icon={<CalendarRange className="size-[18px]" />}
        title="Season timeline"
        subtitle={cal ? `${cal.season.charAt(0).toUpperCase() + cal.season.slice(1)} season · ~${cal.typical_duration_days} day crop` : undefined}
        action={farm.days_since_sowing != null ? <Badge tone="neutral">Day {farm.days_since_sowing}</Badge> : undefined}
      />
      <div className="px-5 pb-6 pt-14 sm:px-6">
        <div className="relative h-3 rounded-full bg-surface-2">
          <motion.div
            className="absolute inset-y-0 left-0 rounded-full"
            style={{ background: "linear-gradient(90deg, var(--primary-soft), var(--primary-2))" }}
            initial={{ width: 0 }}
            animate={{ width: `${today}%` }}
            transition={{ duration: 1.2, ease: [0.16, 1, 0.3, 1] }}
          />
          <motion.div
            className="absolute inset-y-[-3px] rounded-full bg-accent/30 ring-1 ring-accent"
            style={{ left: `${ws}%`, width: `${Math.max(we - ws, 1.2)}%` }}
            initial={{ opacity: 0, scaleX: 0.4 }}
            animate={{ opacity: 1, scaleX: 1 }}
            transition={{ delay: 0.8, duration: 0.5 }}
          />
          {marks.map((mk, i) => (
            <motion.div
              key={mk.label}
              className="absolute top-1/2"
              style={{ left: `${mk.pos}%` }}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3 + i * 0.2 }}
            >
              <div className={cx("size-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-[3px] border-surface shadow", mk.label === "Harvest" ? "bg-accent" : mk.label === "Today" ? "bg-ink" : "bg-primary-2")} />
              <div className={cx("absolute whitespace-nowrap text-center", mk.label === "Today" ? "bottom-7 -translate-x-1/2" : "top-4", i === 0 ? "-left-1 text-left" : i === marks.length - 1 ? "-right-1 text-right" : "")}>
                <div className="text-[12px] font-semibold">{mk.label}</div>
                <div className="text-[11px] text-muted">{fmtDate(mk.date)}</div>
              </div>
            </motion.div>
          ))}
        </div>
        <div className="mt-14 grid gap-3 text-[13px] sm:grid-cols-2">
          <div className="rounded-2xl bg-surface-2/70 p-3.5">
            <div className="text-xs font-semibold text-muted">Best harvest window</div>
            <div className="mt-0.5 font-medium">{fmtRange(prediction.window_start, prediction.window_end)}</div>
          </div>
          {cal?.next_sowing_window && (
            <div className="rounded-2xl bg-surface-2/70 p-3.5">
              <div className="text-xs font-semibold text-muted">Next sowing window</div>
              <div className="mt-0.5 font-medium">{fmtRange(cal.next_sowing_window.start, cal.next_sowing_window.end)}</div>
            </div>
          )}
        </div>
      </div>
    </Card>
  );
}

export function StatTile({
  label,
  value,
  suffix,
  digits,
  icon,
  tone = "primary",
  foot,
}: {
  label: string;
  value: number;
  suffix?: string;
  digits?: number;
  icon: React.ReactNode;
  tone?: Parameters<typeof toneColor>[0];
  foot?: React.ReactNode;
}) {
  return (
    <Card className="p-5">
      <div className="flex items-center justify-between">
        <span className="text-[13px] font-medium text-muted">{label}</span>
        <span className="grid size-8 place-items-center rounded-lg" style={{ background: `color-mix(in oklab, ${toneColor(tone)} 15%, transparent)`, color: toneColor(tone) }}>
          {icon}
        </span>
      </div>
      <div className="mt-3 font-display text-[34px] font-medium leading-none">
        <AnimatedNumber value={value} digits={digits} />
        {suffix && <span className="ml-1 text-lg text-muted">{suffix}</span>}
      </div>
      {foot && <div className="mt-2 text-xs text-muted">{foot}</div>}
    </Card>
  );
}

export const farmSubtitle = (farm: Farm) =>
  [cropMeta(farm.crop).label, farm.area_ha ? `${fmtNumber(farm.area_ha, 1)} ha` : null, LANGUAGES[farm.language]?.native].filter(Boolean).join(" · ");

export const healthWord = (h: number) => (h >= 0.75 ? "Healthy" : h >= 0.5 ? "Mild stress" : "Stressed");
export { pct };
