/**
 * All money is held as integer paise to avoid floating point drift.
 * ₹1 = 100 paise. Display helpers live here so every screen formats alike.
 */
export type Paise = number;

export const rupees = (r: number): Paise => Math.round(r * 100);
export const toRupees = (p: Paise): number => p / 100;

/** Round a paise amount to the nearest whole rupee (half away from zero). */
export const roundToRupee = (p: Paise): Paise => Math.sign(p) * Math.round(Math.abs(p) / 100) * 100;

/** Percentage of an amount, in paise, rounded to the nearest paisa. pct is e.g. 20 for 20%. */
export const pctOf = (p: Paise, pct: number): Paise => Math.round((p * pct) / 100);

const inr0 = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 });
const inr2 = new Intl.NumberFormat("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** ₹1,23,456 (Indian grouping). Shows paise only when they are non-zero or `exact` is set. */
export function formatINR(p: Paise, opts: { exact?: boolean; sign?: boolean } = {}): string {
  const neg = p < 0;
  const abs = Math.abs(p);
  const body = opts.exact || abs % 100 !== 0 ? inr2.format(abs / 100) : inr0.format(abs / 100);
  const sign = neg ? "−" : opts.sign && p > 0 ? "+" : "";
  return `${sign}₹${body}`;
}

/** Compact form for dashboards: ₹4.2 L, ₹1.3 Cr. */
export function formatINRCompact(p: Paise): string {
  const r = Math.abs(p) / 100;
  const sign = p < 0 ? "−" : "";
  if (r >= 1e7) return `${sign}₹${(r / 1e7).toFixed(2)} Cr`;
  if (r >= 1e5) return `${sign}₹${(r / 1e5).toFixed(2)} L`;
  if (r >= 1e3) return `${sign}₹${(r / 1e3).toFixed(1)} K`;
  return `${sign}₹${inr0.format(r)}`;
}

/**
 * Parse a money cell from partner files: "₹1,409.00", "1409", "(37.00)", "-37", "Rs. 862".
 * Returns null when the cell is not a number so the caller can report the row.
 */
export function parseMoney(raw: unknown): Paise | null {
  if (raw === null || raw === undefined) return null;
  if (typeof raw === "number") return Number.isFinite(raw) ? Math.round(raw * 100) : null;
  let s = String(raw).trim();
  if (s === "") return null;
  let neg = false;
  if (/^\(.*\)$/.test(s)) {
    neg = true;
    s = s.slice(1, -1);
  }
  s = s.replace(/^(rs\.?|inr|₹)\s*/i, "").replace(/[,\s₹]/g, "");
  if (s.endsWith("-")) {
    neg = !neg;
    s = s.slice(0, -1);
  }
  if (s.startsWith("−")) s = "-" + s.slice(1);
  if (!/^[-+]?\d+(\.\d+)?$/.test(s)) return null;
  const v = Math.round(parseFloat(s) * 100);
  return neg ? -v : v;
}
