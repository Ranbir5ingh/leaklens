import { z } from "zod";
import { pctOf, roundToRupee, rupees, type Paise } from "./money";
import type { ExpectedLine } from "./types";

/**
 * Rate cards are the contract terms we hold partners to. They are plain data (stored as
 * versioned JSON in the database) so finance can change a fee without a code release.
 * Values are in rupees in the JSON for readability and converted to paise here.
 */

const band = z.object({ upToRupees: z.number().positive().nullable(), feeRupees: z.number().min(0) });

export const channelCardSchema = z.object({
  kind: z.literal("channel"),
  commissionPct: z.number().min(0).max(60),
  fixedFeeBands: z.array(band).min(1),
  shippingFeeRupees: z.number().min(0),
  returnFeeRupees: z.number().min(0),
  paymentCycleDays: z.number().int().min(0).max(120),
  returnReceiptDays: z.number().int().min(1).max(60),
  roundFeesToRupee: z.boolean(),
});

export const gatewayCardSchema = z.object({
  kind: z.literal("gateway"),
  feePct: z.number().min(0).max(10),
  paymentCycleDays: z.number().int().min(0).max(60),
  roundFeesToRupee: z.boolean(),
});

const zoneSlabs = z.object({
  zone: z.string().min(1).max(3),
  slabs: z.array(z.object({ upToKg: z.number().positive(), rupees: z.number().min(0) })).min(1),
  perExtraKgRupees: z.number().min(0),
});

export const courierCardSchema = z.object({
  kind: z.literal("courier"),
  zones: z.array(zoneSlabs).min(1),
  rtoPctOfForward: z.number().min(0).max(200),
  codFeePct: z.number().min(0).max(10),
  codFeeMinRupees: z.number().min(0),
  remittanceCycleDays: z.number().int().min(0).max(60),
  returnReceiptDays: z.number().int().min(1).max(60),
});

export const rateCardSchema = z.discriminatedUnion("kind", [channelCardSchema, gatewayCardSchema, courierCardSchema]);
export type ChannelCard = z.infer<typeof channelCardSchema>;
export type GatewayCard = z.infer<typeof gatewayCardSchema>;
export type CourierCard = z.infer<typeof courierCardSchema>;
export type RateCard = z.infer<typeof rateCardSchema>;

export type RateCardBook = Record<string, RateCard>;

const maybeRound = (p: Paise, round: boolean) => (round ? roundToRupee(p) : p);

export function fixedFeeFor(card: ChannelCard, value: Paise): Paise {
  const sorted = [...card.fixedFeeBands].sort((a, b) => (a.upToRupees ?? Infinity) - (b.upToRupees ?? Infinity));
  for (const b of sorted) {
    if (b.upToRupees === null || value <= rupees(b.upToRupees)) return rupees(b.feeRupees);
  }
  return rupees(sorted[sorted.length - 1].feeRupees);
}

/** Expected marketplace / quick-commerce payout for a delivered order. */
export function channelDelivered(card: ChannelCard, value: Paise): ExpectedLine[] {
  const commission = maybeRound(pctOf(value, card.commissionPct), card.roundFeesToRupee);
  const lines: ExpectedLine[] = [
    { label: "Order value", amount: value, rule: "Selling price incl. GST" },
    { label: "Commission", amount: -commission, rule: `${card.commissionPct}% of order value` },
    { label: "Fixed / closing fee", amount: -fixedFeeFor(card, value), rule: "Price band fee" },
  ];
  if (card.shippingFeeRupees > 0)
    lines.push({ label: "Shipping fee", amount: -rupees(card.shippingFeeRupees), rule: "Flat per order" });
  return lines;
}

/** A customer return on a marketplace: the sale is reversed; we bear the reverse fee. */
export function channelReturned(card: ChannelCard): ExpectedLine[] {
  return [{ label: "Return / reverse fee", amount: -rupees(card.returnFeeRupees), rule: "Flat per returned order" }];
}

export function gatewayPrepaid(card: GatewayCard, value: Paise): ExpectedLine[] {
  return [
    { label: "Order value", amount: value, rule: "Collected online" },
    { label: "Gateway fee", amount: -maybeRound(pctOf(value, card.feePct), card.roundFeesToRupee), rule: `${card.feePct}% of order value` },
  ];
}

/** Forward freight for a weight and zone: smallest slab that fits, then per extra kg above the top slab. */
export function forwardFreight(card: CourierCard, zone: string, weightKg: number): Paise {
  const z = card.zones.find((x) => x.zone.toUpperCase() === zone.toUpperCase());
  if (!z) throw new RateCardError(`No freight slabs for zone ${zone}`);
  const slabs = [...z.slabs].sort((a, b) => a.upToKg - b.upToKg);
  const w = Math.max(weightKg, 0.001);
  for (const s of slabs) if (w <= s.upToKg + 1e-9) return rupees(s.rupees);
  const top = slabs[slabs.length - 1];
  const extraKg = Math.ceil(w - top.upToKg - 1e-9);
  return rupees(top.rupees + extraKg * z.perExtraKgRupees);
}

/** The slab label a weight falls into, e.g. "0.5 kg" — used in evidence text. */
export function slabLabel(card: CourierCard, zone: string, weightKg: number): string {
  const z = card.zones.find((x) => x.zone.toUpperCase() === zone.toUpperCase());
  if (!z) return `${weightKg} kg`;
  const s = [...z.slabs].sort((a, b) => a.upToKg - b.upToKg).find((x) => weightKg <= x.upToKg + 1e-9);
  return s ? `${s.upToKg} kg slab` : `${weightKg} kg (above top slab)`;
}

export function codFee(card: CourierCard, value: Paise): Paise {
  return Math.max(rupees(card.codFeeMinRupees), roundToRupee(pctOf(value, card.codFeePct)));
}

export function rtoFreight(card: CourierCard, forward: Paise): Paise {
  return roundToRupee(pctOf(forward, card.rtoPctOfForward));
}

export class RateCardError extends Error {}
