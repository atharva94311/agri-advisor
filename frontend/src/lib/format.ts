const DAY = 86_400_000;

export const parseDate = (iso: string) => new Date(iso + (iso.length === 10 ? "T00:00:00" : ""));

export const todayISO = () => {
  const d = new Date();
  return new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 10);
};

export const daysBetween = (a: string, b: string) => Math.round((parseDate(b).getTime() - parseDate(a).getTime()) / DAY);

export const addDays = (iso: string, n: number) => {
  const d = parseDate(iso);
  d.setDate(d.getDate() + n);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 10);
};

export const fmtDate = (iso: string, opts: Intl.DateTimeFormatOptions = { day: "numeric", month: "short" }) =>
  parseDate(iso).toLocaleDateString("en-IN", opts);

export const fmtLongDate = (iso: string) =>
  fmtDate(iso, { weekday: "short", day: "numeric", month: "short", year: "numeric" });

export const fmtRange = (a: string, b: string) => `${fmtDate(a)} – ${fmtDate(b)}`;

export const fmtRelativeDays = (days: number) => {
  const d = Math.round(days);
  if (d === 0) return "today";
  if (d === 1) return "tomorrow";
  if (d === -1) return "yesterday";
  return d > 0 ? `in ${d} days` : `${-d} days ago`;
};

export const fmtNumber = (n: number, digits = 0) =>
  n.toLocaleString("en-IN", { maximumFractionDigits: digits, minimumFractionDigits: digits });

export const fmtRupees = (n: number) => `₹${fmtNumber(Math.round(n))}`;

export const pct = (x: number) => Math.round(x * 100);

export const timeAgo = (iso: string) => {
  const s = (Date.now() - new Date(iso).getTime()) / 1000;
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
};

export const greeting = () => {
  const h = new Date().getHours();
  if (h < 5) return "Good night";
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
};

export const slugify = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^\w\s-]/g, "")
    .trim()
    .replace(/[\s_]+/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 40);

export const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(" ");
