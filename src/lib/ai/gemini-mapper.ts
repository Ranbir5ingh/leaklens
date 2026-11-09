import { z } from "zod";
import { FIELDS, type RawRow } from "@/lib/domain/mapping";
import { suggestMappingHeuristic, type FieldSuggestion, type MappingSuggestion } from "@/lib/domain/heuristic-mapper";
import { redactForAI } from "@/lib/domain/pii";
import type { FileKind } from "@/lib/domain/types";

/**
 * AI column-mapping suggestions (Google Gemini). Safety rails:
 * 1. Only headers and 5 redacted sample rows leave our server — no names, phones or addresses.
 * 2. The model must answer in a fixed JSON schema; anything else is discarded.
 * 3. Every suggested header is checked against the real headers (no hallucinated columns),
 *    and a header can feed only one field.
 * 4. The deterministic heuristic runs too. Agreement raises confidence; disagreement lowers it
 *    and offers the alternative, so the reviewer sees where to look.
 * 5. Any failure (no key, timeout, quota, bad JSON) falls back to the heuristic, and says so.
 * Nothing is saved until a person previews 20 rows and approves.
 */

const responseSchema = z.object({
  mappings: z.array(
    z.object({
      field: z.string(),
      header: z.string().nullable(),
      confidence: z.number().min(0).max(1),
      reason: z.string().max(300).optional().default(""),
    }),
  ),
});

export const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-3.5-flash-lite";

export async function suggestMapping(kind: FileKind, headers: string[], sample: RawRow[], opts: { timeoutMs?: number } = {}): Promise<MappingSuggestion> {
  const heuristic = suggestMappingHeuristic(kind, headers, sample);
  const key = process.env.GEMINI_API_KEY;
  if (!key) {
    return { ...heuristic, warnings: ["AI is not configured (GEMINI_API_KEY unset) — showing rule-based suggestions."] };
  }
  try {
    const ai = await callGemini(key, kind, headers, sample, opts.timeoutMs ?? 15000);
    return merge(kind, headers, ai, heuristic);
  } catch (e) {
    const why = e instanceof Error ? e.message : "unknown error";
    return { ...heuristic, warnings: [`AI suggestion failed (${why}) — showing rule-based suggestions instead.`] };
  }
}

export function buildPrompt(kind: FileKind, headers: string[], sample: RawRow[]): string {
  const fields = FIELDS[kind].map((f) => `- ${f.key} (${f.label}${f.required ? ", required" : ""}): ${f.hint || f.type}`).join("\n");
  const rows = sample.slice(0, 5).map((r) => headers.map((h) => `${h}=${redactForAI(h, r[h])}`).join(" | ")).join("\n");
  return [
    "You map columns of an Indian e-commerce partner report onto a fixed set of fields for payment reconciliation.",
    `File type: ${kind}.`,
    "Target fields:",
    fields,
    "Columns in the uploaded file (exact spelling):",
    headers.map((h) => `- ${h}`).join("\n"),
    "Sample rows (personal data redacted):",
    rows,
    "Rules: use only column names from the list above, spelled exactly. Use null when no column fits. Never map one column to two fields.",
    "Give a confidence between 0 and 1 and a short reason. Be honest: use a low confidence when unsure.",
  ].join("\n");
}

async function callGemini(key: string, kind: FileKind, headers: string[], sample: RawRow[], timeoutMs: number) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": key },
      signal: ctrl.signal,
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: buildPrompt(kind, headers, sample) }] }],
        generationConfig: {
          temperature: 0,
          responseMimeType: "application/json",
          responseSchema: {
            type: "OBJECT",
            properties: {
              mappings: {
                type: "ARRAY",
                items: {
                  type: "OBJECT",
                  properties: {
                    field: { type: "STRING" },
                    header: { type: "STRING", nullable: true },
                    confidence: { type: "NUMBER" },
                    reason: { type: "STRING" },
                  },
                  required: ["field", "header", "confidence"],
                },
              },
            },
            required: ["mappings"],
          },
          thinkingConfig: { thinkingLevel: "low" },
        },
      }),
    });
    if (!res.ok) throw new Error(`Gemini HTTP ${res.status}`);
    const json = await res.json();
    const parts: { text?: string; thought?: boolean }[] = json?.candidates?.[0]?.content?.parts ?? [];
    const text: string | undefined = parts.filter((p) => !p.thought && typeof p.text === "string").map((p) => p.text).join("") || undefined;
    if (!text) throw new Error("empty AI response");
    return responseSchema.parse(JSON.parse(text));
  } catch (e) {
    if (e instanceof Error && e.name === "AbortError") throw new Error("AI timed out");
    if (e instanceof z.ZodError || e instanceof SyntaxError) throw new Error("AI answered in an unexpected format");
    throw e;
  } finally {
    clearTimeout(t);
  }
}

/** Reconcile the model's answer with reality and with the heuristic. Exported for tests. */
export function merge(kind: FileKind, headers: string[], ai: z.infer<typeof responseSchema>, heuristic: MappingSuggestion): MappingSuggestion {
  const real = new Map(headers.map((h) => [h.trim().toLowerCase(), h]));
  const warnings: string[] = [];
  const byField = new Map<string, { header: string | null; confidence: number; reason: string }>();
  for (const m of ai.mappings) {
    if (!FIELDS[kind].some((f) => f.key === m.field)) continue; // unknown field — ignore
    let header: string | null = null;
    if (m.header) {
      header = real.get(m.header.trim().toLowerCase()) ?? null;
      if (!header) warnings.push(`AI proposed a column "${m.header}" that is not in the file — ignored.`);
    }
    const prev = byField.get(m.field);
    if (!prev || m.confidence > prev.confidence) byField.set(m.field, { header, confidence: m.confidence, reason: m.reason });
  }
  // One header → one field: keep the more confident claim.
  const owner = new Map<string, string>();
  for (const [field, v] of byField) {
    if (!v.header) continue;
    const other = owner.get(v.header);
    if (other && byField.get(other)!.confidence >= v.confidence) {
      byField.set(field, { ...v, header: null, reason: `AI also chose "${v.header}" for another field` });
    } else {
      if (other) byField.set(other, { ...byField.get(other)!, header: null });
      owner.set(v.header, field);
    }
  }
  const fields: FieldSuggestion[] = FIELDS[kind].map((fd) => {
    const a = byField.get(fd.key);
    const h = heuristic.fields.find((x) => x.field === fd.key)!;
    if (!a) return { ...h, reason: `AI gave no answer; rule-based: ${h.reason}` };
    const agree = (a.header ?? null) === (h.header ?? null);
    const confidence = agree ? Math.min(0.99, Math.max(a.confidence, h.confidence) + 0.05) : Math.min(a.confidence, 0.6);
    const alternatives = !agree && h.header ? [h.header] : h.alternatives;
    return {
      field: fd.key,
      header: a.header,
      confidence: Math.round(confidence * 100) / 100,
      reason: agree ? `AI and rules agree. ${a.reason}`.trim() : `AI: ${a.reason || "no reason"}. Rules suggest ${h.header ? `"${h.header}"` : "no column"} — please check.`,
      alternatives,
    };
  });
  return { engine: "gemini+heuristic", model: GEMINI_MODEL, fields, warnings };
}
