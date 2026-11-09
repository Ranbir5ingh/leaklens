import Link from "next/link";
import { buttonClass, cx } from "./ui";

export function Pager({ page, pages, basePath, query }: { page: number; pages: number; basePath: string; query: string }) {
  if (pages <= 1) return null;
  const href = (p: number) => `${basePath}?${[query, `page=${p}`].filter(Boolean).join("&")}`;
  return (
    <nav className="mt-4 flex items-center justify-between text-sm" aria-label="Pagination">
      <span className="text-muted">
        Page <span className="num">{page}</span> of <span className="num">{pages.toLocaleString("en-IN")}</span>
      </span>
      <div className="flex gap-2">
        {page > 1 ? (
          <Link className={buttonClass("secondary", "sm")} href={href(page - 1)}>Previous</Link>
        ) : (
          <span className={cx(buttonClass("secondary", "sm"), "pointer-events-none opacity-40")} aria-disabled>Previous</span>
        )}
        {page < pages ? (
          <Link className={buttonClass("secondary", "sm")} href={href(page + 1)}>Next</Link>
        ) : (
          <span className={cx(buttonClass("secondary", "sm"), "pointer-events-none opacity-40")} aria-disabled>Next</span>
        )}
      </div>
    </nav>
  );
}
