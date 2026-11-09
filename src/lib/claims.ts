import type { Tone } from "@/components/ui";

export const CLAIM_STATUS = {
  open: { label: "Open", tone: "loss" as Tone, hint: "Found by matching, not yet raised with the partner" },
  raised: { label: "Raised", tone: "warn" as Tone, hint: "Raised on the partner's portal / by email" },
  recovered: { label: "Recovered", tone: "ok" as Tone, hint: "Money credited back" },
  rejected: { label: "Rejected", tone: "neutral" as Tone, hint: "Partner refused; closed by co-founder" },
  resolved: { label: "Auto-resolved", tone: "info" as Tone, hint: "A later file showed the money arrived" },
} as const;
export type ClaimStatus = keyof typeof CLAIM_STATUS;

/** Allowed manual transitions. Closing as rejected is a co-founder decision. */
export const CLAIM_TRANSITIONS: Record<ClaimStatus, ClaimStatus[]> = {
  open: ["raised", "recovered"],
  raised: ["recovered", "rejected", "open"],
  recovered: ["raised"],
  rejected: ["open"],
  resolved: ["open"],
};
