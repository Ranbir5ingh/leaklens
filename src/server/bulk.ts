import type { Sql } from "postgres";

/** Multi-row INSERT in chunks that stay under Postgres' 65,535 bind-parameter limit. */
export async function bulkInsert<T extends Record<string, unknown>>(
  sql: Sql,
  table: string,
  rows: T[],
  opts: { onConflict?: string; returningCount?: boolean } = {},
): Promise<number> {
  if (!rows.length) return 0;
  const cols = Object.keys(rows[0]);
  const chunk = Math.max(1, Math.floor(60000 / cols.length));
  let affected = 0;
  for (let i = 0; i < rows.length; i += chunk) {
    const part = rows.slice(i, i + chunk);
    const res = await sql`insert into ${sql(table)} ${sql(part as never, cols)} ${opts.onConflict ? sql.unsafe(opts.onConflict) : sql``}`;
    affected += res.count;
  }
  return affected;
}
