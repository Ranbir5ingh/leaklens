import { parseDate } from "./dates";
import { FIELDS, normHeader, parseDeliveryStatus, parsePaymentMode, type Cell, type ColumnMapping, type FieldDef, type RawRow } from "./mapping";
import { parseMoney } from "./money";
import type { FileKind } from "./types";

/**
 * Deterministic column-mapping suggester. It is the fallback when no AI key is configured or the
 * AI call fails, and a second opinion when it succeeds (agreement raises confidence).
 * Score = header similarity to known synonyms (0–1) blended with how well the column's values fit
 * the field's type (dates parse as dates, money as money, statuses as statuses...).
 */
export interface FieldSuggestion {
  field: string;
  header: string | null;
  confidence: number; // 0–1
  reason: string;
  alternatives?: string[];
}

export interface MappingSuggestion {
  engine: "gemini" | "heuristic" | "gemini+heuristic" | "saved";
  model?: string;
  fields: FieldSuggestion[];
  warnings: string[];
}

const tokens = (s: string) => new Set(normHeader(s).split(" ").filter(Boolean));

function nameScore(fd: FieldDef, header: string): number {
  const h = normHeader(header);
  if (!h) return 0;
  const hc = h.replace(/ /g, "");
  let best = 0;
  for (const syn of [fd.label, fd.key.replace(/([A-Z])/g, " $1"), ...fd.synonyms]) {
    const s = normHeader(syn);
    if (s === h || s.replace(/ /g, "") === hc) return 1;
    const ht = tokens(h), st = tokens(s);
    const inter = [...st].filter((t) => ht.has(t)).length;
    const jacc = inter / new Set([...ht, ...st]).size;
    let sc = jacc * 0.8;
    if (inter === st.size && st.size > 0) sc = Math.max(sc, 0.82 - 0.04 * (ht.size - st.size));
    best = Math.max(best, sc);
  }
  return best;
}

function valueFit(fd: FieldDef, values: Cell[]): number {
  const vals = values.filter((v) => v !== null && v !== undefined && String(v).trim() !== "").slice(0, 20);
  if (!vals.length) return 0.3;
  const share = (pred: (v: Cell) => boolean) => vals.filter(pred).length / vals.length;
  switch (fd.type) {
    case "date":
      return share((v) => parseDate(v) !== null);
    case "money":
      return share((v) => parseMoney(v) !== null && parseDate(v) === null);
    case "number":
      return share((v) => Number.isFinite(parseFloat(String(v))) && parseFloat(String(v)) < 100000);
    case "payment":
      return share((v) => parsePaymentMode(v) !== null);
    case "status":
      return share((v) => parseDeliveryStatus(v) !== null);
    case "pii_phone":
      return share((v) => /\d{10}/.test(String(v).replace(/\D/g, "")));
    case "id":
      return share((v) => /[A-Za-z0-9]/.test(String(v)) && String(v).length >= 4 && !/\s{2,}/.test(String(v)));
    default:
      return 0.5;
  }
}

export function suggestMappingHeuristic(kind: FileKind, headers: string[], sample: RawRow[]): MappingSuggestion {
  const fields = FIELDS[kind];
  const col = (h: string) => sample.map((r) => r[h]);
  const scored: { field: string; header: string; score: number; why: string }[] = [];
  for (const fd of fields) {
    for (const h of headers) {
      const n = nameScore(fd, h);
      if (n < 0.25) continue;
      const v = valueFit(fd, col(h));
      const score = n * 0.7 + v * 0.3;
      scored.push({ field: fd.key, header: h, score, why: `name match ${(n * 100).toFixed(0)}%, values fit ${(v * 100).toFixed(0)}%` });
    }
  }
  scored.sort((a, b) => b.score - a.score);
  const usedH = new Set<string>();
  const chosen = new Map<string, (typeof scored)[number]>();
  for (const s of scored) {
    if (chosen.has(s.field) || usedH.has(s.header)) continue;
    chosen.set(s.field, s);
    usedH.add(s.header);
  }
  const out: FieldSuggestion[] = fields.map((fd) => {
    const c = chosen.get(fd.key);
    const alts = scored.filter((s) => s.field === fd.key && s.header !== c?.header).slice(0, 2).map((s) => s.header);
    return c
      ? { field: fd.key, header: c.header, confidence: Math.min(0.97, round2(c.score)), reason: c.why, alternatives: alts }
      : { field: fd.key, header: null, confidence: fd.required ? 0 : 0.5, reason: fd.required ? "No column looks like this field" : "Not found — optional", alternatives: alts };
  });
  return { engine: "heuristic", fields: out, warnings: [] };
}

const round2 = (n: number) => Math.round(n * 100) / 100;

export function suggestionToMapping(s: MappingSuggestion): ColumnMapping {
  return { fields: Object.fromEntries(s.fields.map((x) => [x.field, x.header])) };
}

/** Below this, the UI marks a field "unsure" and asks for a human check before approval. */
export const UNSURE_BELOW = 0.7;
