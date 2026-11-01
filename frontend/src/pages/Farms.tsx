import { motion } from "motion/react";
import { Plus, RefreshCw, Search, SearchX, Sprout } from "lucide-react";
import { useMemo, useState } from "react";
import { Link } from "react-router";
import { toast } from "sonner";
import { FarmCard } from "../components/FarmWidgets";
import { Button, Card, EmptyState, Segmented, Skeleton, stagger } from "../components/ui";
import { cx } from "../lib/format";
import { cropMeta } from "../lib/meta";
import { useStore } from "../lib/store";

type StatusFilter = "all" | "soon" | "growing" | "none";
type Sort = "harvest" | "name" | "health";

export default function Farms() {
  const { entries, loading, forecast } = useStore();
  const [q, setQ] = useState("");
  const [crop, setCrop] = useState<string | null>(null);
  const [status, setStatus] = useState<StatusFilter>("all");
  const [sort, setSort] = useState<Sort>("harvest");
  const [running, setRunning] = useState(false);

  const crops = useMemo(() => [...new Set(entries.map((e) => e.farm.crop))].sort(), [entries]);

  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return entries
      .filter((e) => {
        const f = e.farm;
        if (crop && f.crop !== crop) return false;
        if (needle && ![f.farm_id, f.farmer_name, f.crop, f.district, f.state].some((s) => s?.toLowerCase().includes(needle))) return false;
        const st = e.prediction?.harvest_status;
        if (status === "soon") return st === "ready" || st === "overdue" || st === "approaching";
        if (status === "growing") return st === "growing";
        if (status === "none") return !e.prediction;
        return true;
      })
      .sort((a, b) => {
        if (sort === "name") return (a.farm.farmer_name || a.farm.farm_id).localeCompare(b.farm.farmer_name || b.farm.farm_id);
        if (sort === "health") return (a.prediction?.health_now ?? 2) - (b.prediction?.health_now ?? 2);
        return (a.prediction?.recommended_harvest_date ?? "9999").localeCompare(b.prediction?.recommended_harvest_date ?? "9999");
      });
  }, [entries, q, crop, status, sort]);

  const runAll = async () => {
    setRunning(true);
    const id = toast.loading(`Forecasting ${entries.length} farms…`);
    let ok = 0;
    for (const e of entries) {
      try {
        await forecast(e.farm.farm_id);
        ok++;
      } catch {
        /* reported below */
      }
    }
    setRunning(false);
    if (ok === entries.length) toast.success(`Updated ${ok} forecasts`, { id });
    else toast.error(`Updated ${ok} of ${entries.length}; some farms failed`, { id });
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-4xl font-medium">Farms</h1>
          <p className="mt-1 text-[15px] text-muted">Every registered field and its latest forecast.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" loading={running} disabled={!entries.length} onClick={runAll} icon={<RefreshCw className="size-4" />}>
            Forecast all
          </Button>
          <Link to="/farms/new">
            <Button icon={<Plus className="size-4" />}>Add farm</Button>
          </Link>
        </div>
      </div>

      <Card className="flex flex-col gap-4 p-4 sm:p-5">
        <div className="flex flex-col gap-3 md:flex-row md:items-center">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search by farmer, district, crop or ID"
              className="h-11 w-full rounded-xl border border-line bg-bg/50 pl-10 pr-3 text-[15px] outline-none transition focus:border-primary-2 focus:shadow-[0_0_0_4px_var(--primary-soft)]"
            />
          </div>
          <Segmented<StatusFilter>
            value={status}
            onChange={setStatus}
            options={[
              { value: "all", label: "All" },
              { value: "soon", label: "Harvest soon" },
              { value: "growing", label: "Growing" },
              { value: "none", label: "No forecast" },
            ]}
            className="overflow-x-auto"
          />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => setCrop(null)}
            className={cx("rounded-full border px-3 py-1.5 text-[13px] font-medium transition", !crop ? "border-primary bg-primary text-on-primary" : "border-line text-ink-2 hover:border-line-strong")}
          >
            All crops
          </button>
          {crops.map((c) => {
            const m = cropMeta(c);
            return (
              <button
                key={c}
                onClick={() => setCrop(crop === c ? null : c)}
                className={cx("rounded-full border px-3 py-1.5 text-[13px] font-medium transition", crop === c ? "border-primary bg-primary text-on-primary" : "border-line text-ink-2 hover:border-line-strong")}
              >
                {m.emoji} {m.label}
              </button>
            );
          })}
          <div className="ml-auto flex items-center gap-2 text-[13px] text-muted">
            Sort
            <select value={sort} onChange={(e) => setSort(e.target.value as Sort)} className="rounded-lg border border-line bg-surface px-2 py-1.5 text-[13px] text-ink outline-none">
              <option value="harvest">Harvest date</option>
              <option value="health">Needs attention</option>
              <option value="name">Name</option>
            </select>
          </div>
        </div>
      </Card>

      {loading && !entries.length ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }, (_, i) => (
            <Skeleton key={i} className="h-[196px] rounded-3xl" />
          ))}
        </div>
      ) : entries.length === 0 ? (
        <Card>
          <EmptyState
            icon={<Sprout className="size-6" />}
            title="No farms registered"
            body="Add a farm to start forecasting its harvest."
            action={
              <Link to="/farms/new">
                <Button icon={<Plus className="size-4" />}>Register a farm</Button>
              </Link>
            }
          />
        </Card>
      ) : shown.length === 0 ? (
        <Card>
          <EmptyState icon={<SearchX className="size-6" />} title="No matches" body="Try a different search or clear the filters." action={<Button variant="secondary" onClick={() => { setQ(""); setCrop(null); setStatus("all"); }}>Clear filters</Button>} />
        </Card>
      ) : (
        <motion.div variants={stagger} initial="hidden" animate="show" className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {shown.map((e, i) => (
            <FarmCard key={e.farm.farm_id} farm={e.farm} prediction={e.prediction} index={i} />
          ))}
        </motion.div>
      )}
      <p className="text-center text-xs text-muted">
        Showing {shown.length} of {entries.length} farms
      </p>
    </div>
  );
}
