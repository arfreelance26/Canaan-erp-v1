"use client";

import { useEffect, useLayoutEffect, useRef, useState, type ComponentPropsWithoutRef, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { TablePagination } from "./TablePagination";

/** Rows per page for every paged table in the app. */
export const TABLE_PAGE_SIZE = 10;

type PagedTbodyProps<T> = Omit<ComponentPropsWithoutRef<"tbody">, "children"> & {
  /** Every row's data; only the current page is rendered. */
  items: readonly T[];
  /** Draws one row (or a fragment of rows). `index` is the item's position in
   *  the full list, so serial numbers stay right on later pages. */
  children: (item: T, index: number) => ReactNode;
  /** Rows before / after the paged rows, e.g. an empty-state row or a total. */
  head?: ReactNode;
  tail?: ReactNode;
  pageSize?: number;
  /** "trips", "records"… in the footer's "Showing 1–10 of 84 …". */
  itemLabel?: string;
};

/**
 * A `<tbody>` that pages its rows: drop-in for `<tbody>{items.map(…)}</tbody>`.
 *
 *   <PagedTbody items={filtered} className="divide-y …">
 *     {(trip, i) => <tr key={trip.id}>…</tr>}
 *   </PagedTbody>
 *
 * Only the current page's rows are built, so long lists stay quick to render
 * and scroll. The page footer goes right after the table (after its
 * horizontal-scroll wrapper, so it never scrolls sideways with wide tables)
 * and hides itself when everything fits on one page. Going back to page 1
 * happens when the list's length changes (a search or filter).
 */
export function PagedTbody<T>({
  items,
  children,
  head,
  tail,
  pageSize = TABLE_PAGE_SIZE,
  itemLabel = "rows",
  ...tbodyProps
}: PagedTbodyProps<T>) {
  const tbodyRef = useRef<HTMLTableSectionElement>(null);
  const [footerHost, setFooterHost] = useState<HTMLElement | null>(null);
  const [page, setPage] = useState(1);

  const total = items.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const current = Math.min(page, totalPages);
  const start = (current - 1) * pageSize;

  // A new search or filter starts from the first page.
  const lastTotal = useRef(total);
  useEffect(() => {
    if (lastTotal.current !== total) {
      lastTotal.current = total;
      setPage(1);
    }
  }, [total]);

  // A host for the footer right after the table, or after the wrapper that
  // scrolls it sideways when there is one.
  useLayoutEffect(() => {
    const table = tbodyRef.current?.closest("table");
    if (!table) return;
    const parent = table.parentElement;
    const scrolls = parent && /(auto|scroll|hidden)/.test(getComputedStyle(parent).overflowX) && parent.children.length === 1;
    const anchor = scrolls ? parent : table;
    const host = document.createElement("div");
    host.dataset.tablePagination = "";
    anchor.after(host);
    setFooterHost(host);
    return () => host.remove();
  }, []);

  return (
    <>
      <tbody ref={tbodyRef} {...tbodyProps}>
        {head}
        {items.slice(start, start + pageSize).map((item, i) => children(item, start + i))}
        {tail}
      </tbody>
      {footerHost &&
        createPortal(
          <TablePagination
            bare
            page={current}
            totalPages={totalPages}
            pageSize={pageSize}
            totalItems={total}
            itemLabel={itemLabel}
            onPageChange={(p) => {
              setPage(p);
              // Keep the table's top in view when paging from the bottom.
              tbodyRef.current?.closest("table")?.scrollIntoView({ block: "nearest", behavior: "smooth" });
            }}
          />,
          footerHost,
        )}
    </>
  );
}
