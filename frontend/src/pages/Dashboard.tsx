import { motion } from "motion/react";
import { Activity, ArrowRight, BellRing, CalendarClock, LandPlot, MessageCircle, Plus, Sprout, Tractor } from "lucide-react";
import { useMemo } from "react";
import { Link } from "react-router";
import { AlertList, FarmCard, StatTile } from "../components/FarmWidgets";
import { Landscape } from "../components/Landscape";
import { Button, Card, CardHeader, CropGlyph, EmptyState, Skeleton, rise, stagger } from "../components/ui";
import type { Alert, Farm, Prediction } from "../lib/api";
import { addDays, cx, daysBetween, fmtDate, fmtNumber, greeting, todayISO } from "../lib/format";
import { cropMeta, STATUS_META } from "../lib/meta";
import { useStore, type FarmEntry } from "../lib/store";

const when = (p: Prediction, d: number) =>
  p.harvest_status === "overdue"
    ? `overdue since ${fmtDate(p.window_end)}`
    : p.harvest_status === "ready"
      ? `ready now · until ${fmtDate(p.window_end)}`
      : `${fmtDate(p.recommended_harvest_date)} · in ${d} days`;

function HarvestCalendar({ entries }: { entries: FarmEntry[] }) {
  const today = todayISO();
  const horizon = 120;
  const items = entries
    .filter((e) => e.prediction)
    .map((e) => ({ ...e, d: daysBetween(today, e.prediction!.recommended_harvest_date) }))
    .sort((a, b) => a.d - b.d);
  const months = useMemo(() => {
    const out: { label: string; pos: number }[] = [];
    for (let i = 0; i <= horizon; i++) {
      const iso = addDays(today, i);
      if (iso.endsWith("-01")) out.push({ label: fmtDate(iso, { month: "short" }), pos: (i / horizon) * 100 });
    }
    return out;
  }, [today]);

  return (
    <Card>
      <CardHeader icon={<CalendarClock className="size-[18px]" />} title="Harvest calendar" subtitle="Recommended harvest dates over the next four months" />
      {items.length === 0 ? (
        <EmptyState icon={<Tractor className="size-6" />} title="No forecasts yet" body="Open a farm and run the model to see its harvest date here." />
      ) : (
        <div className="px-5 pb-6 pt-6 sm:px-6">
          <div className="relative">
            <div className="relative h-2 rounded-full bg-surface-2">
              {months.map((m) => (
                <div key={m.label + m.pos} className="absolute top-0 h-2 w-px bg-line-strong" style={{ left: `${m.pos}%` }}>
                  <span className="absolute -top-5 -translate-x-1/2 text-[11px] font-medium text-muted">{m.label}</span>
                </div>
              ))}
              <div className="absolute -top-1 left-0 size-4 -translate-x-1/2 rounded-full border-[3px] border-surface bg-ink" title="Today" />
            </div>
            <div className="mt-4 flex flex-col gap-2">
              {items.map((e, i) => {
                const p = e.prediction!;
                const m = cropMeta(e.farm.crop);
                const pos = Math.max(0, Math.min(1, e.d / horizon)) * 100;
                const tone = STATUS_META[p.harvest_status]?.tone ?? "primary";
                return (
                  <Link key={e.farm.farm_id} to={`/farms/${e.farm.farm_id}`} className="group relative block h-11 rounded-xl transition-colors hover:bg-surface-2/60">
                    <motion.div
                      className="absolute inset-y-[18px] left-0 rounded-full"
                      style={{ background: `linear-gradient(90deg, transparent, color-mix(in oklab, ${m.hue} 45%, transparent))` }}
                      initial={{ width: 0 }}
                      animate={{ width: `${pos}%` }}
                      transition={{ duration: 1, delay: 0.15 + i * 0.08, ease: [0.16, 1, 0.3, 1] }}
                    />
                    <motion.div
                      className="absolute top-1/2 flex -translate-y-1/2 items-center gap-2"
                      initial={{ left: "0%", opacity: 0 }}
                      animate={{ left: `${pos}%`, opacity: 1 }}
                      transition={{ duration: 1, delay: 0.15 + i * 0.08, ease: [0.16, 1, 0.3, 1] }}
                      style={{ translateX: pos > 60 ? "-100%" : "-12px" }}
                    >
                      {pos > 60 && (
                        <span className="whitespace-nowrap text-right text-[12.5px]">
                          <span className="font-semibold">{e.farm.farmer_name || e.farm.farm_id}</span>
                          <span className="text-muted"> · {when(p, e.d)}</span>
                        </span>
                      )}
                      <CropGlyph emoji={m.emoji} hue={m.hue} size={30} className={cx("!rounded-full ring-2 ring-surface transition-transform group-hover:scale-110", tone === "danger" && "ring-danger")} />
                      {pos <= 60 && (
                        <span className="whitespace-nowrap text-[12.5px]">
                          <span className="font-semibold">{e.farm.farmer_name || e.farm.farm_id}</span>
                          <span className={cx(p.harvest_status === "overdue" ? "text-danger" : "text-muted")}> · {when(p, e.d)}</span>
                        </span>
                      )}
                    </motion.div>
                  </Link>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </Card>
  );
}

export default function Dashboard() {
  const { entries, loading, error } = useStore();
  const preds = entries.filter((e) => e.prediction).map((e) => e.prediction!);
  const today = todayISO();
  const soon = preds.filter((p) => daysBetween(today, p.recommended_harvest_date) <= 30 || p.harvest_status === "ready" || p.harvest_status === "overdue");
  const alerts: (Alert & { farm: Farm })[] = entries
    .flatMap((e) => (e.prediction?.alerts ?? []).map((a) => ({ ...a, farm: e.farm })))
    .sort((a, b) => (a.severity === b.severity ? a.date.localeCompare(b.date) : a.severity === "high" ? -1 : 1));
  const avgHealth = preds.length ? preds.reduce((s, p) => s + p.health_now, 0) / preds.length : 0;
  const area = entries.reduce((s, e) => s + (e.farm.area_ha ?? 0), 0);
  const urgent = preds.filter((p) => p.harvest_status === "ready" || p.harvest_status === "overdue").length;

  const summary = loading
    ? "Gathering the latest from your fields…"
    : entries.length === 0
      ? "Register your first farm to start getting harvest forecasts."
      : [
          `${entries.length} farm${entries.length === 1 ? "" : "s"} under watch`,
          urgent ? `${urgent} ready to harvest` : soon.length ? `${soon.length} harvest${soon.length === 1 ? "" : "s"} within a month` : "no harvests due this month",
          alerts.filter((a) => a.severity === "high").length ? `${alerts.filter((a) => a.severity === "high").length} urgent alert${alerts.filter((a) => a.severity === "high").length === 1 ? "" : "s"}` : "no urgent alerts",
        ].join(" · ");

  return (
    <motion.div variants={stagger} initial="hidden" animate="show" className="flex flex-col gap-6">
      <motion.section variants={rise}>
        <Card className="overflow-hidden">
          <Landscape className="pointer-events-none absolute inset-x-0 bottom-0 h-full w-full opacity-90" />
          <div className="absolute inset-0 bg-gradient-to-r from-surface via-surface/85 to-transparent" />
          <div className="relative flex min-h-[260px] flex-col justify-between gap-8 p-6 sm:p-9">
            <div>
              <p className="text-sm font-medium text-muted">{fmtDate(today, { weekday: "long", day: "numeric", month: "long" })}</p>
              <h1 className="font-display mt-2 max-w-xl text-4xl font-medium leading-[1.05] sm:text-[52px]">
                {greeting()}.<br />
                <span className="italic text-primary">Your fields, forecast.</span>
              </h1>
              <p className="mt-4 max-w-lg text-[15px] text-ink-2">{summary}</p>
            </div>
            <div className="flex flex-wrap gap-3">
              <Link to="/advisor">
                <Button size="lg" icon={<MessageCircle className="size-[18px]" />}>
                  Ask the advisor
                </Button>
              </Link>
              <Link to="/farms/new">
                <Button size="lg" variant="secondary" icon={<Plus className="size-[18px]" />}>
                  Register a farm
                </Button>
              </Link>
            </div>
          </div>
        </Card>
      </motion.section>

      <motion.section variants={rise} className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        {loading && !entries.length ? (
          Array.from({ length: 4 }, (_, i) => <Skeleton key={i} className="h-[132px] rounded-3xl" />)
        ) : (
          <>
            <StatTile label="Farms" value={entries.length} icon={<Sprout className="size-4" />} foot={`${new Set(entries.map((e) => e.farm.crop)).size} crops`} />
            <StatTile label="Area" value={area} digits={1} suffix="ha" icon={<LandPlot className="size-4" />} tone="sky" foot="Total registered land" />
            <StatTile label="Harvests ≤ 30 days" value={soon.length} icon={<Tractor className="size-4" />} tone="accent" foot={urgent ? `${urgent} ready now` : "None ready yet"} />
            <StatTile label="Avg crop health" value={Math.round(avgHealth * 100)} suffix="%" icon={<Activity className="size-4" />} tone={avgHealth >= 0.75 ? "primary" : "warn"} foot={`Across ${preds.length} forecast${preds.length === 1 ? "" : "s"}`} />
          </>
        )}
      </motion.section>

      <motion.section variants={rise}>
        <HarvestCalendar entries={entries} />
      </motion.section>

      <div className="grid gap-6 xl:grid-cols-[1.6fr_1fr]">
        <motion.section variants={rise}>
          <div className="mb-3 flex items-end justify-between">
            <div>
              <h2 className="font-display text-2xl font-medium">Your farms</h2>
              <p className="text-sm text-muted">Tap a farm for its full forecast</p>
            </div>
            <Link to="/farms" className="flex items-center gap-1 text-sm font-medium text-primary hover:underline">
              View all <ArrowRight className="size-4" />
            </Link>
          </div>
          {loading && !entries.length ? (
            <div className="grid gap-4 md:grid-cols-2">
              {Array.from({ length: 4 }, (_, i) => (
                <Skeleton key={i} className="h-[196px] rounded-3xl" />
              ))}
            </div>
          ) : entries.length === 0 ? (
            <Card>
              <EmptyState
                icon={<Sprout className="size-6" />}
                title={error ? "Can't load farms" : "No farms yet"}
                body={error ? "Start the advisory server and retry." : "Register a farm with its crop, sowing date and location to get a harvest forecast."}
                action={!error && (
                  <Link to="/farms/new">
                    <Button icon={<Plus className="size-4" />}>Register a farm</Button>
                  </Link>
                )}
              />
            </Card>
          ) : (
            <motion.div variants={stagger} initial="hidden" animate="show" className="grid gap-4 md:grid-cols-2">
              {entries.slice(0, 6).map((e, i) => (
                <FarmCard key={e.farm.farm_id} farm={e.farm} prediction={e.prediction} index={i} />
              ))}
            </motion.div>
          )}
        </motion.section>

        <motion.section variants={rise}>
          <div className="mb-3">
            <h2 className="font-display text-2xl font-medium">Alerts</h2>
            <p className="text-sm text-muted">Weather and harvest warnings, most urgent first</p>
          </div>
          <Card>
            <CardHeader icon={<BellRing className="size-[18px]" />} title={`${alerts.length} active`} subtitle={alerts.length ? `${fmtNumber(alerts.filter((a) => a.severity === "high").length)} high priority` : "Nothing needs attention"} />
            <AlertList alerts={alerts.slice(0, 8)} farmLabel />
          </Card>
        </motion.section>
      </div>
    </motion.div>
  );
}
