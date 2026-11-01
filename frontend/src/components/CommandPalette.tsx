import { Command } from "cmdk";
import { AnimatePresence, motion } from "motion/react";
import { LayoutDashboard, MessageCircle, Moon, Plus, RefreshCw, Search, Server, Sprout } from "lucide-react";
import { useEffect, type ReactNode } from "react";
import { useNavigate } from "react-router";
import { cropMeta, LANGUAGES } from "../lib/meta";
import { useStore } from "../lib/store";

function Item({ onSelect, icon, children, hint, value }: { onSelect: () => void; icon: ReactNode; children: ReactNode; hint?: string; value?: string }) {
  return (
    <Command.Item value={value} onSelect={onSelect} className="flex cursor-pointer items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-ink">
      <span className="grid size-8 place-items-center rounded-lg bg-surface-2 text-ink-2">{icon}</span>
      <span className="flex-1 truncate">{children}</span>
      {hint && <span className="text-xs text-muted">{hint}</span>}
    </Command.Item>
  );
}

export function CommandPalette({ open, onOpenChange, onToggleTheme }: { open: boolean; onOpenChange: (o: boolean) => void; onToggleTheme: () => void }) {
  const nav = useNavigate();
  const { entries, reload } = useStore();
  const go = (to: string) => {
    onOpenChange(false);
    nav(to);
  };

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onOpenChange(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onOpenChange]);

  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-[60] flex items-start justify-center px-4 pt-[12vh]">
          <motion.div className="absolute inset-0 bg-[#0b120d]/35 backdrop-blur-sm" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => onOpenChange(false)} />
          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: -8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.97, y: -6 }}
            transition={{ type: "spring", stiffness: 420, damping: 32 }}
            className="relative w-full max-w-xl overflow-hidden rounded-3xl border border-line bg-surface shadow-[var(--shadow-lift)]"
          >
            <Command label="Command menu" loop>
              <div className="flex items-center gap-3 border-b border-line px-4">
                <Search className="size-5 text-muted" />
                <Command.Input autoFocus placeholder="Jump to a farm, page or action…" className="h-14 flex-1 bg-transparent text-[15px] text-ink outline-none placeholder:text-muted focus-visible:outline-none" />
                <kbd className="rounded-md border border-line bg-surface-2 px-1.5 py-0.5 font-mono text-[10.5px] text-muted">esc</kbd>
              </div>
              <Command.List className="max-h-[52vh] overflow-y-auto p-2">
                <Command.Empty className="px-3 py-10 text-center text-sm text-muted">Nothing matches that.</Command.Empty>
                {entries.length > 0 && (
                  <Command.Group heading="Farms">
                    {entries.map(({ farm }) => {
                      const m = cropMeta(farm.crop);
                      return (
                        <Item
                          key={farm.farm_id}
                          value={`${farm.farm_id} ${farm.farmer_name ?? ""} ${farm.crop} ${farm.district ?? ""} ${farm.state ?? ""}`}
                          onSelect={() => go(`/farms/${farm.farm_id}`)}
                          icon={<span>{m.emoji}</span>}
                          hint={[farm.district, LANGUAGES[farm.language]?.native].filter(Boolean).join(" · ")}
                        >
                          {farm.farmer_name || farm.farm_id} <span className="text-muted">· {m.label}</span>
                        </Item>
                      );
                    })}
                  </Command.Group>
                )}
                <Command.Group heading="Go to">
                  <Item onSelect={() => go("/")} icon={<LayoutDashboard className="size-4" />}>Overview</Item>
                  <Item onSelect={() => go("/farms")} icon={<Sprout className="size-4" />}>All farms</Item>
                  <Item onSelect={() => go("/advisor")} icon={<MessageCircle className="size-4" />}>Ask the advisor</Item>
                  <Item onSelect={() => go("/system")} icon={<Server className="size-4" />}>System status</Item>
                </Command.Group>
                <Command.Group heading="Actions">
                  <Item onSelect={() => go("/farms/new")} icon={<Plus className="size-4" />}>Register a new farm</Item>
                  <Item onSelect={() => { onOpenChange(false); reload(); }} icon={<RefreshCw className="size-4" />}>Refresh data</Item>
                  <Item onSelect={() => { onOpenChange(false); onToggleTheme(); }} icon={<Moon className="size-4" />}>Toggle dark mode</Item>
                </Command.Group>
              </Command.List>
            </Command>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
