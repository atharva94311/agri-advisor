import { AnimatePresence, motion } from "motion/react";
import { ArrowLeft, ArrowRight, Check, Droplets, CloudRain, LocateFixed, Sparkles } from "lucide-react";
import { useMemo, useState } from "react";
import { useNavigate } from "react-router";
import { toast } from "sonner";
import { Button, Card, CropGlyph, Field, Input, Select, spring } from "../components/ui";
import regions from "../data/regions.json";
import { api, type FarmInput } from "../lib/api";
import { cx, fmtLongDate, slugify, todayISO } from "../lib/format";
import { CROP_META, cropMeta, LANGUAGES, SOIL_TYPES } from "../lib/meta";
import { useStore } from "../lib/store";

const REGIONS = regions as Record<string, string[]>;
const STEPS = ["Farmer", "Crop", "Location", "Review"] as const;

interface Draft {
  farmer_name: string;
  phone: string;
  language: string;
  crop: string;
  sowing_date: string;
  area_ha: string;
  irrigated: boolean;
  soil_type: string;
  state: string;
  district: string;
  latitude: string;
  longitude: string;
  farm_id: string;
  idTouched: boolean;
}

const initial: Draft = {
  farmer_name: "",
  phone: "",
  language: "hi",
  crop: "",
  sowing_date: "",
  area_ha: "",
  irrigated: false,
  soil_type: "",
  state: "",
  district: "",
  latitude: "",
  longitude: "",
  farm_id: "",
  idTouched: false,
};

function validate(step: number, d: Draft, taken: Set<string>): Record<string, string> {
  const e: Record<string, string> = {};
  if (step === 0) {
    if (!d.farmer_name.trim()) e.farmer_name = "Enter the farmer's name";
    if (d.phone && !/^[+\d][\d\s-]{6,}$/.test(d.phone)) e.phone = "Enter a valid phone number";
  }
  if (step === 1) {
    if (!d.crop) e.crop = "Pick the crop that's in the field";
    if (!d.sowing_date) e.sowing_date = "Enter the sowing date";
    else if (d.sowing_date > todayISO()) e.sowing_date = "Sowing date can't be in the future";
    if (d.area_ha && !(Number(d.area_ha) > 0)) e.area_ha = "Area must be a positive number";
  }
  if (step === 2) {
    const lat = Number(d.latitude);
    const lon = Number(d.longitude);
    if (d.latitude === "" || isNaN(lat) || lat < 6 || lat > 37.5) e.latitude = "Latitude in India is between 6 and 37.5";
    if (d.longitude === "" || isNaN(lon) || lon < 68 || lon > 97.5) e.longitude = "Longitude in India is between 68 and 97.5";
  }
  if (step === 3) {
    if (!/^[a-z0-9][a-z0-9-]{1,39}$/.test(d.farm_id)) e.farm_id = "Use 2–40 lowercase letters, numbers or dashes";
    else if (taken.has(d.farm_id)) e.farm_id = "That ID is already used by another farm";
  }
  return e;
}

export default function NewFarm() {
  const nav = useNavigate();
  const { entries, health, upsertFarm, forecast } = useStore();
  const [step, setStep] = useState(0);
  const [dir, setDir] = useState(1);
  const [d, setD] = useState<Draft>(initial);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [locating, setLocating] = useState(false);
  const [done, setDone] = useState(false);
  const taken = useMemo(() => new Set(entries.map((e) => e.farm.farm_id)), [entries]);
  const crops = health?.crops ?? Object.keys(CROP_META);

  const set = <K extends keyof Draft>(k: K, v: Draft[K]) =>
    setD((prev) => {
      const next = { ...prev, [k]: v };
      if (!next.idTouched && (k === "farmer_name" || k === "crop" || k === "district")) {
        next.farm_id = slugify([next.farmer_name, next.crop, next.district].filter(Boolean).join(" "));
      }
      return next;
    });

  const go = (to: number) => {
    if (to > step) {
      const e = validate(step, d, taken);
      setErrors(e);
      if (Object.keys(e).length) return;
    }
    setDir(to > step ? 1 : -1);
    setStep(to);
  };

  const locate = () => {
    if (!navigator.geolocation) return toast.error("Location isn't available in this browser");
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setD((p) => ({ ...p, latitude: pos.coords.latitude.toFixed(4), longitude: pos.coords.longitude.toFixed(4) }));
        setLocating(false);
        toast.success("Location captured");
      },
      (err) => {
        setLocating(false);
        toast.error("Couldn't get location", { description: err.message });
      },
      { enableHighAccuracy: true, timeout: 10000 },
    );
  };

  const submit = async () => {
    const e = validate(3, d, taken);
    setErrors(e);
    if (Object.keys(e).length) return;
    setSubmitting(true);
    const body: FarmInput = {
      farm_id: d.farm_id,
      farmer_name: d.farmer_name.trim(),
      phone: d.phone.trim() || undefined,
      language: d.language,
      latitude: Number(d.latitude),
      longitude: Number(d.longitude),
      state: d.state || undefined,
      district: d.district || undefined,
      crop: d.crop,
      sowing_date: d.sowing_date,
      irrigated: d.irrigated,
      area_ha: d.area_ha ? Number(d.area_ha) : undefined,
      soil_type: d.soil_type || undefined,
    };
    try {
      const farm = await api.registerFarm(body);
      upsertFarm(farm);
      setDone(true);
      try {
        await forecast(farm.farm_id);
      } catch (err) {
        toast.warning("Farm saved, but the first forecast failed", { description: (err as Error).message });
      }
      setTimeout(() => nav(`/farms/${farm.farm_id}`), 900);
    } catch (err) {
      toast.error("Couldn't register the farm", { description: (err as Error).message });
      setSubmitting(false);
    }
  };

  const districts = d.state ? REGIONS[d.state] ?? [] : [];

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6">
      <div>
        <h1 className="font-display text-4xl font-medium">Register a farm</h1>
        <p className="mt-1 text-[15px] text-muted">Four quick steps. We'll run the first harvest forecast right after.</p>
      </div>

      <ol className="flex items-center gap-2">
        {STEPS.map((s, i) => (
          <li key={s} className="flex flex-1 items-center gap-2">
            <button
              onClick={() => i < step && go(i)}
              disabled={i > step}
              className={cx("flex items-center gap-2 text-[13px] font-medium transition-colors", i <= step ? "text-ink" : "text-muted")}
            >
              <motion.span
                key={i < step ? "done" : "todo"}
                initial={{ scale: 0.6 }}
                animate={{ scale: 1 }}
                transition={spring}
                className={cx(
                  "grid size-7 place-items-center rounded-full text-xs font-semibold transition-colors duration-300",
                  i < step ? "bg-primary text-on-primary" : i === step ? "bg-accent text-[#1f1705] shadow-[0_0_0_4px_var(--accent-soft)]" : "bg-surface-2 text-muted",
                )}
              >
                {i < step ? <Check className="size-4" /> : i + 1}
              </motion.span>
              <span className="hidden sm:inline">{s}</span>
            </button>
            {i < STEPS.length - 1 && (
              <div className="h-0.5 flex-1 overflow-hidden rounded-full bg-surface-2">
                <motion.div className="h-full w-full origin-left bg-primary" initial={false} animate={{ scaleX: i < step ? 1 : 0 }} transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }} />
              </div>
            )}
          </li>
        ))}
      </ol>

      <Card className="overflow-hidden">
        <div className="relative min-h-[420px] p-5 sm:p-8">
          <AnimatePresence mode="wait" custom={dir} initial={false}>
            <motion.div
              key={done ? "done" : step}
              custom={dir}
              variants={{
                enter: (dr: number) => ({ x: dr * 40, opacity: 0 }),
                center: { x: 0, opacity: 1 },
                exit: (dr: number) => ({ x: dr * -40, opacity: 0 }),
              }}
              initial="enter"
              animate="center"
              exit="exit"
              transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
            >
              {done ? (
                <div className="flex flex-col items-center py-16 text-center">
                  <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: "spring", stiffness: 260, damping: 12 }} className="grid size-20 place-items-center rounded-full bg-primary text-on-primary">
                    <motion.svg viewBox="0 0 24 24" className="size-10" fill="none" stroke="currentColor" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round">
                      <motion.path d="M5 12.5l4.5 4.5L19 7.5" initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ delay: 0.25, duration: 0.45 }} />
                    </motion.svg>
                  </motion.div>
                  <h2 className="font-display mt-6 text-3xl font-medium">Farm registered</h2>
                  <p className="mt-2 flex items-center gap-2 text-muted">
                    <Sparkles className="size-4 text-accent" /> Running the first forecast…
                  </p>
                </div>
              ) : step === 0 ? (
                <div className="flex flex-col gap-6">
                  <div className="grid gap-5 sm:grid-cols-2">
                    <Field label="Farmer's name" error={errors.farmer_name} htmlFor="fn">
                      <Input id="fn" autoFocus value={d.farmer_name} onChange={(e) => set("farmer_name", e.target.value)} placeholder="e.g. Ramesh Kumar" />
                    </Field>
                    <Field label="Phone" hint="Optional, for voice calls and SMS" error={errors.phone} htmlFor="ph">
                      <Input id="ph" type="tel" inputMode="tel" value={d.phone} onChange={(e) => set("phone", e.target.value)} placeholder="+91 98765 43210" />
                    </Field>
                  </div>
                  <div>
                    <div className="mb-2 text-[13px] font-medium text-ink-2">Preferred language</div>
                    <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                      {Object.entries(LANGUAGES).map(([code, l]) => (
                        <button
                          key={code}
                          type="button"
                          onClick={() => set("language", code)}
                          className={cx("relative rounded-2xl border p-3 text-left transition-colors", d.language === code ? "border-primary-2" : "border-line hover:border-line-strong")}
                        >
                          {d.language === code && <motion.span layoutId="lang-sel" transition={spring} className="absolute inset-0 rounded-2xl bg-primary-soft" />}
                          <span className="relative block text-[16px] font-semibold">{l.native}</span>
                          <span className="relative block text-xs text-muted">{l.name}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              ) : step === 1 ? (
                <div className="flex flex-col gap-6">
                  <div>
                    <div className="mb-2 flex items-baseline justify-between">
                      <span className="text-[13px] font-medium text-ink-2">Crop in the field</span>
                      {errors.crop && <span className="text-xs text-danger">{errors.crop}</span>}
                    </div>
                    <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
                      {crops.map((c) => {
                        const m = cropMeta(c);
                        const sel = d.crop === c;
                        return (
                          <motion.button
                            key={c}
                            type="button"
                            whileTap={{ scale: 0.95 }}
                            onClick={() => set("crop", c)}
                            className={cx("relative flex flex-col items-center gap-1.5 rounded-2xl border p-3 transition-colors", sel ? "border-primary-2" : "border-line hover:border-line-strong")}
                          >
                            {sel && <motion.span layoutId="crop-sel" transition={spring} className="absolute inset-0 rounded-2xl bg-primary-soft" />}
                            <CropGlyph emoji={m.emoji} hue={m.hue} size={40} className="relative" />
                            <span className="relative text-[13px] font-medium">{m.label}</span>
                          </motion.button>
                        );
                      })}
                    </div>
                  </div>
                  <div className="grid gap-5 sm:grid-cols-2">
                    <Field label="Sowing date" error={errors.sowing_date} htmlFor="sd">
                      <Input id="sd" type="date" max={todayISO()} value={d.sowing_date} onChange={(e) => set("sowing_date", e.target.value)} />
                    </Field>
                    <Field label="Area (hectares)" hint="Optional" error={errors.area_ha} htmlFor="ar">
                      <Input id="ar" type="number" min={0} step="0.1" inputMode="decimal" value={d.area_ha} onChange={(e) => set("area_ha", e.target.value)} placeholder="e.g. 1.5" />
                    </Field>
                    <Field label="Soil type" hint="Optional. Measured soil data is used when available" htmlFor="st">
                      <Select id="st" value={d.soil_type} onChange={(e) => set("soil_type", e.target.value)}>
                        <option value="">Not sure</option>
                        {SOIL_TYPES.map((s) => (
                          <option key={s}>{s}</option>
                        ))}
                      </Select>
                    </Field>
                    <div className="flex flex-col gap-1.5">
                      <span className="text-[13px] font-medium text-ink-2">Water source</span>
                      <div className="grid grid-cols-2 gap-2">
                        {[
                          { v: false, label: "Rain-fed", icon: CloudRain },
                          { v: true, label: "Irrigated", icon: Droplets },
                        ].map((o) => (
                          <button key={o.label} type="button" onClick={() => set("irrigated", o.v)} className={cx("relative flex h-11 items-center justify-center gap-2 rounded-xl border text-sm font-medium transition-colors", d.irrigated === o.v ? "border-primary-2 text-primary" : "border-line text-ink-2 hover:border-line-strong")}>
                            {d.irrigated === o.v && <motion.span layoutId="water-sel" transition={spring} className="absolute inset-0 rounded-xl bg-primary-soft" />}
                            <o.icon className="relative size-4" />
                            <span className="relative">{o.label}</span>
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              ) : step === 2 ? (
                <div className="flex flex-col gap-6">
                  <div className="grid gap-5 sm:grid-cols-2">
                    <Field label="State" hint="Matching names improve rainfall accuracy" htmlFor="state">
                      <Select id="state" value={d.state} onChange={(e) => { set("state", e.target.value); set("district", ""); }}>
                        <option value="">Select state</option>
                        {Object.keys(REGIONS).map((s) => (
                          <option key={s}>{s}</option>
                        ))}
                      </Select>
                    </Field>
                    <Field label="District" htmlFor="district">
                      <Input id="district" list="districts" value={d.district} disabled={!d.state} onChange={(e) => set("district", e.target.value)} placeholder={d.state ? "Start typing…" : "Select a state first"} />
                      <datalist id="districts">
                        {districts.map((x) => (
                          <option key={x} value={x} />
                        ))}
                      </datalist>
                    </Field>
                  </div>
                  <div className="rounded-3xl border border-dashed border-line-strong bg-bg/40 p-5">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <div className="text-[15px] font-semibold">Field coordinates</div>
                        <p className="text-[13px] text-muted">Used for local weather and soil. Stand in the field and tap the button, or type them in.</p>
                      </div>
                      <Button type="button" variant="secondary" loading={locating} onClick={locate} icon={<LocateFixed className="size-4" />}>
                        Use my location
                      </Button>
                    </div>
                    <div className="mt-4 grid gap-4 sm:grid-cols-2">
                      <Field label="Latitude" error={errors.latitude} htmlFor="lat">
                        <Input id="lat" inputMode="decimal" value={d.latitude} onChange={(e) => set("latitude", e.target.value)} placeholder="e.g. 23.2300" />
                      </Field>
                      <Field label="Longitude" error={errors.longitude} htmlFor="lon">
                        <Input id="lon" inputMode="decimal" value={d.longitude} onChange={(e) => set("longitude", e.target.value)} placeholder="e.g. 87.8600" />
                      </Field>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="flex flex-col gap-6">
                  <div className="flex items-center gap-4 rounded-3xl bg-surface-2/60 p-5">
                    <CropGlyph emoji={cropMeta(d.crop).emoji} hue={cropMeta(d.crop).hue} size={60} />
                    <div>
                      <div className="font-display text-2xl font-medium">{d.farmer_name}</div>
                      <div className="text-sm text-muted">
                        {cropMeta(d.crop).label} · sown {d.sowing_date && fmtLongDate(d.sowing_date)}
                      </div>
                    </div>
                  </div>
                  <dl className="grid grid-cols-2 gap-x-6 gap-y-4 text-sm sm:grid-cols-3">
                    {[
                      ["Language", `${LANGUAGES[d.language].native} (${LANGUAGES[d.language].name})`],
                      ["Phone", d.phone || "—"],
                      ["Area", d.area_ha ? `${d.area_ha} ha` : "—"],
                      ["Water", d.irrigated ? "Irrigated" : "Rain-fed"],
                      ["Soil type", d.soil_type || "Not sure"],
                      ["Location", [d.district, d.state].filter(Boolean).join(", ") || "—"],
                      ["Coordinates", `${d.latitude}, ${d.longitude}`],
                    ].map(([k, v]) => (
                      <div key={k}>
                        <dt className="text-xs font-medium text-muted">{k}</dt>
                        <dd className="mt-0.5 font-medium">{v}</dd>
                      </div>
                    ))}
                  </dl>
                  <Field label="Farm ID" hint="A short unique handle for this field. Generated for you; edit if you like." error={errors.farm_id} htmlFor="fid">
                    <Input id="fid" className="font-mono" value={d.farm_id} onChange={(e) => setD((p) => ({ ...p, farm_id: e.target.value.toLowerCase(), idTouched: true }))} />
                  </Field>
                </div>
              )}
            </motion.div>
          </AnimatePresence>
        </div>
        {!done && (
          <div className="flex items-center justify-between border-t border-line bg-surface-2/30 px-5 py-4 sm:px-8">
            <Button variant="ghost" onClick={() => (step === 0 ? nav(-1) : go(step - 1))} icon={<ArrowLeft className="size-4" />}>
              {step === 0 ? "Cancel" : "Back"}
            </Button>
            {step < STEPS.length - 1 ? (
              <Button onClick={() => go(step + 1)}>
                Continue <ArrowRight className="size-4" />
              </Button>
            ) : (
              <Button variant="accent" loading={submitting} onClick={submit} icon={<Sparkles className="size-4" />}>
                Register & forecast
              </Button>
            )}
          </div>
        )}
      </Card>
    </div>
  );
}
