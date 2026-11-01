import { AnimatePresence, animate, motion, useInView, useMotionValue, useTransform, type HTMLMotionProps } from "motion/react";
import { Loader2, X } from "lucide-react";
import {
  forwardRef,
  useEffect,
  useId,
  useRef,
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
} from "react";
import { cx } from "../lib/format";
import type { Tone } from "../lib/meta";

export const spring = { type: "spring", stiffness: 380, damping: 32 } as const;
export const softSpring = { type: "spring", stiffness: 200, damping: 26 } as const;

export function Card({ className, children, interactive, ...rest }: HTMLMotionProps<"div"> & { interactive?: boolean }) {
  return (
    <motion.div
      {...rest}
      whileHover={interactive ? { y: -3 } : undefined}
      transition={spring}
      className={cx(
        "relative rounded-3xl border border-line bg-surface shadow-[var(--shadow-soft)]",
        interactive && "transition-shadow hover:shadow-[var(--shadow-lift)]",
        className,
      )}
    >
      {children}
    </motion.div>
  );
}

export function CardHeader({ title, subtitle, icon, action }: { title: ReactNode; subtitle?: ReactNode; icon?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3 px-5 pt-5 sm:px-6 sm:pt-6">
      <div className="flex min-w-0 items-center gap-3">
        {icon && <div className="grid size-9 shrink-0 place-items-center rounded-xl bg-surface-2 text-ink-2">{icon}</div>}
        <div className="min-w-0">
          <h3 className="truncate text-[15px] font-semibold tracking-tight">{title}</h3>
          {subtitle && <p className="truncate text-[13px] text-muted">{subtitle}</p>}
        </div>
      </div>
      {action}
    </div>
  );
}

type ButtonVariant = "primary" | "secondary" | "ghost" | "accent" | "danger";
const BTN: Record<ButtonVariant, string> = {
  primary: "bg-primary text-on-primary hover:bg-primary-2 shadow-[0_1px_0_rgb(255_255_255/.15)_inset,0_6px_16px_-8px_var(--primary)]",
  secondary: "bg-surface text-ink border border-line hover:border-line-strong hover:bg-surface-2",
  ghost: "text-ink-2 hover:bg-surface-2 hover:text-ink",
  accent: "bg-accent text-[#1f1705] hover:brightness-105 shadow-[0_6px_16px_-8px_var(--accent)]",
  danger: "bg-danger text-white hover:brightness-110",
};

export const Button = forwardRef<
  HTMLButtonElement,
  ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant; size?: "sm" | "md" | "lg"; loading?: boolean; icon?: ReactNode }
>(function Button({ variant = "primary", size = "md", loading, icon, className, children, disabled, ...rest }, ref) {
  return (
    <button
      ref={ref}
      {...rest}
      disabled={disabled || loading}
      className={cx(
        "inline-flex select-none items-center justify-center gap-2 whitespace-nowrap rounded-full font-medium transition-all duration-200 active:scale-[0.97] disabled:pointer-events-none disabled:opacity-55",
        size === "sm" && "h-8 px-3.5 text-[13px]",
        size === "md" && "h-10 px-4.5 text-sm",
        size === "lg" && "h-12 px-6 text-[15px]",
        BTN[variant],
        className,
      )}
    >
      {loading ? <Loader2 className="size-4 animate-spin" /> : icon}
      {children}
    </button>
  );
});

export function IconButton({ label, className, children, ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { label: string }) {
  return (
    <button
      aria-label={label}
      title={label}
      {...rest}
      className={cx(
        "grid size-10 place-items-center rounded-full text-ink-2 transition-colors hover:bg-surface-2 hover:text-ink active:scale-95",
        className,
      )}
    >
      {children}
    </button>
  );
}

const TONE: Record<Tone, string> = {
  primary: "bg-primary-soft text-primary",
  accent: "bg-accent-soft text-[#8a5a00] dark:text-accent",
  warn: "bg-warn-soft text-warn",
  danger: "bg-danger-soft text-danger",
  sky: "bg-sky-soft text-sky",
  neutral: "bg-surface-2 text-ink-2",
};
const DOT: Record<Tone, string> = {
  primary: "bg-primary",
  accent: "bg-accent",
  warn: "bg-warn",
  danger: "bg-danger",
  sky: "bg-sky",
  neutral: "bg-muted",
};

export function Badge({ tone = "neutral", dot, pulse, className, children }: { tone?: Tone; dot?: boolean; pulse?: boolean; className?: string; children: ReactNode }) {
  return (
    <span className={cx("inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium", TONE[tone], className)}>
      {dot && (
        <span className="relative flex size-1.5">
          {pulse && <span className={cx("absolute inline-flex size-full animate-ping rounded-full opacity-70", DOT[tone])} />}
          <span className={cx("relative inline-flex size-1.5 rounded-full", DOT[tone])} />
        </span>
      )}
      {children}
    </span>
  );
}

export const toneColor = (t: Tone) =>
  ({ primary: "var(--primary-2)", accent: "var(--accent)", warn: "var(--warn)", danger: "var(--danger)", sky: "var(--sky)", neutral: "var(--muted)" })[t];

export function Skeleton({ className }: { className?: string }) {
  return <div className={cx("shimmer rounded-xl", className)} />;
}

export function AnimatedNumber({ value, digits = 0, format }: { value: number; digits?: number; format?: (n: number) => string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true });
  const mv = useMotionValue(0);
  const text = useTransform(mv, (v) => (format ? format(v) : v.toLocaleString("en-IN", { maximumFractionDigits: digits, minimumFractionDigits: digits })));
  useEffect(() => {
    if (!inView) return;
    const c = animate(mv, value, { duration: 1.1, ease: [0.16, 1, 0.3, 1] });
    return () => c.stop();
  }, [inView, value, mv]);
  return <motion.span ref={ref} className="tabular">{text}</motion.span>;
}

export function Ring({
  value,
  size = 64,
  stroke = 6,
  color = "var(--primary-2)",
  track = "var(--surface-2)",
  children,
  delay = 0,
}: {
  value: number; // 0..1
  size?: number;
  stroke?: number;
  color?: string;
  track?: string;
  children?: ReactNode;
  delay?: number;
}) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const v = Math.max(0, Math.min(1, value));
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} stroke={track} strokeWidth={stroke} fill="none" />
        <motion.circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke={color}
          strokeWidth={stroke}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={c}
          initial={{ strokeDashoffset: c }}
          animate={{ strokeDashoffset: c * (1 - v) }}
          transition={{ duration: 1.2, ease: [0.16, 1, 0.3, 1], delay }}
        />
      </svg>
      <div className="absolute inset-0 grid place-items-center">{children}</div>
    </div>
  );
}

export function Bar({ value, color = "var(--primary-2)", className, delay = 0 }: { value: number; color?: string; className?: string; delay?: number }) {
  return (
    <div className={cx("h-2 overflow-hidden rounded-full bg-surface-2", className)}>
      <motion.div
        className="h-full rounded-full"
        style={{ background: color }}
        initial={{ width: 0 }}
        animate={{ width: `${Math.max(0, Math.min(1, value)) * 100}%` }}
        transition={{ duration: 1, ease: [0.16, 1, 0.3, 1], delay }}
      />
    </div>
  );
}

export function EmptyState({ icon, title, body, action }: { icon: ReactNode; title: string; body?: ReactNode; action?: ReactNode }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex flex-col items-center px-6 py-14 text-center"
    >
      <div className="mb-4 grid size-14 place-items-center rounded-2xl bg-surface-2 text-ink-2">{icon}</div>
      <h3 className="font-display text-xl font-medium">{title}</h3>
      {body && <p className="mt-1.5 max-w-sm text-sm text-muted">{body}</p>}
      {action && <div className="mt-5">{action}</div>}
    </motion.div>
  );
}

export function Field({ label, hint, error, children, htmlFor }: { label: string; hint?: ReactNode; error?: string | null; children: ReactNode; htmlFor?: string }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={htmlFor} className="text-[13px] font-medium text-ink-2">
        {label}
      </label>
      {children}
      <AnimatePresence initial={false}>
        {error ? (
          <motion.p key="e" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className="text-xs text-danger">
            {error}
          </motion.p>
        ) : hint ? (
          <p className="text-xs text-muted">{hint}</p>
        ) : null}
      </AnimatePresence>
    </div>
  );
}

const inputCls =
  "h-11 w-full rounded-xl border border-line bg-surface px-3.5 text-[15px] text-ink placeholder:text-muted/70 transition-[border-color,box-shadow] outline-none hover:border-line-strong focus:border-primary-2 focus:shadow-[0_0_0_4px_var(--primary-soft)]";

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(function Input({ className, ...rest }, ref) {
  return <input ref={ref} {...rest} className={cx(inputCls, className)} />;
});

export function Select({ className, children, ...rest }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <div className="relative">
      <select {...rest} className={cx(inputCls, "appearance-none pr-10", className)}>
        {children}
      </select>
      <svg className="pointer-events-none absolute right-3.5 top-1/2 size-4 -translate-y-1/2 text-muted" viewBox="0 0 20 20" fill="currentColor">
        <path d="M5.3 7.3a1 1 0 0 1 1.4 0L10 10.6l3.3-3.3a1 1 0 1 1 1.4 1.4l-4 4a1 1 0 0 1-1.4 0l-4-4a1 1 0 0 1 0-1.4Z" />
      </svg>
    </div>
  );
}

export function Segmented<T extends string>({
  options,
  value,
  onChange,
  className,
}: {
  options: { value: T; label: ReactNode }[];
  value: T;
  onChange: (v: T) => void;
  className?: string;
}) {
  const id = useId();
  return (
    <div className={cx("inline-flex rounded-full border border-line bg-surface-2 p-1", className)} role="tablist">
      {options.map((o) => (
        <button
          key={o.value}
          role="tab"
          aria-selected={value === o.value}
          onClick={() => onChange(o.value)}
          className={cx("relative rounded-full px-3.5 py-1.5 text-[13px] font-medium transition-colors", value === o.value ? "text-ink" : "text-muted hover:text-ink-2")}
        >
          {value === o.value && (
            <motion.span layoutId={`seg-${id}`} transition={spring} className="absolute inset-0 rounded-full bg-surface shadow-[var(--shadow-soft)]" />
          )}
          <span className="relative">{o.label}</span>
        </button>
      ))}
    </div>
  );
}

export function Modal({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: string; children: ReactNode }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);
  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-50 grid place-items-end sm:place-items-center">
          <motion.div
            className="absolute inset-0 bg-[#0b120d]/40 backdrop-blur-sm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
          />
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-label={title}
            initial={{ opacity: 0, y: 40, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 30, scale: 0.98 }}
            transition={softSpring}
            className="relative w-full rounded-t-3xl border border-line bg-surface p-6 shadow-[var(--shadow-lift)] sm:max-w-md sm:rounded-3xl"
          >
            <div className="mb-5 flex items-center justify-between">
              <h2 className="font-display text-2xl font-medium">{title}</h2>
              <IconButton label="Close" onClick={onClose} className="-mr-2">
                <X className="size-5" />
              </IconButton>
            </div>
            {children}
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}

export const stagger = {
  hidden: {},
  show: { transition: { staggerChildren: 0.06, delayChildren: 0.05 } },
};
export const rise = {
  hidden: { opacity: 0, y: 14 },
  show: { opacity: 1, y: 0, transition: { duration: 0.5, ease: [0.16, 1, 0.3, 1] as const } },
};

export function CropGlyph({ emoji, hue, size = 44, className }: { emoji: string; hue: string; size?: number; className?: string }) {
  return (
    <div
      className={cx("grid shrink-0 place-items-center rounded-2xl", className)}
      style={{
        width: size,
        height: size,
        fontSize: size * 0.5,
        background: `color-mix(in oklab, ${hue} 18%, var(--surface))`,
        boxShadow: `inset 0 0 0 1px color-mix(in oklab, ${hue} 28%, transparent)`,
      }}
    >
      <span aria-hidden>{emoji}</span>
    </div>
  );
}
