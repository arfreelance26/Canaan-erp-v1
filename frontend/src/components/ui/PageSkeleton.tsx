type PageSkeletonProps = {
  /** Show a placeholder action button in the header (e.g. "Add X"). */
  hasButton?: boolean;
  /** Show a placeholder search input in the header. */
  hasSearch?: boolean;
  /** Number of stat/summary cards to render above the table. 0 = none. */
  statCards?: number;
  /** Number of skeleton rows in the table body. */
  rows?: number;
  /** Number of skeleton columns in the table. */
  columns?: number;
  /** Render a card-grid skeleton instead of a table (for pages using a card layout). */
  cards?: boolean;
  /** Number of skeleton cards to render when `cards` is true. */
  cardCount?: number;
};

export function PageSkeleton({
  hasButton = true,
  hasSearch = false,
  statCards = 0,
  rows = 6,
  columns = 5,
  cards = false,
  cardCount = 8,
}: PageSkeletonProps) {
  return (
    <div className="flex flex-col gap-6 animate-pulse">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-2">
          <div className="h-7 w-52 rounded-lg bg-slate-200" />
          <div className="h-4 w-72 rounded bg-slate-100" />
        </div>
        <div className="flex items-center gap-3">
          {hasSearch && <div className="h-9 w-full rounded-lg bg-slate-200 sm:w-64" />}
          {hasButton && <div className="h-10 w-36 rounded-lg bg-slate-200" />}
        </div>
      </div>

      {statCards > 0 && (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
          {Array.from({ length: statCards }).map((_, i) => (
            <div key={i} className="rounded-xl border border-gray-200 bg-white p-4">
              <div className="h-3 w-20 rounded bg-slate-200" />
              <div className="mt-3 h-7 w-14 rounded bg-slate-200" />
            </div>
          ))}
        </div>
      )}

      {cards ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {Array.from({ length: cardCount }).map((_, i) => (
            <div key={i} className="flex flex-col gap-4 rounded-2xl border border-gray-200 bg-white p-4">
              <div className="flex items-center gap-3">
                <div className="h-11 w-11 shrink-0 rounded-xl bg-slate-200" />
                <div className="min-w-0 flex-1 space-y-2">
                  <div className="h-3.5 w-20 rounded bg-slate-200" />
                  <div className="h-3 w-28 rounded bg-slate-100" />
                </div>
              </div>
              <div className="h-3 w-3/4 rounded bg-slate-100" />
              <div className="grid grid-cols-2 gap-3 border-t border-gray-100 pt-3">
                <div className="space-y-1.5"><div className="h-2.5 w-16 rounded bg-slate-100" /><div className="h-3 w-20 rounded bg-slate-200" /></div>
                <div className="space-y-1.5"><div className="h-2.5 w-14 rounded bg-slate-100" /><div className="h-3 w-16 rounded bg-slate-200" /></div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="h-10 rounded-lg bg-slate-100" />
                <div className="h-10 rounded-lg bg-slate-100" />
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
          <div className="flex gap-4 border-b border-gray-100 bg-gray-50 px-4 py-3">
            {Array.from({ length: columns }).map((_, i) => (
              <div key={i} className="h-3 flex-1 rounded bg-slate-200" />
            ))}
          </div>
          {Array.from({ length: rows }).map((_, r) => (
            <div key={r} className="flex gap-4 border-b border-gray-50 px-4 py-3.5">
              {Array.from({ length: columns }).map((_, c) => (
                <div
                  key={c}
                  className="h-4 flex-1 rounded bg-slate-100"
                  style={{ opacity: 1 - c * 0.08 }}
                />
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
