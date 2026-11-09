"use client";

import Papa from "papaparse";
import type { RawRow } from "@/lib/domain/mapping";

export const MAX_ROWS = 200_000;
export const MAX_BYTES = 40 * 1024 * 1024;

export interface ParsedFile {
  headers: string[];
  rows: RawRow[];
  hash: string;
}

/** Parse CSV or Excel entirely in the browser — the raw file never leaves the user's machine. */
export async function parseFile(file: File): Promise<ParsedFile> {
  if (file.size > MAX_BYTES) throw new Error(`File is ${(file.size / 1e6).toFixed(1)} MB — the limit is 40 MB. Split it by month.`);
  const buf = await file.arrayBuffer();
  const digest = await crypto.subtle.digest("SHA-256", buf);
  const hash = [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
  const name = file.name.toLowerCase();
  let headers: string[] = [];
  let rows: RawRow[] = [];
  if (name.endsWith(".xlsx") || name.endsWith(".xls")) {
    const XLSX = await import("xlsx");
    const wb = XLSX.read(buf, { type: "array", cellDates: false });
    const sheet = wb.Sheets[wb.SheetNames[0]];
    if (!sheet) throw new Error("The workbook has no sheets.");
    const aoa = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, raw: false, defval: "", blankrows: false });
    headers = (aoa[0] ?? []).map((h) => String(h).trim());
    rows = aoa.slice(1).map((r) => Object.fromEntries(headers.map((h, i) => [h, (r as unknown[])[i] as string])));
  } else if (name.endsWith(".csv") || name.endsWith(".txt") || file.type === "text/csv") {
    const text = new TextDecoder("utf-8").decode(buf).replace(/^\uFEFF/, "");
    const res = Papa.parse<RawRow>(text, { header: true, skipEmptyLines: "greedy", transformHeader: (h) => h.trim() });
    if (res.errors.length && !res.data.length) throw new Error(`Could not read the CSV: ${res.errors[0].message}`);
    headers = (res.meta.fields ?? []).filter(Boolean);
    rows = res.data;
  } else {
    throw new Error("Upload a .csv or .xlsx file.");
  }
  headers = headers.filter((h) => h !== "");
  if (!headers.length) throw new Error("The first row should be column headers — none were found.");
  const dup = headers.find((h, i) => headers.indexOf(h) !== i);
  if (dup) throw new Error(`Two columns are both called “${dup}”. Rename one and try again.`);
  if (!rows.length) throw new Error("The file has headers but no data rows.");
  if (rows.length > MAX_ROWS) throw new Error(`The file has ${rows.length.toLocaleString("en-IN")} rows — the limit is 2 lakh per upload.`);
  return { headers, rows, hash };
}
