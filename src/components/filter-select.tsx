"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { cx, inputClass } from "./ui";

export function FilterSelect({ param, label, options, className }: { param: string; label: string; options: { value: string; label: string }[]; className?: string }) {
  const sp = useSearchParams();
  const router = useRouter();
  const path = usePathname();
  return (
    <select
      aria-label={label}
      className={cx(inputClass, "sm:w-56", className)}
      value={sp.get(param) ?? ""}
      onChange={(e) => {
        const n = new URLSearchParams(sp.toString());
        if (e.target.value) n.set(param, e.target.value);
        else n.delete(param);
        n.delete("page");
        router.push(`${path}?${n.toString()}`);
      }}
    >
      {options.map((o) => (
        <option key={o.value} value={o.value}>{o.label}</option>
      ))}
    </select>
  );
}
