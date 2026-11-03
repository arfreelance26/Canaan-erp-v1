"use client";

/**
 * Shared 10-per-page pagination footer, matching the trip
 * reconciliation/verification screens. Renders nothing when there is only a
 * single page. Pure presentational control: the parent owns the page state and
 * slices its own data.
 */

type Props = {
  page: number;            // current page (1-based, already clamped by caller)
  totalPages: number;
  pageSize: number;
  totalItems: number;
  onPageChange: (page: number) => void;
  itemLabel?: string;      // e.g. "customers", "destinations"
  /** No box of its own: a hairline row at the bottom of a table card (PagedTbody). */
  bare?: boolean;
};

export function TablePagination({
  page,
  totalPages,
  pageSize,
  totalItems,
  onPageChange,
  itemLabel = "items",
  bare = false,
}: Props) {
  if (totalPages <= 1) return null;

  return (
    <div
      data-tour="page-pagination"
      className={
        bare
          ? "flex flex-wrap items-center justify-between gap-3 border-t border-separator-border px-4 py-3"
          : "flex flex-wrap items-center justify-between gap-3 rounded-xl border border-separator-border bg-background-primary-default px-4 py-3"
      }
    >
      <p className="text-body-regular tabular-nums text-text-secondary">
        Showing {(page - 1) * pageSize + 1}–{Math.min(page * pageSize, totalItems)} of {totalItems} {itemLabel}
      </p>
      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={() => onPageChange(Math.max(1, page - 1))}
          disabled={page === 1}
          className="rounded-lg border border-separator-border px-3 py-1.5 text-caption-1-medium text-text-secondary hover:bg-fill-2 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          Previous
        </button>
        {Array.from({ length: totalPages }, (_, i) => i + 1)
          .filter((n) => n === 1 || n === totalPages || Math.abs(n - page) <= 1)
          .reduce<(number | "...")[]>((acc, n, i, arr) => {
            if (i > 0 && n - (arr[i - 1] as number) > 1) acc.push("...");
            acc.push(n);
            return acc;
          }, [])
          .map((item, i) =>
            item === "..." ? (
              <span key={`ellipsis-${i}`} className="px-2 text-xs text-text-tertiary">…</span>
            ) : (
              <button
                key={item}
                type="button"
                onClick={() => onPageChange(item as number)}
                className={`rounded-lg px-3 py-1.5 text-caption-1-medium transition-colors ${
                  page === item
                    ? "bg-accent-solid text-on-solid"
                    : "border border-separator-border text-text-secondary hover:bg-fill-2"
                }`}
              >
                {item}
              </button>
            )
          )}
        <button
          type="button"
          onClick={() => onPageChange(Math.min(totalPages, page + 1))}
          disabled={page === totalPages}
          className="rounded-lg border border-separator-border px-3 py-1.5 text-caption-1-medium text-text-secondary hover:bg-fill-2 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          Next
        </button>
      </div>
    </div>
  );
}
