import { motion } from "motion/react";
import type { Prediction } from "../lib/api";

/** Tiny readiness sparkline for farm cards. */
export function Sparkline({ prediction }: { prediction: Prediction }) {
  const pts = prediction.curve;
  if (pts.length < 2) return null;
  const w = 120;
  const h = 36;
  const path = pts.map((p, i) => `${i === 0 ? "M" : "L"}${((i / (pts.length - 1)) * w).toFixed(1)},${(h - 2 - p.readiness * (h - 4)).toFixed(1)}`).join(" ");
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} className="overflow-visible">
      <motion.path d={path} fill="none" stroke="var(--accent)" strokeWidth={2} strokeLinecap="round" initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 1.2, ease: "easeOut" }} />
      <motion.path d={`${path} L${w},${h} L0,${h} Z`} fill="var(--accent)" initial={{ opacity: 0 }} animate={{ opacity: 0.12 }} transition={{ delay: 0.6 }} />
    </svg>
  );
}
