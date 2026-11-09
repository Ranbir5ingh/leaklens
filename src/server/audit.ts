import type { Sql } from "postgres";

export async function audit(sql: Sql, userId: number | null, action: string, entity: string, entityId: string | number | null, detail?: unknown) {
  await sql`insert into audit_log (user_id, action, entity, entity_id, detail) values (${userId}, ${action}, ${entity}, ${entityId === null ? null : String(entityId)}, ${detail === undefined ? null : JSON.stringify(detail)}::text::jsonb)`;
}
