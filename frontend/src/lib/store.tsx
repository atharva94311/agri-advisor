import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { api, type Farm, type Health, type Prediction } from "./api";

export interface FarmEntry {
  farm: Farm;
  prediction: Prediction | null;
}

interface Store {
  entries: FarmEntry[];
  health: Health | null;
  loading: boolean;
  error: string | null;
  reload: () => Promise<void>;
  /** Run collect + model for one farm and merge the fresh prediction into the store. */
  forecast: (farmId: string) => Promise<Prediction>;
  upsertFarm: (farm: Farm) => void;
  entry: (farmId: string) => FarmEntry | undefined;
}

const Ctx = createContext<Store | null>(null);

export function StoreProvider({ children }: { children: ReactNode }) {
  const [entries, setEntries] = useState<FarmEntry[]>([]);
  const [health, setHealth] = useState<Health | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const seq = useRef(0);

  const reload = useCallback(async () => {
    const my = ++seq.current;
    setLoading(true);
    setError(null);
    try {
      const [h, farms] = await Promise.all([api.health(), api.farms()]);
      const preds = await Promise.all(farms.map((f) => api.prediction(f.farm_id).catch(() => null)));
      if (my !== seq.current) return;
      setHealth(h);
      setEntries(farms.map((farm, i) => ({ farm, prediction: preds[i] })));
    } catch (e) {
      if (my === seq.current) setError((e as Error).message);
    } finally {
      if (my === seq.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  const forecast = useCallback(async (farmId: string) => {
    const p = await api.predict(farmId, true);
    setEntries((es) => es.map((e) => (e.farm.farm_id === farmId ? { ...e, prediction: p } : e)));
    return p;
  }, []);

  const upsertFarm = useCallback((farm: Farm) => {
    setEntries((es) => {
      const i = es.findIndex((e) => e.farm.farm_id === farm.farm_id);
      if (i === -1) return [...es, { farm, prediction: null }];
      const next = es.slice();
      next[i] = { ...next[i], farm };
      return next;
    });
  }, []);

  const value = useMemo<Store>(
    () => ({
      entries,
      health,
      loading,
      error,
      reload,
      forecast,
      upsertFarm,
      entry: (id) => entries.find((e) => e.farm.farm_id === id),
    }),
    [entries, health, loading, error, reload, forecast, upsertFarm],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useStore() {
  const s = useContext(Ctx);
  if (!s) throw new Error("useStore outside StoreProvider");
  return s;
}

/** Theme: "light" | "dark", persisted per browser. */
export function useTheme() {
  const [dark, setDark] = useState(() => document.documentElement.classList.contains("dark"));
  const toggle = useCallback(() => {
    setDark((d) => {
      const next = !d;
      const apply = () => document.documentElement.classList.toggle("dark", next);
      const doc = document as Document & { startViewTransition?: (cb: () => void) => void };
      if (doc.startViewTransition && !matchMedia("(prefers-reduced-motion: reduce)").matches) doc.startViewTransition(apply);
      else apply();
      try {
        localStorage.setItem("fasal-theme", next ? "dark" : "light");
      } catch {
        /* storage blocked */
      }
      return next;
    });
  }, []);
  return { dark, toggle };
}
