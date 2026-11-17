"use client";

import { Fragment, useMemo } from "react";
import { cx } from "@/utils/cx";

/**
 * A report sheet (rows of cells, as in the Excel file) shown so it never needs
 * a sideways scroll. The sheet is read the way a person reads it:
 *
 *   text    a row with one value — a title, a section band, a note: full width
 *   pairs   label / value rows (the KPI boxes): a wrapping grid
 *   table   a heading row and the rows under it: only the columns it uses,
 *           fitted to the window (text wraps, the font steps down when wide) —
 *           or, past CARD_COLUMNS (or when "cards" is chosen), each row as a
 *           card with every value labelled
 *
 * Its heading row sticks to the top while that table scrolls by.
 * The Excel / PDF downloads are untouched — this is only the preview.
 */

export type SheetView = "auto" | "table" | "cards";
/** Tables wider than this become cards in "auto". */
export const CARD_COLUMNS = 10;

type Cell = string;
type Block =
  | { kind: "gap" }
  | { kind: "text"; text: string; band: boolean }
  | { kind: "pairs"; rows: Cell[][] }
  | { kind: "table"; cols: number[]; header: Cell[]; rows: Cell[][] };

// A value, not a heading: numbers, money, km, %, dates, dashes.
const NUMBERISH = /^(?:[-+]?(?:₹|rs\.?\s*)?[\d,]+(?:\.\d+)?\s*(?:km|kms|l|%|days?|trips?|hrs?|h)?|\d{1,2}[-/.]\d{1,2}[-/.]\d{2,4}|\d{4}-\d{2}-\d{2}.*|[—–-])$/i;
const isNum = (s: string) => NUMBERISH.test(s.trim());
const filled = (row: Cell[]) => row.map((v, i) => ((v ?? "").trim() ? i : -1)).filter((i) => i >= 0);

function isHeading(row: Cell[], next: Cell[] | undefined, first: boolean): boolean {
  const f = filled(row);
  if (f.length < 2 || f.some((i) => isNum(row[i]))) return false;
  if (!next) return false;
  const nf = filled(next);
  if (first) return nf.length >= 2;             // a plain export: its first row is the heading
  return nf.length >= 2 && nf.some((i) => isNum(next[i]));
}

const TOTAL_ROW = /^(total|grand total)\b/i;
const firstValue = (row: Cell[]) => (row.find((v) => (v ?? "").trim()) ?? "").trim();

/** The sheet's rows grouped into text / pairs / tables. */
export function readSheet(rows: Cell[][]): Block[] {
  const blocks: Block[] = [];
  let i = 0;
  while (i < rows.length) {
    const row = rows[i] ?? [];
    const f = filled(row);
    if (f.length === 0) {
      if (blocks.length && blocks[blocks.length - 1].kind !== "gap") blocks.push({ kind: "gap" });
      i++;
      continue;
    }
    // A TOTAL row (the sheets leave a blank line before it) belongs to the table above.
    const prev = blocks[blocks.length - 1]?.kind === "gap" ? blocks[blocks.length - 2] : blocks[blocks.length - 1];
    if (f.length >= 2 && TOTAL_ROW.test(firstValue(row)) && prev?.kind === "table") {
      if (blocks[blocks.length - 1].kind === "gap") blocks.pop();
      filled(row).forEach((c) => { if (!prev.cols.includes(c)) prev.cols.push(c); });
      prev.cols.sort((a, b) => a - b);
      prev.rows.push(row);
      i++;
      continue;
    }
    if (f.length === 1) {
      const text = row[f[0]].trim();
      blocks.push({ kind: "text", text, band: text.length < 80 && text === text.toUpperCase() && /[A-Z]/.test(text) });
      i++;
      continue;
    }
    if (isHeading(row, rows[i + 1], i === 0)) {
      const body: Cell[][] = [];
      let j = i + 1;
      while (j < rows.length) {
        const r = rows[j] ?? [];
        const rf = filled(r);
        if (rf.length < 2 || isHeading(r, rows[j + 1], false)) break;
        body.push(r);
        j++;
      }
      if (body.length === 0) {
        // A heading with nothing under it (a sheet's top line, "TN93C3377 · ← Summary"): just text.
        blocks.push({ kind: "text", text: f.map((c) => row[c].trim()).join(" · "), band: false });
        i++;
        continue;
      }
      const used = new Set<number>(f);
      body.forEach((r) => filled(r).forEach((c) => used.add(c)));
      const cols = [...used].sort((a, b) => a - b);
      blocks.push({ kind: "table", cols, header: row, rows: body });
      i = j;
      continue;
    }
    // Label / value rows until something else starts.
    const pairs: Cell[][] = [];
    let j = i;
    while (j < rows.length) {
      const r = rows[j] ?? [];
      const rf = filled(r);
      if (rf.length < 2 || isHeading(r, rows[j + 1], false)) break;
      pairs.push(r);
      j++;
    }
    blocks.push({ kind: "pairs", rows: pairs });
    i = j;
  }
  return blocks;
}

/** Whether any table in these blocks is too wide for a table ("auto" would show cards). */
export function hasWideTable(blocks: Block[]): boolean {
  return blocks.some((b) => b.kind === "table" && b.cols.length > CARD_COLUMNS);
}

// The font steps down as a table gets wider, so numbers stay on one line.
function tableText(cols: number): string {
  if (cols <= 6) return "text-sm";
  if (cols <= 8) return "text-[13px]";
  if (cols <= 10) return "text-xs";
  return "text-[11px]";
}

const isTotal = (row: Cell[]) => /^(total|grand total)\b/i.test((row.find((v) => (v ?? "").trim()) ?? "").trim());

function TableBlock({ b }: { b: Extract<Block, { kind: "table" }> }) {
  return (
    <table className={cx("w-full table-fixed border-separate border-spacing-0 text-left", tableText(b.cols.length))}>
      <thead className="sticky top-0 z-10">
        <tr>
          {b.cols.map((c) => (
            <th key={c} className="break-words border-b border-separator-border bg-fill-1 px-2.5 py-2 align-bottom text-caption-2-semibold text-text-secondary">
              {b.header[c]}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {b.rows.map((r, ri) => (
          <tr key={ri} className={cx("hover:bg-accent-surface-strong/40", isTotal(r) ? "bg-fill-2 font-semibold" : ri % 2 ? "bg-fill-1" : "")}>
            {b.cols.map((c) => {
              const v = (r[c] ?? "").trim();
              return (
                <td
                  key={c}
                  title={b.header[c] ? `${b.header[c]}: ${v || "—"}` : undefined}
                  className={cx("break-words border-b border-separator-border px-2.5 py-2 align-top", v ? "text-text-primary" : "text-text-tertiary", isNum(v) && "tabular-nums")}
                >
                  {v || "—"}
                </td>
              );
            })}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function CardsBlock({ b }: { b: Extract<Block, { kind: "table" }> }) {
  const [first, ...rest] = b.cols;
  return (
    <div className="flex flex-col gap-2">
      <p className="text-caption-2-semibold text-text-tertiary">
        {b.rows.length} row{b.rows.length === 1 ? "" : "s"} · {b.cols.length} columns, shown as cards
      </p>
      {b.rows.map((r, ri) => (
        <div
          key={ri}
          className={cx("rounded-xl border px-3.5 py-2.5", isTotal(r) ? "border-accent-border bg-accent-surface/50" : "border-separator-border bg-background-primary-default")}
        >
          <p className="mb-1.5 break-words text-body-semibold text-text-primary">
            {b.header[first] && <span className="mr-1.5 text-caption-2-semibold text-text-tertiary">{b.header[first]}</span>}
            {(r[first] ?? "").trim() || "—"}
          </p>
          <dl className="grid grid-cols-[repeat(auto-fill,minmax(170px,1fr))] gap-x-4 gap-y-1">
            {rest.map((c) => {
              const v = (r[c] ?? "").trim();
              if (!v) return null;
              return (
                <div key={c} className="min-w-0">
                  <dt className="truncate text-[10px] font-semibold uppercase tracking-wide text-text-tertiary">{b.header[c] || "—"}</dt>
                  <dd className={cx("break-words text-sm text-text-primary", isNum(v) && "tabular-nums")}>{v}</dd>
                </div>
              );
            })}
          </dl>
        </div>
      ))}
    </div>
  );
}

function PairsBlock({ rows }: { rows: Cell[][] }) {
  return (
    <dl className="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-2">
      {rows.map((r, i) => {
        const f = filled(r);
        const label = r[f[0]].trim();
        const values = f.slice(1).map((c) => r[c].trim());
        return (
          <div key={i} className="min-w-0 rounded-lg border border-separator-border bg-background-primary-default px-3 py-2">
            <dt className="break-words text-xs text-text-secondary">{label}</dt>
            <dd className="break-words text-body-semibold text-text-primary">
              {values.map((v, k) => (
                <Fragment key={k}>
                  {k > 0 && <span className="font-normal text-text-tertiary"> · </span>}
                  <span className={cx(isNum(v) && "tabular-nums")}>{v}</span>
                </Fragment>
              ))}
            </dd>
          </div>
        );
      })}
    </dl>
  );
}

export function SheetPreview({ rows, view }: { rows: Cell[][]; view: SheetView }) {
  const blocks = useMemo(() => readSheet(rows), [rows]);
  return (
    <div className="flex flex-col gap-3">
      {blocks.map((b, i) => {
        if (b.kind === "gap") return <div key={i} className="h-1" />;
        if (b.kind === "text") {
          return b.band ? (
            <p key={i} className="break-words rounded-lg bg-accent-surface px-3 py-1.5 text-caption-1-semibold text-accent-text">{b.text}</p>
          ) : (
            <p key={i} className="break-words text-sm text-text-secondary">{b.text}</p>
          );
        }
        if (b.kind === "pairs") return <PairsBlock key={i} rows={b.rows} />;
        const cards = view === "cards" || (view === "auto" && b.cols.length > CARD_COLUMNS);
        return (
          // overflow-clip (not hidden): rounds the corners without becoming a scroll box, so the heading still sticks.
          <div key={i} className={cx(!cards && "overflow-clip rounded-xl border border-separator-border bg-background-primary-default")}>
            {cards ? <CardsBlock b={b} /> : <TableBlock b={b} />}
          </div>
        );
      })}
    </div>
  );
}
