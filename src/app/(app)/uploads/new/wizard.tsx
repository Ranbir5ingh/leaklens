"use client";

import Link from "next/link";
import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, CheckCircle2, FileSpreadsheet, Loader2, Sparkles, Upload } from "lucide-react";
import { FIELDS, normalizeRow, type ColumnMapping, type RawRow } from "@/lib/domain/mapping";
import { maskName, maskPhone } from "@/lib/domain/pii";
import { formatINR } from "@/lib/domain/money";
import { STATUS_LABEL, type FileKind, type ReconStatus } from "@/lib/domain/types";
import { UNSURE_BELOW, type FieldSuggestion } from "@/lib/domain/heuristic-mapper";
import { parseFile, type ParsedFile } from "@/lib/client-parse";
import { CHUNK_ROWS } from "@/lib/upload-schemas";
import { Alert, Badge, Button, Card, cx, Field, inputClass } from "@/components/ui";

export interface SourceOption {
  id: number;
  partner: string;
  partnerName: string;
  kind: FileKind;
  kindLabel: string;
  activeVersion: number | null;
}

interface SuggestResponse {
  kind: FileKind;
  active: { version: number; id: number } | null;
  fits: boolean;
  missing: string[];
  suggestion: { engine: string; model?: string; warnings: string[]; fields: FieldSuggestion[]; weightUnit?: "kg" | "g" };
}

type Step = "pick" | "map" | "import" | "done";

const SAMPLES = [
  { file: "mp1-settlement-new-format.csv", source: "MP1:settlement", title: "Marketplace 1 settlement — new format", body: "Every column renamed. Shows AI mapping, the 20-row preview and versioning." },
  { file: "ca1-cod-remittance.csv", source: "CA1:cod", title: "Courier aggregator 1 COD remittance", body: "Same format as before — the saved mapping applies. Has one short and one bad row." },
  { file: "warehouse-return-scans.xlsx", source: "WH:returns", title: "Warehouse return scans (Excel)", body: "Receipt scans for returns now flagged as missing." },
];

export function UploadWizard({ sources }: { sources: SourceOption[] }) {
  const router = useRouter();
  const [step, setStep] = useState<Step>("pick");
  const [sourceId, setSourceId] = useState<number | "">("");
  const [file, setFile] = useState<{ name: string; parsed: ParsedFile } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sugg, setSugg] = useState<SuggestResponse | null>(null);
  const [mapping, setMapping] = useState<Record<string, string | null>>({});
  const [weightUnit, setWeightUnit] = useState<"kg" | "g" | undefined>(undefined);
  const [touched, setTouched] = useState(false);
  const [approved, setApproved] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0, inserted: 0, duplicates: 0, rejected: 0 });
  const [result, setResult] = useState<null | { uploadId: number; mappingVersion: number; previousUpload: unknown; finish: FinishResponse }>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [drag, setDrag] = useState(false);

  const source = sources.find((s) => s.id === sourceId);
  const kind = source?.kind;
  const fields = kind ? FIELDS[kind] : [];
  const colMapping: ColumnMapping = { fields: mapping, ...(weightUnit ? { weightUnit } : {}) };

  const preview = useMemo(() => {
    if (!file || !kind) return [];
    return file.parsed.rows.slice(0, 20).map((r) => normalizeRow(kind, colMapping, r));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [file, kind, mapping, weightUnit]);
  const previewBad = preview.filter((p) => p.errors.length).length;
  const missingRequired = fields.filter((f) => f.required && !mapping[f.key]);
  const usedTwice = Object.values(mapping).filter(Boolean).find((h, i, a) => a.indexOf(h) !== i);
  const unsure = sugg ? sugg.suggestion.fields.filter((f) => f.confidence < UNSURE_BELOW && (f.header || fields.find((x) => x.key === f.field)?.required)) : [];
  const mappingChanged = !sugg?.fits || touched;
  const canImport = !!file && !missingRequired.length && !usedTwice && approved && previewBad < preview.length;

  async function onFile(f: File, srcOverride?: number) {
    setError(null);
    const sid = srcOverride ?? sourceId;
    if (!sid) {
      setError("Choose which partner report this is first.");
      return;
    }
    setBusy("Reading the file in your browser…");
    try {
      const parsed = await parseFile(f);
      setFile({ name: f.name, parsed });
      setBusy(sources.find((s) => s.id === sid)?.activeVersion ? "Checking the saved column mapping…" : "Suggesting a column mapping…");
      const res = await fetch("/api/mappings/suggest", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sourceId: sid, headers: parsed.headers, sample: parsed.rows.slice(0, 20).map(stringifyRow) }) });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Could not get a mapping suggestion");
      applySuggestion(json);
      setStep("map");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not read this file");
    } finally {
      setBusy(null);
    }
  }

  function applySuggestion(json: SuggestResponse) {
    setSugg(json);
    setMapping(Object.fromEntries(json.suggestion.fields.map((f) => [f.field, f.header])));
    setWeightUnit(json.suggestion.weightUnit);
    setTouched(false);
    setApproved(false);
  }

  async function askAI() {
    if (!file || !sourceId) return;
    setBusy("Asking AI for a fresh suggestion…");
    setError(null);
    try {
      const res = await fetch("/api/mappings/suggest", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sourceId, headers: file.parsed.headers, sample: file.parsed.rows.slice(0, 20).map(stringifyRow), forceAI: true }) });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Suggestion failed");
      applySuggestion(json);
      setTouched(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Suggestion failed");
    } finally {
      setBusy(null);
    }
  }

  async function loadSample(s: (typeof SAMPLES)[number]) {
    const [p, k] = s.source.split(":");
    const src = sources.find((x) => x.partner === p && x.kind === k);
    if (!src) return;
    setSourceId(src.id);
    setBusy("Downloading sample…");
    setError(null);
    try {
      const res = await fetch(`/api/samples/${s.file}`);
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? "Sample not available");
      const blob = await res.blob();
      await onFile(new File([blob], s.file, { type: blob.type }), src.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Sample not available");
      setBusy(null);
    }
  }

  async function runImport() {
    if (!file || !sourceId || !sugg) return;
    setStep("import");
    setError(null);
    const rows = file.parsed.rows;
    setProgress({ done: 0, total: rows.length, inserted: 0, duplicates: 0, rejected: 0 });
    try {
      const engine = !mappingChanged ? "saved" : touched && sugg.suggestion.engine === "saved" ? "manual" : (sugg.suggestion.engine as "gemini+heuristic" | "heuristic");
      const res = await fetch("/api/uploads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sourceId, fileName: file.name, fileHash: file.parsed.hash, rowCount: rows.length, headers: file.parsed.headers, mapping: colMapping, mappingChanged, approvedPreview: true, engine, model: sugg.suggestion.model }),
      });
      const up = await res.json();
      if (!res.ok) throw new Error(up.issues ? `${up.error}: ${up.issues.join("; ")}` : up.error);

      // Data minimisation: send only mapped columns, with PII masked and addresses dropped.
      const keep = fields.filter((f) => mapping[f.key]).map((f) => ({ f, h: mapping[f.key]! }));
      let acc = { inserted: 0, duplicates: 0, rejected: 0 };
      for (let i = 0; i < rows.length; i += CHUNK_ROWS) {
        const chunk = rows.slice(i, i + CHUNK_ROWS).map((r) => {
          const o: RawRow = {};
          for (const { f, h } of keep) {
            const v = r[h];
            o[h] = f.type === "pii_name" ? maskName(v == null ? null : String(v)) : f.type === "pii_phone" ? maskPhone(v == null ? null : String(v)) : f.type === "pii_address" ? null : (stringifyCell(v) as string | null);
          }
          return o;
        });
        const cr = await fetchRetry(`/api/uploads/${up.uploadId}/chunk`, { startRow: i + 2, rows: chunk });
        acc = { inserted: acc.inserted + cr.inserted + cr.updated, duplicates: acc.duplicates + cr.duplicates, rejected: acc.rejected + cr.rejected };
        setProgress({ done: Math.min(rows.length, i + CHUNK_ROWS), total: rows.length, ...acc });
      }
      setBusy("Re-running matching…");
      const fin = await fetch(`/api/uploads/${up.uploadId}/finish`, { method: "POST" });
      const finJson = await fin.json();
      if (!fin.ok) throw new Error(finJson.error ?? "Import saved, but matching failed. Run matching from the dashboard.");
      setResult({ uploadId: up.uploadId, mappingVersion: up.mappingVersion, previousUpload: up.previousUpload, finish: finJson });
      setStep("done");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Import failed");
    } finally {
      setBusy(null);
    }
  }

  function reset() {
    setStep("pick");
    setFile(null);
    setSugg(null);
    setResult(null);
    setError(null);
    setApproved(false);
    if (inputRef.current) inputRef.current.value = "";
  }

  return (
    <div className="space-y-4">
      <Steps step={step} />
      {error && <Alert tone="loss" title="That didn’t work">{error}</Alert>}

      {step === "pick" && (
        <div className="grid gap-4 lg:grid-cols-[1.3fr_1fr]">
          <Card className="space-y-4 p-5">
            <Field label="1. Which report is this?" hint="Each partner + report type keeps its own saved column mapping.">
              <select className={inputClass} value={sourceId} onChange={(e) => setSourceId(e.target.value ? Number(e.target.value) : "")} aria-label="Partner report">
                <option value="">Choose partner and report…</option>
                {groupBy(sources, (s) => s.partnerName).map(([partner, list]) => (
                  <optgroup key={partner} label={partner}>
                    {list.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.partnerName} — {s.kindLabel} {s.activeVersion ? `(mapping v${s.activeVersion})` : "(no mapping yet)"}
                      </option>
                    ))}
                  </optgroup>
                ))}
              </select>
            </Field>
            <div>
              <span className="mb-1 block text-[13px] font-medium text-ink-2">2. Drop the file</span>
              <label
                onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
                onDragLeave={() => setDrag(false)}
                onDrop={(e) => { e.preventDefault(); setDrag(false); const f = e.dataTransfer.files[0]; if (f) onFile(f); }}
                className={cx("flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed px-6 py-10 text-center transition-colors", drag ? "border-accent bg-accent-soft" : "border-line-strong bg-sunken/40 hover:bg-sunken", !sourceId && "opacity-60")}
              >
                {busy ? <Loader2 className="h-6 w-6 animate-spin text-accent" /> : <Upload className="h-6 w-6 text-muted" />}
                <span className="mt-2 text-sm font-medium">{busy ?? "Choose a CSV or Excel file, or drop it here"}</span>
                <span className="mt-1 text-xs text-muted">Read in your browser. Only mapped columns are uploaded; names and phones are masked first.</span>
                <input ref={inputRef} type="file" accept=".csv,.xlsx,.xls,text/csv" className="sr-only" disabled={!!busy} onChange={(e) => { const f = e.target.files?.[0]; if (f) onFile(f); }} />
              </label>
            </div>
          </Card>
          <Card className="p-5">
            <h2 className="text-sm font-semibold">Or try a sample file</h2>
            <p className="mt-1 text-xs text-muted">Built from the current data, so you can watch statuses change after import.</p>
            <div className="mt-3 space-y-2">
              {SAMPLES.map((s) => (
                <button key={s.file} disabled={!!busy} onClick={() => loadSample(s)} className="flex w-full items-start gap-3 rounded-lg border border-line px-3 py-2.5 text-left hover:border-line-strong hover:bg-sunken disabled:opacity-50">
                  <FileSpreadsheet className="mt-0.5 h-4 w-4 shrink-0 text-muted" />
                  <span>
                    <span className="block text-sm font-medium">{s.title}</span>
                    <span className="block text-xs text-muted">{s.body}</span>
                  </span>
                </button>
              ))}
            </div>
          </Card>
        </div>
      )}

      {step === "map" && sugg && file && source && (
        <>
          <Card className="p-5">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <div className="text-xs text-muted">{source.partnerName} · {source.kindLabel}</div>
                <h2 className="mt-0.5 text-base font-semibold">{file.name}</h2>
                <div className="text-sm text-muted">{file.parsed.rows.length.toLocaleString("en-IN")} rows · {file.parsed.headers.length} columns</div>
              </div>
              <div className="flex gap-2">
                <Button size="sm" variant="ghost" onClick={reset}>Choose another file</Button>
                <Button size="sm" onClick={askAI} disabled={!!busy}><Sparkles className="h-3.5 w-3.5" /> {busy ?? "Ask AI to re-map"}</Button>
              </div>
            </div>
            <div className="mt-4 space-y-2">
              {sugg.fits ? (
                <Alert tone="ok" title={`Saved mapping v${sugg.active?.version} fits this file`}>All mapped columns are present. Check the preview and import.</Alert>
              ) : sugg.active ? (
                <Alert tone="warn" title="This partner changed its format">
                  {sugg.missing.length} mapped column{sugg.missing.length > 1 ? "s are" : " is"} missing ({sugg.missing.slice(0, 4).map((m) => `“${m}”`).join(", ")}{sugg.missing.length > 4 ? "…" : ""}). {engineText(sugg.suggestion)} Nothing is saved until you approve; the old mapping stays as v{sugg.active.version} for rollback.
                </Alert>
              ) : (
                <Alert tone="info" title="First upload for this source">{engineText(sugg.suggestion)}</Alert>
              )}
              {sugg.suggestion.warnings.map((w) => <Alert key={w} tone="warn">{w}</Alert>)}
              {unsure.length > 0 && <Alert tone="warn" title={`${unsure.length} field${unsure.length > 1 ? "s" : ""} need a human check`}>Low confidence on {unsure.map((u) => fields.find((f) => f.key === u.field)?.label).join(", ")}. Confirm or change them below.</Alert>}
            </div>
          </Card>

          <div className="grid gap-4 xl:grid-cols-[minmax(0,420px)_1fr]">
            <Card className="overflow-hidden">
              <h3 className="border-b border-line px-4 py-3 text-sm font-semibold">Column mapping</h3>
              <ul>
                {fields.map((f) => {
                  const s = sugg.suggestion.fields.find((x) => x.field === f.key);
                  const conf = s?.confidence ?? 0;
                  const changed = s && mapping[f.key] !== s.header;
                  return (
                    <li key={f.key} className={cx("border-b border-line px-4 py-2.5 last:border-0", !changed && s && conf < UNSURE_BELOW && (s.header || f.required) && "bg-warn-soft/60")}>
                      <div className="flex items-center justify-between gap-2">
                        <label htmlFor={`map-${f.key}`} className="text-sm font-medium">
                          {f.label} {f.required && <span className="text-loss">*</span>}
                        </label>
                        {changed ? <Badge tone="accent">Changed by you</Badge> : s && sugg.suggestion.engine !== "saved" ? <ConfBadge c={conf} hasHeader={!!s.header} /> : null}
                      </div>
                      <select id={`map-${f.key}`} className={cx(inputClass, "mt-1.5 h-8 text-[13px]")} value={mapping[f.key] ?? ""} onChange={(e) => { setMapping((m) => ({ ...m, [f.key]: e.target.value || null })); setTouched(true); setApproved(false); }}>
                        <option value="">— not in this file —</option>
                        {file.parsed.headers.map((h) => <option key={h} value={h}>{h}</option>)}
                      </select>
                      {s && sugg.suggestion.engine !== "saved" && <p className="mt-1 text-xs text-muted">{s.reason}{s.alternatives?.length ? ` · Other candidates: ${s.alternatives.join(", ")}` : ""}</p>}
                      {f.type.startsWith("pii") && mapping[f.key] && <p className="mt-1 text-xs text-info">{f.type === "pii_address" ? "Dropped before upload — never stored." : "Masked in your browser before upload."}</p>}
                      {f.type === "number" && mapping[f.key] && (
                        <div className="mt-1.5 flex items-center gap-2 text-xs text-muted">
                          Unit:
                          {(["kg", "g"] as const).map((u) => (
                            <button key={u} type="button" onClick={() => { setWeightUnit(u); setTouched(true); setApproved(false); }} className={cx("rounded border px-1.5 py-0.5", (weightUnit ?? (/\bg\b|gram/i.test(mapping[f.key] ?? "") ? "g" : "kg")) === u ? "border-ink bg-ink text-white" : "border-line")}>{u}</button>
                          ))}
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            </Card>

            <Card className="min-w-0 overflow-hidden">
              <div className="flex items-center justify-between border-b border-line px-4 py-3">
                <h3 className="text-sm font-semibold">Preview — first 20 rows as they will be saved</h3>
                <span className={cx("text-xs", previewBad ? "text-loss" : "text-ok")}>{preview.length - previewBad} of {preview.length} rows valid</span>
              </div>
              <div className="max-h-[560px] overflow-auto">
                <table className="w-full border-collapse text-[12.5px]">
                  <thead className="sticky top-0 z-10 bg-surface">
                    <tr>
                      <th className="border-b border-line px-2 py-2 text-left font-medium text-muted">Row</th>
                      {fields.filter((f) => mapping[f.key] && f.type !== "pii_address").map((f) => <th key={f.key} className="border-b border-line px-2 py-2 text-left font-medium whitespace-nowrap text-muted">{f.label}</th>)}
                    </tr>
                  </thead>
                  <tbody>
                    {preview.map((p, i) => (
                      <tr key={i} className={p.errors.length ? "bg-loss-soft/50" : ""}>
                        <td className="num border-b border-line px-2 py-1.5 text-muted">{i + 2}</td>
                        {fields.filter((f) => mapping[f.key] && f.type !== "pii_address").map((f) => {
                          const err = p.errors.find((e) => e.field === f.key);
                          const v = p.value[f.key];
                          return (
                            <td key={f.key} title={err?.message} className={cx("border-b border-line px-2 py-1.5 whitespace-nowrap", err && "font-medium text-loss")}>
                              {err ? `⚠ ${err.message}` : v === null || v === undefined ? <span className="text-faint">—</span> : f.type === "money" ? <span className="num">{formatINR(Number(v), { exact: true })}</span> : String(v)}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          </div>

          <Card className="sticky bottom-3 z-10 flex flex-col gap-3 p-4 shadow-lg sm:flex-row sm:items-center sm:justify-between">
            <label className="flex items-start gap-2.5 text-sm">
              <input type="checkbox" className="mt-0.5 accent-[var(--color-accent)]" checked={approved} onChange={(e) => setApproved(e.target.checked)} disabled={!!missingRequired.length || !!usedTwice} />
              <span>
                I checked these 20 rows and the mapping is right.
                <span className="block text-xs text-muted">
                  {missingRequired.length ? `Map the required fields first: ${missingRequired.map((f) => f.label).join(", ")}.` : usedTwice ? `“${usedTwice}” is mapped to two fields.` : mappingChanged ? `Approving saves this mapping as a new version for ${source.partnerName}.` : "The saved mapping will be reused."}
                </span>
              </span>
            </label>
            <Button variant="primary" disabled={!canImport || !!busy} onClick={runImport}>
              {mappingChanged ? "Approve mapping & import" : "Import"} {file.parsed.rows.length.toLocaleString("en-IN")} rows
            </Button>
          </Card>
        </>
      )}

      {step === "import" && (
        <Card className="p-6">
          <div className="flex items-center gap-3">
            <Loader2 className="h-5 w-5 animate-spin text-accent" />
            <div className="text-sm font-medium">{busy ?? `Importing ${progress.done.toLocaleString("en-IN")} of ${progress.total.toLocaleString("en-IN")} rows…`}</div>
          </div>
          <div className="mt-4 h-2 rounded-full bg-sunken" role="progressbar" aria-valuemin={0} aria-valuemax={progress.total} aria-valuenow={progress.done}>
            <div className="h-2 rounded-full bg-accent transition-all" style={{ width: `${progress.total ? (progress.done / progress.total) * 100 : 0}%` }} />
          </div>
          <div className="num mt-2 text-xs text-muted">{progress.inserted.toLocaleString("en-IN")} saved · {progress.duplicates.toLocaleString("en-IN")} duplicates skipped · {progress.rejected.toLocaleString("en-IN")} rejected</div>
          {error && <Button className="mt-4" onClick={() => setStep("map")}>Back to mapping</Button>}
        </Card>
      )}

      {step === "done" && result && (
        <Card className="p-6">
          <div className="flex items-start gap-3">
            <CheckCircle2 className="h-6 w-6 shrink-0 text-ok" />
            <div className="min-w-0 flex-1">
              <h2 className="text-base font-semibold">Imported and matched</h2>
              <p className="mt-0.5 text-sm text-muted">
                {file?.name} · mapping v{result.mappingVersion} · matching re-ran on {result.finish.run.reconciled.toLocaleString("en-IN")} orders in {(result.finish.run.timings.totalMs / 1000).toFixed(2)} s
              </p>
              {!!result.previousUpload && <Alert tone="info">This exact file was imported before. Duplicate rows were skipped, so no money is counted twice.</Alert>}
              <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
                <Mini label="Rows saved" value={result.finish.upload.inserted} tone="ok" />
                <Mini label="Duplicates skipped" value={result.finish.upload.duplicates} />
                <Mini label="Rejected" value={result.finish.upload.rejected} tone={result.finish.upload.rejected ? "loss" : undefined} />
                <div className="rounded-lg border border-line p-3">
                  <div className="text-xs text-muted">Money at risk</div>
                  <div className="num mt-0.5 text-sm font-semibold">{formatINR(result.finish.atRiskBefore)} → <span className={result.finish.atRiskAfter < result.finish.atRiskBefore ? "text-ok" : "text-loss"}>{formatINR(result.finish.atRiskAfter)}</span></div>
                </div>
              </div>
              {result.finish.upload.rejected > 0 && (
                <Alert tone="warn" title={`${result.finish.upload.rejected} rows were not imported`}>
                  Fix them in the source file and upload again — rows already imported will be skipped. <a className="font-medium underline" href={`/api/uploads/${result.uploadId}/rejected`}>Download the list of problems</a>
                </Alert>
              )}
              <div className="mt-4 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
                {Object.entries(result.finish.run.byStatus).map(([k, v]) => <span key={k}>{STATUS_LABEL[k as ReconStatus]}: <span className="num text-ink">{v.toLocaleString("en-IN")}</span></span>)}
              </div>
              <div className="mt-5 flex flex-wrap gap-2">
                <Link href="/" className="inline-flex h-9 items-center rounded-lg bg-accent px-3.5 text-sm font-medium text-white hover:bg-accent-hover">See money at risk</Link>
                {result.finish.run.suggestions > 0 && <Link href="/review" className="inline-flex h-9 items-center rounded-lg border border-line-strong px-3.5 text-sm font-medium hover:bg-sunken">Review queue</Link>}
                <Button onClick={reset}>Upload another file</Button>
              </div>
            </div>
          </div>
        </Card>
      )}
    </div>
  );
}

interface FinishResponse {
  upload: { row_count: number; inserted: number; duplicates: number; rejected: number };
  run: { id: number; timings: { totalMs: number }; byStatus: Record<string, number>; reconciled: number; suggestions: number };
  atRiskBefore: number;
  atRiskAfter: number;
}

async function fetchRetry(url: string, body: unknown, tries = 3) {
  let last: Error | null = null;
  for (let t = 0; t < tries; t++) {
    try {
      const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const json = await res.json();
      if (res.ok) return json;
      if (res.status < 500) throw Object.assign(new Error(json.error ?? "Upload rejected"), { fatal: true });
      last = new Error(json.error ?? `Server error ${res.status}`);
    } catch (e) {
      if ((e as { fatal?: boolean }).fatal) throw e;
      last = e as Error;
    }
    await new Promise((r) => setTimeout(r, 600 * (t + 1)));
  }
  throw last ?? new Error("Upload failed");
}

function stringifyCell(v: unknown) {
  if (v === null || v === undefined) return null;
  if (typeof v === "number" || typeof v === "boolean") return v;
  return String(v).slice(0, 500);
}
function stringifyRow(r: RawRow) {
  return Object.fromEntries(Object.entries(r).map(([k, v]) => [k, stringifyCell(v)]));
}

function engineText(s: SuggestResponse["suggestion"]) {
  if (s.engine === "gemini+heuristic") return `Suggested by AI (${s.model}) and cross-checked by rules.`;
  if (s.engine === "heuristic") return "Suggested by rules (column names and value shapes).";
  return "";
}

function ConfBadge({ c, hasHeader }: { c: number; hasHeader: boolean }) {
  if (!hasHeader) return <Badge tone="neutral">Not found</Badge>;
  if (c >= 0.85) return <Badge tone="ok">{Math.round(c * 100)}% sure</Badge>;
  if (c >= UNSURE_BELOW) return <Badge tone="info">{Math.round(c * 100)}% · check</Badge>;
  return <Badge tone="warn"><AlertTriangle className="h-3 w-3" /> {Math.round(c * 100)}% · unsure</Badge>;
}

function Mini({ label, value, tone }: { label: string; value: number; tone?: "ok" | "loss" }) {
  return (
    <div className="rounded-lg border border-line p-3">
      <div className="text-xs text-muted">{label}</div>
      <div className={cx("num mt-0.5 text-lg font-semibold", tone === "ok" && "text-ok", tone === "loss" && "text-loss")}>{value.toLocaleString("en-IN")}</div>
    </div>
  );
}

function Steps({ step }: { step: Step }) {
  const all: [Step[], string, string][] = [[["pick"], "Upload", "CSV or Excel"], [["map"], "Map columns", "AI + rules, you approve"], [["import", "done"], "Validate & import", "Row checks, then match"]];
  const idx = all.findIndex(([s]) => s.includes(step));
  const finished = step === "done";
  return (
    <ol className="grid grid-cols-3 overflow-hidden rounded-xl border border-line bg-surface">
      {all.map(([, label, hint], i) => {
        const done = i < idx || finished;
        const on = i === idx && !finished;
        return (
          <li key={label} className={cx("flex items-center gap-2.5 px-3 py-2.5 sm:px-4", i > 0 && "border-l border-line", on && "bg-raised")} aria-current={on ? "step" : undefined}>
            <span className={cx("flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold", done ? "bg-ok text-white" : on ? "bg-ink text-white" : "bg-sunken text-muted")}>{done ? "✓" : i + 1}</span>
            <span className="min-w-0">
              <span className={cx("block truncate text-[13px]", on || done ? "font-medium text-ink" : "text-muted")}>{label}</span>
              <span className="hidden truncate text-[11.5px] text-muted sm:block">{hint}</span>
            </span>
          </li>
        );
      })}
    </ol>
  );
}

function groupBy<T>(xs: T[], key: (x: T) => string): [string, T[]][] {
  const m = new Map<string, T[]>();
  for (const x of xs) (m.get(key(x)) ?? m.set(key(x), []).get(key(x))!).push(x);
  return [...m.entries()];
}
