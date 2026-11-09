import Link from "next/link";

export default function NotFound() {
  return (
    <div className="flex min-h-dvh items-center justify-center p-6">
      <div className="max-w-sm text-center">
        <div className="num text-5xl font-semibold tracking-tight text-faint">404</div>
        <h1 className="mt-3 text-base font-semibold">We couldn’t find that page</h1>
        <p className="mt-1 text-sm text-muted">The order, claim or report may have been removed, or the link is mistyped.</p>
        <Link href="/" className="mt-5 inline-flex h-9 items-center rounded-lg bg-accent px-3.5 text-sm font-medium text-white hover:bg-accent-hover">Back to overview</Link>
      </div>
    </div>
  );
}
