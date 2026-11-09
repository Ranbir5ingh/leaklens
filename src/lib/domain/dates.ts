/** Dates are handled as ISO yyyy-mm-dd strings and compared as whole UTC days. */
const DAY = 86_400_000;

export function dayNumber(iso: string): number {
  // Fast path for yyyy-mm-dd (and yyyy-mm-ddThh:mm...)
  const y = +iso.slice(0, 4), m = +iso.slice(5, 7), d = +iso.slice(8, 10);
  return Math.floor(Date.UTC(y, m - 1, d) / DAY);
}

export function fromDayNumber(n: number): string {
  return new Date(n * DAY).toISOString().slice(0, 10);
}

export function addDays(iso: string, days: number): string {
  return fromDayNumber(dayNumber(iso) + days);
}

export function daysBetween(fromIso: string, toIso: string): number {
  return dayNumber(toIso) - dayNumber(fromIso);
}

export function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

const MONTHS: Record<string, number> = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12 };

/**
 * Parse the date formats Indian partner reports actually use:
 * 2026-10-03, 03-10-2026, 03/10/2026, 3-Oct-2026, 03 Oct 2026, 2026/10/03, Excel serials, Date objects.
 * Day-first is assumed for ambiguous dd/mm vs mm/dd (Indian convention) — labelled assumption A9.
 */
export function parseDate(raw: unknown): string | null {
  if (raw === null || raw === undefined || raw === "") return null;
  if (raw instanceof Date) return isNaN(raw.getTime()) ? null : raw.toISOString().slice(0, 10);
  if (typeof raw === "number") {
    if (raw > 20000 && raw < 80000) return fromDayNumber(Math.round(raw) - 25569); // Excel serial
    return null;
  }
  const s = String(raw).trim();
  let m = /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})(?:[T\s].*)?$/.exec(s);
  if (m) return valid(+m[1], +m[2], +m[3]);
  m = /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})(?:\s.*)?$/.exec(s);
  if (m) return valid(year(+m[3]), +m[2], +m[1]);
  m = /^(\d{1,2})[-\s/]([A-Za-z]{3,4})[a-z]*[-\s/,]+(\d{2,4})$/.exec(s);
  if (m && MONTHS[m[2].toLowerCase()]) return valid(year(+m[3]), MONTHS[m[2].toLowerCase()], +m[1]);
  return null;
}

const year = (y: number) => (y < 100 ? 2000 + y : y);

function valid(y: number, mo: number, d: number): string | null {
  if (mo < 1 || mo > 12 || d < 1 || d > 31 || y < 2000 || y > 2100) return null;
  const dt = new Date(Date.UTC(y, mo - 1, d));
  if (dt.getUTCMonth() !== mo - 1) return null;
  return dt.toISOString().slice(0, 10);
}

const MONTH_ABBR = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
/** "2026-09-27" → "27 Sep 2026" — locale-free, so engine messages read the same in the UI, CSV and PDF. */
export function humanDate(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  return y && m && d ? `${d} ${MONTH_ABBR[m - 1]} ${y}` : iso;
}
