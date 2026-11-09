/**
 * Seeds a realistic demo: users per role, partners, saved column mappings (with version history),
 * rate cards, and ~12,000 generated orders with every partner report — ingested through the same
 * code path as a real upload — then runs reconciliation.
 *
 *   npx tsx scripts/seed.ts            (SEED_ORDERS=12000 by default)
 */
import "dotenv/config";
import postgres, { type Sql } from "postgres";
import bcrypt from "bcryptjs";
import { generate } from "@/lib/data/generate";
import { SOURCE_FORMATS, formatToMapping, sourceKey } from "@/lib/data/formats";
import { headerSignature } from "@/lib/domain/mapping";
import { DEFAULT_RATE_CARDS, PARTNERS } from "@/lib/domain/partners";
import { ingestChunk } from "@/server/ingest";
import { runReconciliation, todayIST } from "@/server/recon";
import { audit } from "@/server/audit";

export const DEMO_USERS = [
  { email: "exec@leaklens.demo", name: "Ananya Rao", role: "finance_exec", password: process.env.SEED_EXEC_PASSWORD || "Exec@Demo2026" },
  { email: "cofounder@leaklens.demo", name: "Vikram Mehta", role: "cofounder", password: process.env.SEED_COFOUNDER_PASSWORD || "Founder@Demo2026" },
] as const;

async function main() {
  const url = process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  const sql = postgres(url, { max: 4, prepare: false, onnotice: () => {} });
  const n = Number(process.env.SEED_ORDERS || 12000);
  const asOf = todayIST();
  const t0 = performance.now();

  await sql`truncate audit_log, claims, match_suggestions, recon_results, recon_runs, return_scans, freight_lines, cod_remittances, settlements, orders, uploads, mapping_versions, rate_cards, sources, partners, login_attempts, users restart identity cascade`;

  const userIds: Record<string, number> = {};
  for (const u of DEMO_USERS) {
    const [row] = await sql`insert into users (email, name, role, password_hash) values (${u.email}, ${u.name}, ${u.role}, ${await bcrypt.hash(u.password, 10)}) returning id`;
    userIds[u.role] = row.id;
  }
  const exec = userIds.finance_exec, founder = userIds.cofounder;

  for (const p of PARTNERS) await sql`insert into partners (code, name, kind) values (${p.code}, ${p.name}, ${p.kind})`;
  for (const [code, card] of Object.entries(DEFAULT_RATE_CARDS)) {
    await sql`insert into rate_cards (partner_code, version, card, note, is_active, created_by, created_at) values (${code}, 1, ${JSON.stringify(card)}::text::jsonb, 'Contract terms FY 2026-27', true, ${founder}, now() - interval '60 days')`;
  }

  const data = generate({ orders: n, asOf, days: 75 });
  const sourceIds: Record<string, number> = {};
  for (const sf of SOURCE_FORMATS) {
    const [s] = await sql`insert into sources (partner_code, kind) values (${sf.partner}, ${sf.kind}) returning id`;
    sourceIds[sourceKey(sf.partner, sf.kind)] = s.id;
    const headers = Object.values(sf.fields);
    if (sf.partner === "MP2" && sf.kind === "settlement") {
      // History: Marketplace 2 renamed a column last month; v1 is kept for rollback.
      const oldHeaders = headers.map((h) => (h === "net_payout" ? "net_amount" : h));
      const oldMap = formatToMapping(sf);
      oldMap.fields.net = "net_amount";
      await sql`insert into mapping_versions (source_id, version, mapping, headers, header_signature, engine, note, is_active, created_by, created_at) values (${s.id}, 1, ${JSON.stringify(oldMap)}::text::jsonb, ${JSON.stringify(oldHeaders)}::text::jsonb, ${headerSignature(oldHeaders)}, 'manual', 'Initial mapping', false, ${exec}, now() - interval '70 days')`;
      await sql`insert into mapping_versions (source_id, version, mapping, headers, header_signature, engine, model, note, is_active, created_by, created_at) values (${s.id}, 2, ${JSON.stringify(formatToMapping(sf))}::text::jsonb, ${JSON.stringify(headers)}::text::jsonb, ${headerSignature(headers)}, 'gemini+heuristic', 'gemini-3.5-flash-lite', 'Partner renamed net_amount → net_payout. AI suggestion, previewed on 20 rows and approved.', true, ${exec}, now() - interval '24 days')`;
    } else {
      await sql`insert into mapping_versions (source_id, version, mapping, headers, header_signature, engine, note, is_active, created_by, created_at) values (${s.id}, 1, ${JSON.stringify(formatToMapping(sf))}::text::jsonb, ${JSON.stringify(headers)}::text::jsonb, ${headerSignature(headers)}, 'manual', 'Initial mapping', true, ${exec}, now() - interval '70 days')`;
    }
  }

  // Ingest every file through the real upload path, orders first.
  const ordered = [...SOURCE_FORMATS].sort((a, b) => (a.kind === "orders" ? -1 : 0) - (b.kind === "orders" ? -1 : 0));
  for (const sf of ordered) {
    const key = sourceKey(sf.partner, sf.kind);
    const rows = data.files[key].rows;
    const [mv] = await sql`select id, mapping from mapping_versions where source_id = ${sourceIds[key]} and is_active`;
    const fileName = `${sf.partner.toLowerCase()}-${sf.kind}-${asOf.slice(0, 7)}.csv`;
    const [up] = await sql`insert into uploads (source_id, mapping_version_id, file_name, row_count, status, uploaded_by, created_at) values (${sourceIds[key]}, ${mv.id}, ${fileName}, ${rows.length}, 'processing', ${exec}, now() - interval '1 day') returning id`;
    let inserted = 0, updated = 0, duplicates = 0, rejected = 0;
    for (let i = 0; i < rows.length; i += 5000) {
      const r = await ingestChunk(sql as Sql, { kind: sf.kind, partner: sf.partner, mapping: mv.mapping, uploadId: up.id, startRow: i + 2, rows: rows.slice(i, i + 5000) });
      inserted += r.inserted; updated += r.updated; duplicates += r.duplicates; rejected += r.rejected.length;
    }
    await sql`update uploads set inserted = ${inserted + updated}, duplicates = ${duplicates}, rejected = ${rejected}, status = 'done', finished_at = now() - interval '1 day' where id = ${up.id}`;
    process.stdout.write(`${key}: ${rows.length} rows (${inserted} new, ${duplicates} dup, ${rejected} rejected)\n`);
  }

  const run = await runReconciliation(sql as Sql, { userId: exec, trigger: "seed", asOf });
  console.log("Reconciliation:", JSON.stringify(run.timings), JSON.stringify(run.stats.byStatus));

  // Some claim history so the claims screen reflects a team mid-way through month-end.
  await sql`update claims set status = 'raised', updated_by = ${exec}, note = 'Raised on partner seller portal', updated_at = now() - interval '6 days' where id in (select id from claims where risk_since < ${asOf}::date - 25 order by id limit (select count(*) / 5 from claims))`;
  await sql`update claims set status = 'recovered', recovered_amount = amount, updated_by = ${exec}, note = 'Credited in next settlement', updated_at = now() - interval '2 days' where id in (select id from claims where status = 'raised' order by id limit (select count(*) / 3 from claims where status = 'raised'))`;
  await sql`update claims set status = 'rejected', updated_by = ${founder}, note = 'Partner rejected: outside dispute window', updated_at = now() - interval '1 day' where id in (select id from claims where status = 'raised' order by id desc limit 3)`;

  await audit(sql as Sql, null, "seed", "database", null, { orders: n, asOf });
  console.log(`Seeded ${n} orders as of ${asOf} in ${((performance.now() - t0) / 1000).toFixed(1)} s`);
  await sql.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
