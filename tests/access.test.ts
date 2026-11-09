import { describe, expect, it } from "vitest";
import { can, PERMISSIONS, type Permission } from "@/lib/permissions";
import { CLAIM_TRANSITIONS } from "@/lib/claims";

describe("role-based access (the table the server enforces)", () => {
  const coFounderOnly: Permission[] = ["mapping.rollback", "claims.close", "ratecard.edit", "audit.view"];

  it("keeps money-policy decisions with the co-founder", () => {
    for (const p of coFounderOnly) {
      expect(can("finance_exec", p), p).toBe(false);
      expect(can("cofounder", p), p).toBe(true);
    }
  });

  it("lets the finance executive do the day-to-day work", () => {
    for (const p of ["upload.create", "mapping.approve", "recon.run", "review.decide", "claims.update", "export"] as Permission[]) expect(can("finance_exec", p), p).toBe(true);
  });

  it("the co-founder can do everything; nobody signed out can do anything", () => {
    for (const p of Object.keys(PERMISSIONS) as Permission[]) {
      expect(can("cofounder", p)).toBe(true);
      expect(can(null, p)).toBe(false);
      expect(can(undefined, p)).toBe(false);
    }
  });
});

describe("claim workflow", () => {
  it("only lets raised claims be rejected, and never jumps straight to resolved by hand", () => {
    expect(CLAIM_TRANSITIONS.open).not.toContain("rejected");
    expect(CLAIM_TRANSITIONS.raised).toContain("rejected");
    for (const to of Object.values(CLAIM_TRANSITIONS)) expect(to).not.toContain("resolved");
  });
});
