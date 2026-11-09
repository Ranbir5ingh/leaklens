import { Activity, ArrowLeftRight, Banknote, Columns3, FileUp, Gauge, Inbox, PackageX, ReceiptIndianRupee, Scale, type LucideIcon } from "lucide-react";

export type BadgeKey = "review" | "claims";
export interface NavItem { href: string; label: string; short?: string; icon: LucideIcon; badge?: BadgeKey; audit?: boolean; keywords?: string }
export interface NavGroup { label: string; items: NavItem[] }

export const NAV: NavGroup[] = [
  {
    label: "Reconcile",
    items: [
      { href: "/", label: "Overview", icon: Gauge, keywords: "money at risk dashboard" },
      { href: "/orders", label: "Orders", icon: ArrowLeftRight, keywords: "reconciliation ledger matching" },
      { href: "/claims", label: "Claims", icon: Banknote, badge: "claims", keywords: "evidence pdf partner recover" },
      { href: "/review", label: "Review queue", short: "Review", icon: Inbox, badge: "review", keywords: "suggested matches missing order id" },
      { href: "/returns", label: "Returns", icon: PackageX, keywords: "rto warehouse scan" },
    ],
  },
  {
    label: "Data",
    items: [
      { href: "/uploads", label: "Imports", icon: FileUp, keywords: "upload csv excel file" },
      { href: "/mappings", label: "Column mappings", short: "Mappings", icon: Columns3, keywords: "versions rollback" },
      { href: "/rate-cards", label: "Rate cards", icon: Scale, keywords: "commission freight slab contract" },
    ],
  },
  {
    label: "Reports",
    items: [
      { href: "/taxes", label: "TCS & TDS", icon: ReceiptIndianRupee, keywords: "tax gst 194-o" },
      { href: "/activity", label: "Activity log", icon: Activity, audit: true, keywords: "audit who" },
    ],
  },
];

export const ALL_ITEMS = NAV.flatMap((g) => g.items.map((i) => ({ ...i, group: g.label })));

export function activeItem(path: string) {
  return ALL_ITEMS.filter((i) => (i.href === "/" ? path === "/" : path === i.href || path.startsWith(i.href + "/"))).sort((a, b) => b.href.length - a.href.length)[0] ?? null;
}

/** Phone bottom bar: the three task-first destinations, then "More". */
export const BOTTOM = ["/", "/claims", "/review"];
