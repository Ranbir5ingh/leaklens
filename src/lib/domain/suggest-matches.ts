import { dayNumber } from "./dates";
import type { Orphan } from "./engine";
import type { Paise } from "./money";

/**
 * Suggested matches for partner rows whose order ID is missing or unknown (brief: "suggests
 * matches when an order ID is missing ... Suggested matches go to a review queue and are never
 * closed automatically").
 *
 * A transparent scoring model rather than an LLM: it is explainable line by line, runs in
 * milliseconds on lakhs of rows, and sends no data outside. Signals: ID similarity (typos,
 * dropped prefixes), AWB similarity, amount closeness to the rate-card expectation and timing
 * relative to the due date. Confidence is capped at 0.95 — a suggestion is never certain.
 */
export interface Candidate {
  orderId: string;
  partner: string;
  awb: string | null;
  expected: Paise;
  anchorDate: string | null; // due date (or status date) the payment should land near
}

export interface MatchSuggestion {
  orphan: Orphan;
  orderId: string;
  confidence: number;
  reasons: string[];
}

export function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return prev[b.length];
}

const canon = (s: string) => s.toUpperCase().replace(/O/g, "0").replace(/[^A-Z0-9]/g, "");
const digits = (s: string) => s.replace(/\D/g, "");

export function idSimilarity(hint: string, id: string): number {
  const a = canon(hint), b = canon(id);
  if (!a || !b) return 0;
  if (a === b) return 1;
  const da = digits(a), db = digits(b);
  if (da.length >= 5 && da === db) return 0.92; // same number, different prefix/format
  if (da.length >= 5 && db.endsWith(da)) return 0.85;
  const d = levenshtein(a, b);
  return Math.max(0, 1 - d / Math.max(a.length, b.length)) * (d <= 2 ? 1 : 0.7);
}

function amountScore(amount: Paise | null, expected: Paise): number {
  if (amount === null) return -1;
  const gap = Math.abs(amount - expected);
  if (gap <= 100) return 1;
  if (gap <= 1000) return 0.8;
  if (expected !== 0 && gap / Math.abs(expected) <= 0.05) return 0.4;
  return 0;
}

function dateScore(date: string, anchor: string | null): number {
  if (!anchor) return -1;
  const d = dayNumber(date) - dayNumber(anchor);
  if (d >= -5 && d <= 10) return 1;
  if (d >= -10 && d <= 30) return 0.5;
  return 0;
}

export function suggestMatches(orphans: Orphan[], candidates: Candidate[], opts: { perOrphan?: number; minConfidence?: number } = {}): MatchSuggestion[] {
  const perOrphan = opts.perOrphan ?? 3;
  const minConf = opts.minConfidence ?? 0.45;

  // Indexes so this stays fast at lakh scale: by last 4 digits of the ID, by AWB digits, and by
  // partner sorted on expected amount (binary-searched window).
  const byTail = new Map<string, Candidate[]>();
  const byPartner = new Map<string, Candidate[]>();
  for (const c of candidates) {
    const t = digits(c.orderId).slice(-4);
    if (t) (byTail.get(t) ?? byTail.set(t, []).get(t)!).push(c);
    if (c.awb) {
      const at = "awb:" + digits(c.awb).slice(-4);
      (byTail.get(at) ?? byTail.set(at, []).get(at)!).push(c);
    }
    (byPartner.get(c.partner) ?? byPartner.set(c.partner, []).get(c.partner)!).push(c);
  }
  for (const list of byPartner.values()) list.sort((a, b) => a.expected - b.expected);

  const out: MatchSuggestion[] = [];
  for (const o of orphans) {
    if (o.kind === "returns" && !o.orderIdHint && !o.awb) continue;
    const pool = new Set<Candidate>();
    if (o.orderIdHint) {
      const t = digits(canon(o.orderIdHint)).slice(-4);
      for (const c of byTail.get(t) ?? []) pool.add(c);
    }
    if (o.awb) for (const c of byTail.get("awb:" + digits(o.awb).slice(-4)) ?? []) pool.add(c);
    const plist = o.partner ? byPartner.get(o.partner) : undefined;
    if (plist && o.amount !== null) {
      let lo = 0, hi = plist.length;
      const target = o.amount - 1000;
      while (lo < hi) {
        const mid = (lo + hi) >> 1;
        if (plist[mid].expected < target) lo = mid + 1;
        else hi = mid;
      }
      for (let i = lo; i < plist.length && plist[i].expected <= o.amount + 1000 && i - lo < 400; i++) pool.add(plist[i]);
    }

    const scored: MatchSuggestion[] = [];
    for (const c of pool) {
      if (o.partner && c.partner !== o.partner && o.kind !== "returns") continue;
      const reasons: string[] = [];
      let sum = 0, w = 0;
      if (o.orderIdHint) {
        const s = idSimilarity(o.orderIdHint, c.orderId);
        sum += s * 0.45; w += 0.45;
        if (s >= 0.8) reasons.push(`Order ID "${o.orderIdHint}" ≈ ${c.orderId}`);
      }
      if (o.awb && c.awb) {
        const s = idSimilarity(o.awb, c.awb);
        sum += s * 0.45; w += 0.45;
        if (s >= 0.8) reasons.push(`AWB ${o.awb} ≈ ${c.awb}`);
      }
      const a = amountScore(o.amount, c.expected);
      if (a >= 0) {
        sum += a * 0.35; w += 0.35;
        if (a >= 0.8) reasons.push(`Amount within ₹${a === 1 ? 1 : 10} of expected`);
      }
      const d = dateScore(o.date, c.anchorDate);
      if (d >= 0) {
        sum += d * 0.2; w += 0.2;
        if (d === 1) reasons.push("Paid close to the due date");
      }
      if (!w) continue;
      // With no ID signal at all, amount+date alone can never exceed 0.6.
      const hasIdSignal = !!o.orderIdHint || !!(o.awb && c.awb);
      const conf = Math.min(0.95, sum / w) * (hasIdSignal ? 1 : 0.6);
      if (conf >= minConf) scored.push({ orphan: o, orderId: c.orderId, confidence: Math.round(conf * 100) / 100, reasons });
    }
    scored.sort((x, y) => y.confidence - x.confidence);
    out.push(...scored.slice(0, perOrphan));
  }
  return out;
}
