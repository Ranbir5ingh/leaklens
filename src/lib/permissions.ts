/**
 * Role-based access control. Two roles from the brief:
 * - finance_exec: day-to-day reconciliation — uploads, mappings, review queue, claims.
 * - cofounder: everything an executive can do, plus the money-policy decisions: rate-card changes,
 *   mapping rollbacks, rejecting/writing off claims and reading the audit log.
 * The same table drives the UI (hide/disable) and the server (enforce) — the server is the gate.
 */
export type Role = "finance_exec" | "cofounder";

export const PERMISSIONS = {
  "upload.create": ["finance_exec", "cofounder"],
  "mapping.approve": ["finance_exec", "cofounder"],
  "mapping.rollback": ["cofounder"],
  "recon.run": ["finance_exec", "cofounder"],
  "review.decide": ["finance_exec", "cofounder"],
  "claims.update": ["finance_exec", "cofounder"],
  "claims.close": ["cofounder"],
  "ratecard.edit": ["cofounder"],
  "audit.view": ["cofounder"],
  "export": ["finance_exec", "cofounder"],
} as const satisfies Record<string, readonly Role[]>;

export type Permission = keyof typeof PERMISSIONS;

export function can(role: Role | undefined | null, p: Permission): boolean {
  return !!role && (PERMISSIONS[p] as readonly Role[]).includes(role);
}

export const ROLE_LABEL: Record<Role, string> = { finance_exec: "Finance executive", cofounder: "Finance co-founder" };
