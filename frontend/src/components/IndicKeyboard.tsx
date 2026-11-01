import { motion } from "motion/react";
import { ChevronDown, Delete } from "lucide-react";
import { useMemo, type ReactNode } from "react";
import { cx } from "../lib/format";
import { LANGUAGES } from "../lib/meta";

/* On-screen keyboard for Indian scripts. All Brahmic Unicode blocks share the same layout (they follow ISCII),
   so one set of offsets generates every keyboard; code points a script doesn't have are skipped. */

const SCRIPT_BASE: Record<string, number> = {
  hi: 0x0900, mr: 0x0900, // Devanagari
  bn: 0x0980, pa: 0x0a00, gu: 0x0a80, or: 0x0b00, ta: 0x0b80, te: 0x0c00, kn: 0x0c80, ml: 0x0d00,
};

const range = (a: number, b: number) => Array.from({ length: b - a + 1 }, (_, i) => a + i);
const VOWELS = range(0x05, 0x14).filter((o) => ![0x0c, 0x0d, 0x11].includes(o)); // skip vocalic L + candra vowels
const CONSONANTS = [...range(0x15, 0x39), ...range(0x58, 0x5f), 0x4e, 0x71, ...range(0x7a, 0x7f)]; // + nukta forms, ৎ, ୱ, chillus
const SIGNS = [...range(0x3e, 0x4c).filter((o) => o !== 0x44), 0x01, 0x02, 0x03, 0x3c, 0x4d, 0x70];
const DIGITS = range(0x66, 0x6f);
const DANDA = new Set(["hi", "mr", "bn", "pa", "or"]);

const unassigned = /\p{Cn}/u;
const pick = (base: number, offsets: number[]) =>
  offsets.map((o) => String.fromCodePoint(base + o)).filter((ch) => !unassigned.test(ch) && /[\p{L}\p{M}\p{N}]/u.test(ch));

export const hasKeyboard = (language: string) => language in SCRIPT_BASE;

function Key({ label, onPress, wide, className, title }: { label: ReactNode; onPress: () => void; wide?: boolean; className?: string; title?: string }) {
  return (
    <button
      type="button"
      title={title}
      // keep the caret in the text box: don't let the key take focus
      onMouseDown={(e) => e.preventDefault()}
      onClick={onPress}
      className={cx(
        "grid h-10 place-items-center rounded-xl border border-line bg-surface text-[17px] leading-none shadow-[var(--shadow-soft)] transition active:scale-95 active:bg-primary-soft hover:border-primary-2",
        wide ? "px-4" : "min-w-10 px-1.5",
        className,
      )}
    >
      {label}
    </button>
  );
}

export default function IndicKeyboard({ language, onKey, onBackspace, onHide }: { language: string; onKey: (text: string) => void; onBackspace: () => void; onHide: () => void }) {
  const keys = useMemo(() => {
    const base = SCRIPT_BASE[language];
    return base === undefined
      ? null
      : { vowels: pick(base, VOWELS), signs: pick(base, SIGNS), consonants: pick(base, CONSONANTS), digits: pick(base, DIGITS) };
  }, [language]);
  if (!keys) return null;

  const row = (chars: string[], dotted = false) => (
    <div className="flex flex-wrap gap-1.5">
      {chars.map((ch) => (
        <Key key={ch} label={dotted ? `◌${ch}` : ch} onPress={() => onKey(ch)} />
      ))}
    </div>
  );

  return (
    <motion.div
      initial={{ height: 0, opacity: 0 }}
      animate={{ height: "auto", opacity: 1 }}
      exit={{ height: 0, opacity: 0 }}
      className="overflow-hidden"
    >
      <div className="mx-auto mb-2.5 max-w-3xl rounded-3xl border border-line bg-surface-2/60 p-3">
        <div className="mb-2 flex items-center justify-between px-1">
          <span className="text-xs font-semibold text-muted">{LANGUAGES[language]?.native} keyboard</span>
          <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={onHide} className="flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium text-ink-2 transition hover:bg-surface hover:text-ink">
            <ChevronDown className="size-4" /> Hide keyboard
          </button>
        </div>
        <div className="flex max-h-[min(30vh,240px)] flex-col gap-2.5 overflow-y-auto pr-1">
          {row(keys.vowels)}
          {row(keys.signs, true)}
          {row(keys.consonants)}
          {row(keys.digits)}
          <div className="flex gap-1.5">
            {DANDA.has(language) && <Key label="।" onPress={() => onKey("।")} />}
            {["?", ",", "."].map((p) => (
              <Key key={p} label={p} onPress={() => onKey(p)} />
            ))}
            <Key label="space" title="Space" onPress={() => onKey(" ")} className="flex-1 text-sm text-muted" />
            <Key label={<Delete className="size-5" />} title="Backspace" onPress={onBackspace} wide />
          </div>
        </div>
      </div>
    </motion.div>
  );
}
