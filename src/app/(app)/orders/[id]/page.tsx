import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { requireUser } from "@/server/auth";
import { partnerNames } from "@/server/queries";
import { loadOrderDetail } from "@/server/order-detail";
import { OrderEvidence, OrderHeading } from "@/components/orders/order-evidence";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  return { title: decodeURIComponent((await params).id) };
}

export default async function OrderPage({ params }: { params: Promise<{ id: string }> }) {
  await requireUser();
  const id = decodeURIComponent((await params).id);
  const [d, names] = await Promise.all([loadOrderDetail(id), partnerNames()]);
  if (!d) notFound();
  return (
    <>
      <Link href="/orders" className="mb-4 inline-flex items-center gap-1 text-sm text-muted hover:text-ink"><ArrowLeft className="h-4 w-4" /> Orders</Link>
      <div className="mb-5"><OrderHeading d={d} names={names} /></div>
      <OrderEvidence d={d} names={names} />
    </>
  );
}
