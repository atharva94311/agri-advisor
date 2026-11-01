import { AnimatePresence, motion } from "motion/react";
import {
  LayoutDashboard,
  MessageCircle,
  Moon,
  Plus,
  RefreshCw,
  Search,
  Server,
  Sprout,
  Sun,
  WifiOff,
} from "lucide-react";
import { useEffect, useState } from "react";
import { NavLink, useLocation, useOutlet } from "react-router";
import { cx } from "../lib/format";
import { useStore, useTheme } from "../lib/store";
import { CommandPalette } from "./CommandPalette";
import { Button, IconButton, spring } from "./ui";

const NAV = [
  { to: "/", label: "Overview", icon: LayoutDashboard, end: true },
  { to: "/farms", label: "Farms", icon: Sprout, end: false },
  { to: "/advisor", label: "Advisor", icon: MessageCircle, end: false },
  { to: "/system", label: "System", icon: Server, end: false },
];

export function Logo({ compact }: { compact?: boolean }) {
  return (
    <div className="flex items-center gap-2.5">
      <div className="relative grid size-9 place-items-center rounded-[11px] bg-brand text-brand-ink shadow-[0_6px_16px_-8px_#1f5c3a]">
        <svg viewBox="0 0 32 32" className="sway size-6" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
          <path d="M16 26V12" />
          <path d="M16 18c-4.2 0-6.5-3-6.5-6.4 4.2 0 6.5 3 6.5 6.4Z" />
          <path d="M16 15.5c4.2 0 6.5-3 6.5-6.4-4.2 0-6.5 3-6.5 6.4Z" />
        </svg>
      </div>
      {!compact && (
        <div className="leading-none">
          <div className="font-display text-[22px] font-semibold">Fasal</div>
          <div className="mt-0.5 text-[10.5px] font-medium uppercase tracking-[0.14em] text-muted">Harvest advisor</div>
        </div>
      )}
    </div>
  );
}

function SideNav({ onSearch }: { onSearch: () => void }) {
  const { health, error } = useStore();
  return (
    <aside className="sticky top-0 hidden h-dvh w-[248px] shrink-0 flex-col border-r border-line/70 px-4 py-6 lg:flex">
      <div className="px-2">
        <Logo />
      </div>

      <button
        onClick={onSearch}
        className="mt-7 flex h-10 items-center gap-2.5 rounded-xl border border-line bg-surface px-3 text-sm text-muted transition-colors hover:border-line-strong"
      >
        <Search className="size-4" />
        <span className="flex-1 text-left">Search…</span>
        <kbd className="rounded-md border border-line bg-surface-2 px-1.5 py-0.5 font-mono text-[10.5px]">⌘K</kbd>
      </button>

      <nav className="mt-6 flex flex-col gap-1">
        {NAV.map((n) => (
          <NavLink key={n.to} to={n.to} end={n.end} className="relative">
            {({ isActive }) => (
              <div className={cx("relative flex h-11 items-center gap-3 rounded-xl px-3 text-[14.5px] font-medium transition-colors", isActive ? "text-ink" : "text-muted hover:text-ink")}>
                {isActive && (
                  <motion.div layoutId="nav-pill" transition={spring} className="absolute inset-0 rounded-xl border border-line bg-surface shadow-[var(--shadow-soft)]" />
                )}
                <n.icon className={cx("relative size-[18px]", isActive && "text-primary")} />
                <span className="relative">{n.label}</span>
              </div>
            )}
          </NavLink>
        ))}
      </nav>

      <NavLink to="/farms/new" className="mt-5">
        <Button className="w-full" icon={<Plus className="size-4" />}>
          Register a farm
        </Button>
      </NavLink>

      <div className="mt-auto rounded-2xl border border-line bg-surface p-4">
        <div className="flex items-center gap-2 text-[13px] font-medium">
          <span className={cx("size-2 rounded-full", error ? "bg-danger" : health ? "bg-primary-2" : "bg-muted")} />
          {error ? "Server offline" : health ? "Connected" : "Connecting…"}
        </div>
        <p className="mt-1 text-xs leading-relaxed text-muted">
          {health
            ? `Live data · ${health.llm_configured ? "AI replies on" : "Template replies"}`
            : "Advisory API on :8000"}
        </p>
      </div>
    </aside>
  );
}

function MobileNav() {
  const items = [NAV[0], NAV[1], { to: "/farms/new", label: "Add", icon: Plus, end: true }, NAV[2], NAV[3]];
  return (
    <nav className="fixed inset-x-3 bottom-3 z-40 flex items-center justify-around rounded-2xl border border-line bg-surface/85 px-1 py-1.5 shadow-[var(--shadow-lift)] backdrop-blur-xl lg:hidden" style={{ paddingBottom: "max(6px, env(safe-area-inset-bottom))" }}>
      {items.map((n) => (
        <NavLink key={n.to} to={n.to} end={n.end} className="flex-1">
          {({ isActive }) =>
            n.to === "/farms/new" ? (
              <div className="mx-auto grid size-11 place-items-center rounded-full bg-primary text-on-primary shadow-[0_8px_18px_-8px_var(--primary)]">
                <Plus className="size-5" />
              </div>
            ) : (
              <div className={cx("relative flex flex-col items-center gap-0.5 rounded-xl py-1.5 text-[10.5px] font-medium", isActive ? "text-primary" : "text-muted")}>
                {isActive && <motion.div layoutId="mnav" transition={spring} className="absolute inset-x-2 inset-y-0 rounded-xl bg-primary-soft" />}
                <n.icon className="relative size-5" />
                <span className="relative">{n.label}</span>
              </div>
            )
          }
        </NavLink>
      ))}
    </nav>
  );
}

function OfflineBanner() {
  const { error, reload, loading } = useStore();
  return (
    <AnimatePresence>
      {error && (
        <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
          <div className="mx-4 mt-4 flex flex-wrap items-center gap-3 rounded-2xl border border-danger/25 bg-danger-soft px-4 py-3 text-sm text-danger sm:mx-8">
            <WifiOff className="size-4 shrink-0" />
            <span className="min-w-0 flex-1">{error}</span>
            <Button size="sm" variant="secondary" loading={loading} onClick={reload} icon={<RefreshCw className="size-3.5" />}>
              Retry
            </Button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/** Keeps the outgoing page rendered during its exit animation. */
function FrozenOutlet() {
  const outlet = useOutlet();
  const [frozen] = useState(outlet);
  return frozen;
}

export function Layout() {
  const location = useLocation();
  const { dark, toggle } = useTheme();
  const [paletteOpen, setPaletteOpen] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPaletteOpen((o) => !o);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, [location.pathname]);

  return (
    <div className="relative z-10 flex min-h-dvh">
      <SideNav onSearch={() => setPaletteOpen(true)} />
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-16 items-center gap-2 border-b border-line/60 bg-bg/75 px-4 backdrop-blur-xl sm:px-8 lg:static lg:border-transparent lg:bg-transparent lg:backdrop-blur-none">
          <div className="lg:hidden">
            <Logo compact />
          </div>
          <div className="flex-1" />
          <IconButton label="Search (⌘K)" onClick={() => setPaletteOpen(true)} className="lg:hidden">
            <Search className="size-5" />
          </IconButton>
          <IconButton label={dark ? "Light mode" : "Dark mode"} onClick={toggle}>
            <AnimatePresence mode="wait" initial={false}>
              <motion.span key={dark ? "m" : "s"} initial={{ rotate: -90, opacity: 0, scale: 0.6 }} animate={{ rotate: 0, opacity: 1, scale: 1 }} exit={{ rotate: 90, opacity: 0, scale: 0.6 }} transition={{ duration: 0.2 }}>
                {dark ? <Moon className="size-5" /> : <Sun className="size-5" />}
              </motion.span>
            </AnimatePresence>
          </IconButton>
        </header>
        <OfflineBanner />
        <main className="flex-1 px-4 pb-28 pt-2 sm:px-8 lg:pb-12">
          <AnimatePresence mode="wait">
            <motion.div
              key={location.pathname}
              initial={{ opacity: 0, y: 12, filter: "blur(4px)" }}
              animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
              exit={{ opacity: 0, y: -8, filter: "blur(4px)" }}
              transition={{ duration: 0.32, ease: [0.16, 1, 0.3, 1] }}
              className="mx-auto w-full max-w-[1240px]"
            >
              <FrozenOutlet />
            </motion.div>
          </AnimatePresence>
        </main>
      </div>
      <MobileNav />
      <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} onToggleTheme={toggle} />
    </div>
  );
}
