import { motion } from "motion/react";
import { ArrowLeft, BellRing, CalendarClock, ClipboardCheck, Cpu, HeartPulse, Info, LineChart, MapPin, MessageCircle, RefreshCw, Sparkles, Sprout, Tractor, Wheat } from "lucide-react";
import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { toast } from "sonner";
import { AlertList, MarketCard, SeasonTimeline, SoilCard, StatusBadge, healthWord } from "../components/FarmWidgets";
import { ReadinessChart } from "../components/ReadinessChart";
import { AnimatedNumber, Button, Card, CardHeader, CropGlyph, EmptyState, Field, Input, Modal, Ring, Skeleton, rise, stagger, toneColor } from "../components/ui";
import { api, type Prediction } from "../lib/api";
import { daysBetween, fmtDate, fmtLongDate, fmtNumber, timeAgo, todayISO } from "../lib/format";
import { cropMeta, LANGUAGES, STATUS_META } from "../lib/meta";
import { useStore } from "../lib/store";

function Kpis({ p, area }: { p: Prediction; area: number | null }) {
  const days = p.harvest_status === "overdue" ? daysBetween(p.window_end, p.as_of_date) : Math.max(0, daysBetween(p.as_of_date, p.recommended_harvest_date));
  const tone = STATUS_META[p.harvest_status]?.tone ?? "primary";
  const healthColor = p.health_now >= 0.75 ? "var(--primary-2)" : p.health_now >= 0.5 ? "var(--warn)" : "var(--danger)";
  const kpis = [
    {
      label: p.harvest_status === "overdue" ? "Days overdue" : "Days to harvest",
      ring: Math.min(p.maturity_pct, 100) / 100,
      color: toneColor(tone),
      icon: <CalendarClock className="size-5" />,
      value: <AnimatedNumber value={Math.abs(days)} />,
      foot: p.harvest_status === "overdue" ? `Window ended ${fmtDate(p.window_end)}` : `Best on ${fmtDate(p.recommended_harvest_date)}`,
    },
    {
      label: "Readiness now",
      ring: p.readiness_now,
      color: "var(--accent)",
      icon: <Tractor className="size-5" />,
      value: <><AnimatedNumber value={Math.round(p.readiness_now * 100)} />%</>,
      foot: p.readiness_now >= 0.8 ? "In harvest range" : "Rises toward the window",
    },
    {
      label: "Crop health",
      ring: p.health_now,
      color: healthColor,
      icon: <HeartPulse className="size-5" />,
      value: <><AnimatedNumber value={Math.round(p.health_now * 100)} />%</>,
      foot: healthWord(p.health_now),
    },
    {
      label: "Expected yield",
      ring: Math.min(1, p.expected_yield_kg_ha / 6000),
      color: "var(--sky)",
      icon: <Wheat className="size-5" />,
      value: <><AnimatedNumber value={Math.round(p.expected_yield_kg_ha)} /><span className="ml-1 text-sm text-muted">kg/ha</span></>,
      foot: area ? `≈ ${fmtNumber((p.expected_yield_kg_ha * area) / 100, 1)} q from ${area} ha` : "Per hectare",
    },
  ];
  return (
    <motion.div variants={stagger} className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
      {kpis.map((k, i) => (
        <motion.div key={k.label} variants={rise}>
          <Card className="flex h-full flex-col gap-3 p-4 sm:flex-row sm:items-center sm:gap-4 sm:p-5">
            <Ring value={k.ring} size={52} stroke={5} color={k.color} delay={0.15 + i * 0.08}>
              <span style={{ color: k.color }}>{k.icon}</span>
            </Ring>
            <div className="min-w-0">
              <div className="text-[12px] font-medium text-muted">{k.label}</div>
              <div className="font-display text-[26px] font-medium leading-tight">{k.value}</div>
              <div className="truncate text-xs text-muted">{k.foot}</div>
            </div>
          </Card>
        </motion.div>
      ))}
    </motion.div>
  );
}

function HarvestModal({ open, onClose, farmId }: { open: boolean; onClose: () => void; farmId: string }) {
  const [date, setDate] = useState(todayISO());
  const [yieldKg, setYieldKg] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await api.harvestOutcome(farmId, { harvest_date: date, yield_kg_ha: yieldKg ? Number(yieldKg) : undefined, notes });
      toast.success("Harvest recorded", { description: "Thanks. Real outcomes make the model more accurate." });
      onClose();
    } catch (err) {
      toast.error("Couldn't save", { description: (err as Error).message });
    } finally {
      setSaving(false);
    }
  };
  return (
    <Modal open={open} onClose={onClose} title="Record harvest">
      <form onSubmit={submit} className="flex flex-col gap-4">
        <p className="-mt-2 text-sm text-muted">Logging the actual harvest gives the model real labels to learn from.</p>
        <Field label="Harvest date" htmlFor="hd">
          <Input id="hd" type="date" required value={date} max={todayISO()} onChange={(e) => setDate(e.target.value)} />
        </Field>
        <Field label="Yield (kg per hectare)" hint="Optional" htmlFor="hy">
          <Input id="hy" type="number" min={0} step="any" inputMode="decimal" placeholder="e.g. 3200" value={yieldKg} onChange={(e) => setYieldKg(e.target.value)} />
        </Field>
        <Field label="Notes" hint="Optional: weather, pests, grain quality…" htmlFor="hn">
          <textarea id="hn" rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} className="w-full rounded-xl border border-line bg-surface p-3 text-[15px] outline-none focus:border-primary-2 focus:shadow-[0_0_0_4px_var(--primary-soft)]" />
        </Field>
        <div className="mt-2 flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" loading={saving} icon={<ClipboardCheck className="size-4" />}>
            Save harvest
          </Button>
        </div>
      </form>
    </Modal>
  );
}

export default function FarmDetail() {
  const { id = "" } = useParams();
  const nav = useNavigate();
  const { entry, loading, forecast } = useStore();
  const e = entry(id);
  const [running, setRunning] = useState(false);
  const [harvestOpen, setHarvestOpen] = useState(false);

  const run = async () => {
    setRunning(true);
    const t = toast.loading("Collecting soil, weather & mandi data and running the model…");
    try {
      const p = await forecast(id);
      toast.success("Forecast updated", { id: t, description: `Best harvest ${fmtDate(p.recommended_harvest_date, { day: "numeric", month: "long" })}` });
    } catch (err) {
      toast.error("Forecast failed", { id: t, description: (err as Error).message });
    } finally {
      setRunning(false);
    }
  };

  if (!e) {
    if (loading)
      return (
        <div className="flex flex-col gap-6">
          <Skeleton className="h-28 rounded-3xl" />
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            {Array.from({ length: 4 }, (_, i) => (
              <Skeleton key={i} className="h-24 rounded-3xl" />
            ))}
          </div>
          <Skeleton className="h-96 rounded-3xl" />
        </div>
      );
    return (
      <Card>
        <EmptyState icon={<Sprout className="size-6" />} title="Farm not found" body={`There is no farm with ID “${id}”.`} action={<Button onClick={() => nav("/farms")}>Back to farms</Button>} />
      </Card>
    );
  }

  const { farm, prediction: p } = e;
  const m = cropMeta(farm.crop);
  const irrigated = Boolean(farm.irrigated);

  return (
    <motion.div variants={stagger} initial="hidden" animate="show" className="flex flex-col gap-6">
      <motion.div variants={rise}>
        <Link to="/farms" className="inline-flex items-center gap-1.5 text-sm font-medium text-muted transition-colors hover:text-ink">
          <ArrowLeft className="size-4" /> All farms
        </Link>
      </motion.div>

      <motion.section variants={rise}>
        <Card className="overflow-hidden p-5 sm:p-7">
          <div aria-hidden className="pointer-events-none absolute -right-24 -top-24 size-80 rounded-full blur-3xl" style={{ background: `radial-gradient(circle, color-mix(in oklab, ${m.hue} 28%, transparent), transparent 70%)` }} />
          <div className="relative flex flex-col gap-5 md:flex-row md:items-center">
            <motion.div initial={{ scale: 0.6, rotate: -12 }} animate={{ scale: 1, rotate: 0 }} transition={{ type: "spring", stiffness: 260, damping: 15 }}>
              <CropGlyph emoji={m.emoji} hue={m.hue} size={72} className="!rounded-[22px]" />
            </motion.div>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="font-display text-3xl font-medium sm:text-4xl">{farm.farmer_name || farm.farm_id}</h1>
                {p && <StatusBadge status={p.harvest_status} />}
              </div>
              <p className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[14px] text-muted">
                <span className="font-medium text-ink-2">
                  {m.label} {m.hindi && <span className="text-muted">({m.hindi})</span>}
                </span>
                <span className="flex items-center gap-1">
                  <MapPin className="size-3.5" />
                  {[farm.district, farm.state].filter(Boolean).join(", ") || "Location set by coordinates"}
                </span>
                <span>Sown {fmtDate(farm.sowing_date, { day: "numeric", month: "short", year: "numeric" })}</span>
                {farm.area_ha ? <span>{farm.area_ha} ha</span> : null}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button variant="secondary" onClick={run} loading={running} icon={<RefreshCw className="size-4" />}>
                {p ? "Refresh" : "Run forecast"}
              </Button>
              <Button variant="secondary" onClick={() => setHarvestOpen(true)} icon={<ClipboardCheck className="size-4" />}>
                Record harvest
              </Button>
              <Link to={`/advisor?farm=${encodeURIComponent(farm.farm_id)}`}>
                <Button icon={<MessageCircle className="size-4" />}>Ask advisor</Button>
              </Link>
            </div>
          </div>
        </Card>
      </motion.section>

      {!p ? (
        <motion.div variants={rise}>
          <Card>
            <EmptyState
              icon={<Sparkles className="size-6" />}
              title="No forecast yet"
              body="Run the model to collect soil, weather and market data for this farm and predict its best harvest window."
              action={
                <Button size="lg" onClick={run} loading={running} icon={<Sparkles className="size-4" />}>
                  Run first forecast
                </Button>
              }
            />
          </Card>
        </motion.div>
      ) : (
        <>
          <Kpis p={p} area={farm.area_ha} />

          <motion.div variants={rise}>
            <div className="flex items-start gap-3 rounded-3xl border border-accent/40 bg-accent-soft/60 p-4 sm:items-center sm:p-5">
              <div className="grid size-10 shrink-0 place-items-center rounded-xl bg-accent text-[#1f1705]">
                <Sparkles className="size-5" />
              </div>
              <p className="text-[15px] leading-relaxed">
                {p.harvest_status === "overdue" ? (
                  <>Your {m.label.toLowerCase()} is <b>past its best harvest time</b> ({fmtDate(p.window_start)}–{fmtDate(p.window_end)}). Harvest as soon as possible to limit losses.</>
                ) : p.harvest_status === "ready" ? (
                  <>Your {m.label.toLowerCase()} is <b>ready now</b>. Harvest before <b>{fmtLongDate(p.window_end)}</b> for the best quality.</>
                ) : (
                  <>
                    Your {m.label.toLowerCase()} is <b>{Math.round(Math.min(p.maturity_pct, 100))}% mature</b>. Plan to harvest between <b>{fmtDate(p.window_start)}</b> and <b>{fmtDate(p.window_end)}</b>, ideally on{" "}
                    <b>{fmtLongDate(p.recommended_harvest_date)}</b>.
                  </>
                )}
              </p>
            </div>
          </motion.div>

          <motion.section variants={rise}>
            <Card className="pb-5">
              <CardHeader
                icon={<LineChart className="size-[18px]" />}
                title="Harvest readiness forecast"
                subtitle={`Next ${p.curve.length} days · model ${p.model_version}`}
                action={<span className="hidden text-xs text-muted sm:block">Updated {timeAgo(p.created_at)}</span>}
              />
              <div className="mt-4">
                <ReadinessChart prediction={p} />
              </div>
            </Card>
          </motion.section>

          <div className="grid gap-6 lg:grid-cols-2">
            <motion.div variants={rise}>
              <SeasonTimeline prediction={p} />
            </motion.div>
            <motion.div variants={rise}>
              <Card className="h-full">
                <CardHeader icon={<BellRing className="size-[18px]" />} title="Alerts & advice" subtitle="For the next 7 days" />
                <AlertList alerts={p.alerts} />
              </Card>
            </motion.div>
            <motion.div variants={rise}>
              <MarketCard market={p.market} crop={farm.crop} />
            </motion.div>
            <motion.div variants={rise}>
              <SoilCard soil={p.farm.soil} irrigated={irrigated} />
            </motion.div>
          </div>
        </>
      )}

      <motion.section variants={rise}>
        <Card>
          <CardHeader icon={<Info className="size-[18px]" />} title="Farm details" />
          <dl className="grid grid-cols-2 gap-x-6 gap-y-4 p-5 pt-4 text-sm sm:grid-cols-3 sm:p-6 sm:pt-4 lg:grid-cols-4">
            {[
              ["Farm ID", <span className="font-mono text-[13px]">{farm.farm_id}</span>],
              ["Language", LANGUAGES[farm.language] ? `${LANGUAGES[farm.language].native} (${LANGUAGES[farm.language].name})` : farm.language],
              ["Coordinates", `${farm.latitude.toFixed(3)}, ${farm.longitude.toFixed(3)}`],
              ["Water", irrigated ? "Irrigated" : "Rain-fed"],
              ["Soil type", farm.soil_type ?? "—"],
              ["Phone", farm.phone ?? "—"],
              ["Variety", (p?.farm.crop_info?.variety as string | undefined) ?? "—"],
              ["Forecast as of", p ? fmtLongDate(p.as_of_date) : "—"],
            ].map(([k, v]) => (
              <div key={k as string}>
                <dt className="text-xs font-medium text-muted">{k}</dt>
                <dd className="mt-0.5 font-medium">{v}</dd>
              </div>
            ))}
          </dl>
          {p && (
            <div className="flex items-center gap-2 border-t border-line px-5 py-3 text-xs text-muted sm:px-6">
              <Cpu className="size-3.5" /> Numbers come from the ML model and agronomy rules; the advisor only explains them.
            </div>
          )}
        </Card>
      </motion.section>

      <HarvestModal open={harvestOpen} onClose={() => setHarvestOpen(false)} farmId={farm.farm_id} />
    </motion.div>
  );
}
