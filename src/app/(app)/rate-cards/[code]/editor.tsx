"use client";

import { useMemo, useState, useTransition } from "react";
import { Pencil, Plus, Trash2 } from "lucide-react";
import type { ChannelCard, CourierCard, GatewayCard, RateCard } from "@/lib/domain/ratecards";
import { channelDelivered, channelReturned, codFee, forwardFreight, gatewayPrepaid, rtoFreight, slabLabel } from "@/lib/domain/ratecards";
import { formatINR, rupees } from "@/lib/domain/money";
import { Alert, Button, Card, cx, Field, inputClass } from "@/components/ui";
import { saveRateCard } from "../actions";

const num = (v: string) => (v.trim() === "" ? NaN : Number(v));

export function RateCardEditor({ code, card, canEdit }: { code: string; card: RateCard; canEdit: boolean }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<RateCard>(card);
  const [note, setNote] = useState("");
  const [pending, start] = useTransition();
  const [res, setRes] = useState<{ ok: boolean; message: string; fieldErrors?: string[] } | null>(null);
  const shown = editing ? draft : card;
  const set = (patch: Partial<RateCard>) => setDraft((d) => ({ ...d, ...patch }) as RateCard);

  return (
    <div className="grid gap-4 xl:grid-cols-[1fr_380px]">
      <Card className="overflow-hidden">
        <div className="flex items-center justify-between border-b border-line px-4 py-3">
          <h2 className="text-sm font-semibold">{editing ? "Edit terms" : "Current terms"}</h2>
          {canEdit ? (
            !editing && <Button size="sm" onClick={() => { setDraft(card); setEditing(true); setRes(null); }}><Pencil className="h-3.5 w-3.5" /> Edit</Button>
          ) : (
            <span className="text-xs text-muted">Only the finance co-founder can change contract terms</span>
          )}
        </div>
        <div className="p-4">
          {shown.kind === "channel" && <ChannelFields c={shown} editing={editing} set={set} />}
          {shown.kind === "gateway" && <GatewayFields c={shown} editing={editing} set={set} />}
          {shown.kind === "courier" && <CourierFields c={shown} editing={editing} set={set} />}
        </div>
        {editing && (
          <div className="space-y-3 border-t border-line bg-sunken/40 p-4">
            <Field label="Why did the terms change?" hint="Saved with the version and in the activity log.">
              <input className={inputClass} value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. New contract from 1 Nov — commission down to 18%" maxLength={300} />
            </Field>
            {res && !res.ok && <Alert tone="loss" title={res.message}>{res.fieldErrors?.map((f) => <div key={f}>{f}</div>)}</Alert>}
            <div className="flex gap-2">
              <Button variant="primary" disabled={pending || note.trim().length < 3} onClick={() => start(async () => { const r = await saveRateCard({ code, card: draft, note }); setRes(r); if (r.ok) { setEditing(false); setNote(""); } })}>
                {pending ? "Saving and re-matching…" : "Save as new version"}
              </Button>
              <Button variant="ghost" disabled={pending} onClick={() => { setEditing(false); setRes(null); }}>Cancel</Button>
            </div>
          </div>
        )}
        {res?.ok && <div className="border-t border-line px-4 py-2.5 text-sm text-ok" role="status">{res.message}</div>}
      </Card>
      <Calculator card={shown} />
    </div>
  );
}

function NumIn({ label, value, onChange, editing, suffix, prefix, step = "any" }: { label: string; value: number; onChange: (n: number) => void; editing: boolean; suffix?: string; prefix?: string; step?: string }) {
  return (
    <div>
      <div className="text-xs text-muted">{label}</div>
      {editing ? (
        <div className="relative mt-1">
          {prefix && <span className="absolute top-1/2 left-2.5 -translate-y-1/2 text-sm text-muted">{prefix}</span>}
          <input type="number" step={step} min={0} className={cx(inputClass, "num h-8", prefix && "pl-6", suffix && "pr-10")} defaultValue={value} onChange={(e) => onChange(num(e.target.value))} aria-label={label} />
          {suffix && <span className="absolute top-1/2 right-2.5 -translate-y-1/2 text-xs text-muted">{suffix}</span>}
        </div>
      ) : (
        <div className="num mt-0.5 text-sm font-medium">{prefix}{value}{suffix ? ` ${suffix}` : ""}</div>
      )}
    </div>
  );
}

function Toggle({ label, value, onChange, editing }: { label: string; value: boolean; onChange: (b: boolean) => void; editing: boolean }) {
  return (
    <label className="flex items-center gap-2 text-sm">
      <input type="checkbox" checked={value} disabled={!editing} onChange={(e) => onChange(e.target.checked)} /> {label}
    </label>
  );
}

function ChannelFields({ c, editing, set }: { c: ChannelCard; editing: boolean; set: (p: Partial<ChannelCard>) => void }) {
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
        <NumIn label="Commission" suffix="%" value={c.commissionPct} editing={editing} onChange={(n) => set({ commissionPct: n })} />
        <NumIn label="Shipping fee per order" prefix="₹" value={c.shippingFeeRupees} editing={editing} onChange={(n) => set({ shippingFeeRupees: n })} />
        <NumIn label="Return / reverse fee" prefix="₹" value={c.returnFeeRupees} editing={editing} onChange={(n) => set({ returnFeeRupees: n })} />
        <NumIn label="Pays within" suffix="days" step="1" value={c.paymentCycleDays} editing={editing} onChange={(n) => set({ paymentCycleDays: n })} />
        <NumIn label="Return must reach warehouse in" suffix="days" step="1" value={c.returnReceiptDays} editing={editing} onChange={(n) => set({ returnReceiptDays: n })} />
      </div>
      <Toggle label="Round fees to the rupee" value={c.roundFeesToRupee} editing={editing} onChange={(b) => set({ roundFeesToRupee: b })} />
      <div>
        <div className="mb-1.5 text-xs font-medium text-ink-2">Fixed / closing fee by price band</div>
        <table className="w-full max-w-md text-sm">
          <thead><tr className="text-left text-xs text-muted"><th className="py-1 font-medium">Order value up to</th><th className="py-1 font-medium">Fee</th><th /></tr></thead>
          <tbody>
            {c.fixedFeeBands.map((b, i) => (
              <tr key={`${i}-${c.fixedFeeBands.length}`} className="border-t border-line">
                <td className="py-1.5 pr-3">
                  {editing ? <input type="number" min={1} className={cx(inputClass, "num h-8")} placeholder="no upper limit" defaultValue={b.upToRupees ?? ""} aria-label="Band upper limit" onChange={(e) => set({ fixedFeeBands: c.fixedFeeBands.map((x, j) => (j === i ? { ...x, upToRupees: e.target.value === "" ? null : num(e.target.value) } : x)) })} /> : <span className="num">{b.upToRupees === null ? "and above" : `₹${b.upToRupees.toLocaleString("en-IN")}`}</span>}
                </td>
                <td className="py-1.5 pr-3">
                  {editing ? <input type="number" min={0} className={cx(inputClass, "num h-8")} defaultValue={b.feeRupees} aria-label="Band fee" onChange={(e) => set({ fixedFeeBands: c.fixedFeeBands.map((x, j) => (j === i ? { ...x, feeRupees: num(e.target.value) } : x)) })} /> : <span className="num">₹{b.feeRupees}</span>}
                </td>
                <td className="w-8">{editing && c.fixedFeeBands.length > 1 && <button type="button" aria-label="Remove band" className="rounded p-1 text-muted hover:bg-sunken hover:text-loss" onClick={() => set({ fixedFeeBands: c.fixedFeeBands.filter((_, j) => j !== i) })}><Trash2 className="h-3.5 w-3.5" /></button>}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {editing && <Button size="sm" variant="ghost" className="mt-1" onClick={() => set({ fixedFeeBands: [...c.fixedFeeBands, { upToRupees: null, feeRupees: 0 }] })}><Plus className="h-3.5 w-3.5" /> Add band</Button>}
      </div>
    </div>
  );
}

function GatewayFields({ c, editing, set }: { c: GatewayCard; editing: boolean; set: (p: Partial<GatewayCard>) => void }) {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <NumIn label="Gateway fee" suffix="%" value={c.feePct} editing={editing} onChange={(n) => set({ feePct: n })} />
        <NumIn label="Settles within" suffix="days" step="1" value={c.paymentCycleDays} editing={editing} onChange={(n) => set({ paymentCycleDays: n })} />
      </div>
      <Toggle label="Round fees to the rupee" value={c.roundFeesToRupee} editing={editing} onChange={(b) => set({ roundFeesToRupee: b })} />
    </div>
  );
}

function CourierFields({ c, editing, set }: { c: CourierCard; editing: boolean; set: (p: Partial<CourierCard>) => void }) {
  const slabKeys = [...new Set(c.zones.flatMap((z) => z.slabs.map((s) => s.upToKg)))].sort((a, b) => a - b);
  const setSlab = (zi: number, kg: number, rupeesV: number) => set({ zones: c.zones.map((z, i) => (i === zi ? { ...z, slabs: z.slabs.map((s) => (s.upToKg === kg ? { ...s, rupees: rupeesV } : s)) } : z)) });
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
        <NumIn label="COD fee" suffix="%" value={c.codFeePct} editing={editing} onChange={(n) => set({ codFeePct: n })} />
        <NumIn label="COD fee minimum" prefix="₹" value={c.codFeeMinRupees} editing={editing} onChange={(n) => set({ codFeeMinRupees: n })} />
        <NumIn label="RTO charge" suffix="% of fwd" value={c.rtoPctOfForward} editing={editing} onChange={(n) => set({ rtoPctOfForward: n })} />
        <NumIn label="Remits COD within" suffix="days" step="1" value={c.remittanceCycleDays} editing={editing} onChange={(n) => set({ remittanceCycleDays: n })} />
        <NumIn label="RTO must reach warehouse in" suffix="days" step="1" value={c.returnReceiptDays} editing={editing} onChange={(n) => set({ returnReceiptDays: n })} />
      </div>
      <div>
        <div className="mb-1.5 text-xs font-medium text-ink-2">Forward freight (₹) by zone and weight slab</div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[520px] text-sm">
            <thead>
              <tr className="text-left text-xs text-muted">
                <th className="py-1 pr-2 font-medium">Zone</th>
                {slabKeys.map((k) => <th key={k} className="py-1 pr-2 text-right font-medium">≤ {k} kg</th>)}
                <th className="py-1 text-right font-medium">+ per kg above</th>
              </tr>
            </thead>
            <tbody>
              {c.zones.map((z, zi) => (
                <tr key={z.zone} className="border-t border-line">
                  <td className="py-1.5 pr-2 font-medium">{z.zone}</td>
                  {slabKeys.map((k) => {
                    const s = z.slabs.find((x) => x.upToKg === k);
                    return (
                      <td key={k} className="num py-1.5 pr-2 text-right">
                        {!s ? "—" : editing ? <input type="number" min={0} className={cx(inputClass, "num h-8 w-20 text-right")} defaultValue={s.rupees} aria-label={`Zone ${z.zone} up to ${k} kg`} onChange={(e) => setSlab(zi, k, num(e.target.value))} /> : s.rupees}
                      </td>
                    );
                  })}
                  <td className="num py-1.5 text-right">
                    {editing ? <input type="number" min={0} className={cx(inputClass, "num h-8 w-20 text-right")} defaultValue={z.perExtraKgRupees} aria-label={`Zone ${z.zone} per extra kg`} onChange={(e) => set({ zones: c.zones.map((x, i) => (i === zi ? { ...x, perExtraKgRupees: num(e.target.value) } : x)) })} /> : z.perExtraKgRupees}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

/** "What should this order pay?" — the same pure functions the engine uses, run in the browser. */
function Calculator({ card }: { card: RateCard }) {
  const [value, setValue] = useState("1199");
  const [weight, setWeight] = useState("0.5");
  const [zone, setZone] = useState(card.kind === "courier" ? card.zones[0]?.zone ?? "A" : "A");
  const [mode, setMode] = useState<"delivered" | "returned" | "cod" | "rto">(card.kind === "courier" ? "cod" : "delivered");

  const out = useMemo(() => {
    try {
      const v = rupees(Number(value) || 0);
      if (card.kind === "channel") {
        const lines = mode === "returned" ? channelReturned(card) : channelDelivered(card, v);
        return { lines: lines.map((l) => ({ label: l.label, amount: l.amount, rule: l.rule })), totalLabel: "Expected payout" };
      }
      if (card.kind === "gateway") return { lines: gatewayPrepaid(card, v).map((l) => ({ label: l.label, amount: l.amount, rule: l.rule })), totalLabel: "Expected settlement" };
      const w = Number(weight) || 0;
      const fwd = forwardFreight(card, zone, w);
      if (mode === "rto") {
        const rto = rtoFreight(card, fwd);
        return { lines: [{ label: `Forward freight (${slabLabel(card, zone, w)})`, amount: -fwd, rule: `Zone ${zone}` }, { label: "RTO freight", amount: -rto, rule: `${card.rtoPctOfForward}% of forward` }], totalLabel: "Expected charge" };
      }
      const cod = codFee(card, v);
      return { lines: [{ label: "COD collected", amount: v, rule: "Order value" }, { label: `Forward freight (${slabLabel(card, zone, w)})`, amount: -fwd, rule: `Zone ${zone}` }, { label: "COD fee", amount: -cod, rule: `max(${card.codFeePct}%, ₹${card.codFeeMinRupees})` }], totalLabel: "Expected remittance" };
    } catch (e) {
      return { error: e instanceof Error ? e.message : "Cannot calculate" };
    }
  }, [card, value, weight, zone, mode]);

  const modes = card.kind === "channel" ? [["delivered", "Delivered"], ["returned", "Returned"]] : card.kind === "courier" ? [["cod", "COD delivered"], ["rto", "RTO"]] : [];
  return (
    <Card className="h-fit p-4">
      <h2 className="text-sm font-semibold">Expected-amount calculator</h2>
      <p className="mt-0.5 text-xs text-muted">Uses the same rules as matching. Reflects unsaved edits.</p>
      {modes.length > 0 && (
        <div className="mt-3 inline-flex rounded-lg border border-line p-0.5" role="group">
          {modes.map(([k, l]) => <button key={k} type="button" onClick={() => setMode(k as typeof mode)} className={cx("rounded-md px-2.5 py-1 text-xs", mode === k ? "bg-ink text-white" : "text-ink-2")}>{l}</button>)}
        </div>
      )}
      <div className="mt-3 grid grid-cols-2 gap-3">
        {!(card.kind === "channel" && mode === "returned") && !(card.kind === "courier" && mode === "rto") && (
          <Field label="Order value (₹)"><input type="number" min={0} className={cx(inputClass, "num h-8")} value={value} onChange={(e) => setValue(e.target.value)} /></Field>
        )}
        {card.kind === "courier" && (
          <>
            <Field label="Weight (kg)"><input type="number" min={0} step="0.1" className={cx(inputClass, "num h-8")} value={weight} onChange={(e) => setWeight(e.target.value)} /></Field>
            <Field label="Zone"><select className={cx(inputClass, "h-8")} value={zone} onChange={(e) => setZone(e.target.value)}>{card.zones.map((z) => <option key={z.zone}>{z.zone}</option>)}</select></Field>
          </>
        )}
      </div>
      {"error" in out ? (
        <Alert tone="warn">{out.error}</Alert>
      ) : (
        <dl className="mt-4 space-y-1.5 text-sm">
          {out.lines.map((l) => (
            <div key={l.label} className="flex justify-between gap-3"><dt className="text-ink-2">{l.label}<span className="block text-xs text-muted">{l.rule}</span></dt><dd className={cx("num", l.amount < 0 && "text-loss")}>{formatINR(l.amount, { exact: true })}</dd></div>
          ))}
          <div className="flex justify-between border-t border-line pt-2 font-semibold"><dt>{out.totalLabel}</dt><dd className="num">{formatINR(out.lines.reduce((s, l) => s + l.amount, 0), { exact: true })}</dd></div>
        </dl>
      )}
    </Card>
  );
}
