import type { Sql } from "postgres";

/**
 * Set-based bulk INSERT: each chunk is sent as ONE JSON parameter and expanded server-side with
 * json_populate_recordset, so Postgres does the type conversion (dates, ints, jsonb columns) and
 * we avoid the 65,535 bind-parameter limit entirely. ~10k rows per round trip.
 */
export async function bulkInsert<T extends Record<string, unknown>>(
  sql: Sql,
  table: string,
  rows: T[],
  opts: { onConflict?: string; chunkSize?: number } = {},
): Promise<number> {
  if (!rows.length) return 0;
  if (!/^[a-z_]+$/.test(table)) throw new Error("bad table name");
  const cols = Object.keys(rows[0]);
  const colList = cols.map((c) => `"${c.replace(/"/g, "")}"`).join(", ");
  const chunk = opts.chunkSize ?? 10_000;
  let affected = 0;
  for (let i = 0; i < rows.length; i += chunk) {
    const payload = JSON.stringify(rows.slice(i, i + chunk));
    const res = await sql.unsafe(
      `insert into ${table} (${colList}) select ${colList} from json_populate_recordset(null::${table}, $1::text::json) ${opts.onConflict ?? ""}`,
      [payload],
    );
    affected += res.count;
  }
  return affected;
}
