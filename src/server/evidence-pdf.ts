import "server-only";
import fs from "node:fs/promises";
import path from "node:path";
import { PDFDocument, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import { formatINR } from "@/lib/domain/money";
import { STATUS_LABEL, type ExpectedLine, type Issue, type ReceivedLine, type ReconStatus } from "@/lib/domain/types";

/**
 * Claim evidence pack for one or more partners: a summary table, then per-claim working that a
 * partner's support team can verify line by line (rate-card rule → expected; source file row →
 * received). Plain, printable A4.
 */
export interface EvidenceClaim {
  id: number;
  partner: string;
  order_id: string;
  type: string;
  amount: number;
  status: string;
  risk_since: string | null;
  expected: number | null;
  received: number | null;
  order_date: string | null;
  awb: string | null;
  expected_lines: unknown;
  received_lines: unknown;
  issues: unknown;
}

const A4: [number, number] = [595.28, 841.89];
const M = 42;
const INK = rgb(0.1, 0.1, 0.09), MUTED = rgb(0.43, 0.43, 0.41), LINE = rgb(0.86, 0.86, 0.83), LOSS = rgb(0.71, 0.14, 0.09);

export async function buildEvidencePdf(opts: { claims: EvidenceClaim[]; partnerNames: Record<string, string>; generatedBy: string; generatedAt: string; truncated: boolean }) {
  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);
  const dir = path.join(process.cwd(), "src/assets/fonts");
  const [reg, bold] = await Promise.all([fs.readFile(path.join(dir, "DejaVuSans.ttf")), fs.readFile(path.join(dir, "DejaVuSans-Bold.ttf"))]);
  const f = await doc.embedFont(reg, { subset: true });
  const fb = await doc.embedFont(bold, { subset: true });
  doc.setTitle("Claim evidence");
  doc.setProducer("LeakLens");

  let page: PDFPage = doc.addPage(A4);
  let y = A4[1] - M;
  const newPage = () => {
    page = doc.addPage(A4);
    y = A4[1] - M;
  };
  const ensure = (h: number) => {
    if (y - h < M + 20) newPage();
  };
  const text = (s: string, x: number, size = 9, font: PDFFont = f, color = INK) => page.drawText(s, { x, y, size, font, color });
  const right = (s: string, xRight: number, size = 9, font: PDFFont = f, color = INK) => page.drawText(s, { x: xRight - font.widthOfTextAtSize(s, size), y, size, font, color });
  const clip = (s: string, w: number, size = 9, font: PDFFont = f) => {
    if (font.widthOfTextAtSize(s, size) <= w) return s;
    while (s.length > 1 && font.widthOfTextAtSize(s + "…", size) > w) s = s.slice(0, -1);
    return s + "…";
  };
  const hr = () => page.drawLine({ start: { x: M, y: y + 4 }, end: { x: A4[0] - M, y: y + 4 }, thickness: 0.5, color: LINE });

  const byPartner = new Map<string, EvidenceClaim[]>();
  for (const c of opts.claims) (byPartner.get(c.partner) ?? byPartner.set(c.partner, []).get(c.partner)!).push(c);

  let first = true;
  for (const [partner, claims] of byPartner) {
    if (!first) newPage();
    first = false;
    const total = claims.reduce((a, c) => a + c.amount, 0);
    text("Company A — D2C home textiles · Finance", M, 8.5, f, MUTED);
    y -= 22;
    text(`Claim evidence: ${opts.partnerNames[partner] ?? partner}`, M, 17, fb);
    y -= 18;
    text(`${claims.length} claims · ${formatINR(total, { exact: true })} · generated ${opts.generatedAt} by ${opts.generatedBy}`, M, 9, f, MUTED);
    y -= 14;
    text("Expected amounts are computed from the agreed rate card; received amounts are taken from the partner's own reports.", M, 8.5, f, MUTED);
    y -= 11;
    text("TCS and TDS withheld are counted as received (tax credits) and are not part of any claim.", M, 8.5, f, MUTED);
    if (opts.truncated) {
      y -= 11;
      text("Note: export limited to the first 400 claims — filter by partner or type for the rest.", M, 8.5, f, LOSS);
    }
    y -= 24;

    // Summary table
    const cols = [M, M + 30, M + 140, M + 245, M + 330];
    const head = () => {
      text("#", cols[0], 8, fb, MUTED);
      text("Order", cols[1], 8, fb, MUTED);
      text("Issue", cols[2], 8, fb, MUTED);
      text("Since", cols[3], 8, fb, MUTED);
      right("Expected", A4[0] - M - 150, 8, fb, MUTED);
      right("Received", A4[0] - M - 75, 8, fb, MUTED);
      right("Claim", A4[0] - M, 8, fb, MUTED);
      y -= 6;
      hr();
      y -= 10;
    };
    head();
    for (const c of claims) {
      if (y < M + 30) {
        newPage();
        head();
      }
      text(String(c.id), cols[0], 8.5);
      text(clip(c.order_id, 105, 8.5), cols[1], 8.5);
      text(clip(STATUS_LABEL[c.type as ReconStatus] ?? c.type, 100, 8.5), cols[2], 8.5);
      text(c.risk_since ?? "—", cols[3], 8.5, f, MUTED);
      right(c.expected === null ? "—" : formatINR(c.expected, { exact: true }), A4[0] - M - 150, 8.5);
      right(c.received === null ? "—" : formatINR(c.received, { exact: true }), A4[0] - M - 75, 8.5);
      right(formatINR(c.amount, { exact: true }), A4[0] - M, 8.5, fb, LOSS);
      y -= 13;
    }
    y -= 4;
    hr();
    y -= 10;
    right(`Total claimed ${formatINR(total, { exact: true })}`, A4[0] - M, 9.5, fb);
    y -= 28;

    // Per-claim working
    ensure(40);
    text("Working per claim", M, 12, fb);
    y -= 18;
    for (const c of claims) {
      const ex = (c.expected_lines ?? []) as ExpectedLine[];
      const rc = (c.received_lines ?? []) as ReceivedLine[];
      const issue = ((c.issues ?? []) as Issue[]).find((i) => i.type === c.type);
      ensure(40 + 12 * Math.max(ex.length, rc.length));
      text(`#${c.id} · ${c.order_id}${c.awb ? ` · AWB ${c.awb}` : ""}${c.order_date ? ` · ordered ${c.order_date}` : ""}`, M, 9.5, fb);
      right(formatINR(c.amount, { exact: true }), A4[0] - M, 9.5, fb, LOSS);
      y -= 12;
      if (issue) {
        text(clip(issue.message, A4[0] - 2 * M, 8.5), M, 8.5, f, MUTED);
        y -= 12;
      }
      const half = (A4[0] - 2 * M) / 2 - 10;
      const startY = y;
      text("Expected (rate card)", M, 8, fb, MUTED);
      y -= 11;
      for (const l of ex) {
        text(clip(`${l.label} — ${l.rule}`, half - 70, 8), M, 8);
        right(formatINR(l.amount, { exact: true }), M + half, 8);
        y -= 11;
      }
      const leftEnd = y;
      y = startY;
      const rx = M + half + 20;
      text("Received / billed (partner files)", rx, 8, fb, MUTED);
      y -= 11;
      if (!rc.length) {
        text("Nothing received", rx, 8, f, MUTED);
        y -= 11;
      }
      for (const l of rc) {
        text(clip(`${l.label}${l.ref ? ` · ${l.ref}` : ""}${l.date ? ` · ${l.date}` : ""}`, half - 70, 8), rx, 8);
        right(formatINR(l.amount, { exact: true }), A4[0] - M, 8);
        y -= 11;
      }
      y = Math.min(y, leftEnd) - 6;
      hr();
      y -= 10;
    }
  }

  const pages = doc.getPages();
  pages.forEach((p, i) => p.drawText(`Page ${i + 1} of ${pages.length} · LeakLens claim evidence`, { x: M, y: 22, size: 7.5, font: f, color: MUTED }));
  return doc.save();
}
