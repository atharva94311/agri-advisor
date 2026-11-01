import { motion } from "motion/react";

/** Layered field-and-hills illustration for the overview hero. Pure SVG, theme-aware. */
export function Landscape({ className }: { className?: string }) {
  const rows = Array.from({ length: 9 }, (_, i) => i);
  return (
    <svg viewBox="0 0 600 260" preserveAspectRatio="xMidYMax slice" className={className} aria-hidden>
      <defs>
        <linearGradient id="ls-sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="var(--accent)" stopOpacity="0.22" />
          <stop offset="100%" stopColor="var(--accent)" stopOpacity="0" />
        </linearGradient>
        <radialGradient id="ls-sun" cx="0.5" cy="0.5" r="0.5">
          <stop offset="0%" stopColor="var(--accent)" stopOpacity="1" />
          <stop offset="60%" stopColor="var(--accent)" stopOpacity="0.9" />
          <stop offset="100%" stopColor="var(--accent)" stopOpacity="0" />
        </radialGradient>
      </defs>
      <rect width="600" height="260" fill="url(#ls-sky)" />
      <motion.circle cx="455" cy="96" r="58" fill="url(#ls-sun)" initial={{ cy: 150, opacity: 0 }} animate={{ cy: 96, opacity: 0.85 }} transition={{ duration: 1.6, ease: [0.16, 1, 0.3, 1] }} />
      <motion.circle cx="455" cy="96" r="30" fill="var(--accent)" initial={{ cy: 150 }} animate={{ cy: 96 }} transition={{ duration: 1.6, ease: [0.16, 1, 0.3, 1] }} />
      <g className="cloud opacity-70 dark:opacity-[0.08]" fill="#ffffff">
        <ellipse cx="340" cy="70" rx="34" ry="10" />
        <ellipse cx="362" cy="62" rx="22" ry="12" />
        <ellipse cx="520" cy="44" rx="28" ry="8" />
      </g>
      <motion.path
        d="M0 170 C 90 130, 170 150, 250 140 S 420 110, 600 150 V260 H0Z"
        fill="var(--primary)"
        opacity="0.28"
        initial={{ y: 30, opacity: 0 }}
        animate={{ y: 0, opacity: 0.28 }}
        transition={{ duration: 1.1, delay: 0.1 }}
      />
      <motion.path
        d="M0 195 C 120 160, 260 185, 360 172 S 520 160, 600 180 V260 H0Z"
        fill="var(--primary-2)"
        opacity="0.45"
        initial={{ y: 30, opacity: 0 }}
        animate={{ y: 0, opacity: 0.45 }}
        transition={{ duration: 1.1, delay: 0.2 }}
      />
      <motion.g initial={{ y: 30, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ duration: 1.1, delay: 0.3 }}>
        <path d="M0 215 C 150 195, 330 210, 600 200 V260 H0Z" fill="var(--primary)" opacity="0.85" />
        {/* furrows */}
        {rows.map((i) => (
          <path key={i} d={`M${-40 + i * 80} 260 Q ${60 + i * 60} 228, ${150 + i * 55} 210`} stroke="var(--accent)" strokeOpacity="0.28" strokeWidth="1.5" fill="none" />
        ))}
      </motion.g>
      {/* wheat stalks */}
      {[60, 92, 118, 520, 548, 574].map((x, i) => (
        <motion.g key={x} className="sway" style={{ animationDelay: `${i * 0.4}s` }} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.6 + i * 0.06 }}>
          <path d={`M${x} 260 Q ${x + 2} 225, ${x - 3} 200`} stroke="var(--accent)" strokeWidth="2" fill="none" />
          {[0, 1, 2, 3].map((k) => (
            <ellipse key={k} cx={x - 3 + (k % 2 ? 3 : -3)} cy={200 + k * 6} rx="2.6" ry="5" fill="var(--accent)" transform={`rotate(${k % 2 ? 25 : -25} ${x - 3} ${200 + k * 6})`} />
          ))}
        </motion.g>
      ))}
    </svg>
  );
}
