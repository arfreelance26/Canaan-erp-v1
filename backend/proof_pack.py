"""Proof Pack — Proof and Documents as one PDF (Reports Center).

A cover (filters, who/when, count and amount per type), an index (one line
per document with the page it starts on), then every document: a header
strip naming it, and the file itself — a photo/scan scaled onto the page, a
PDF bill's pages each scaled onto a page (kept as vectors, not pictures).
A file that can't be read gets a page saying so, so one bad upload never
spoils the pack. Optionally, the costs that still have no proof, as a list.

Built with PyMuPDF. Pages are A4 portrait; text is HTML (insert_htmlbox), so
₹ and long names render properly.
"""
from __future__ import annotations

import html
from datetime import datetime
from typing import Callable, Iterable, Optional

import pymupdf

A4 = pymupdf.paper_rect("a4")          # 595 × 842 pt
M = 36                                  # page margin
CONTENT_TOP = 92                        # below a document page's header strip
INDEX_ROWS = 32                         # index / missing-list rows per page
MAX_PDF_PAGES = 60                      # per document; the rest are named, not drawn

CSS = """
* { font-family: sans-serif; }
body { font-size: 9px; color: #1f2937; }
h1 { font-size: 22px; margin: 0 0 4px 0; color: #0f172a; }
h2 { font-size: 13px; margin: 0 0 6px 0; color: #0f172a; }
.sub { color: #6b7280; font-size: 10px; margin: 0 0 2px 0; }
table { border-collapse: collapse; width: 100%; }
th { text-align: left; font-size: 8px; color: #6b7280; border-bottom: 1px solid #d1d5db; padding: 3px 4px; }
td { font-size: 8px; padding: 3px 4px; border-bottom: 1px solid #eef0f3; white-space: nowrap; }
.foot { font-size: 7px; color: #8c9199; }
.r { text-align: right; }
.tot td { font-weight: bold; border-top: 1px solid #9ca3af; border-bottom: none; }
.strip { font-size: 9px; }
.strip b { color: #0f172a; }
.muted { color: #6b7280; }
"""


def inr(v: Optional[float]) -> str:
    """₹1,23,456.00 — Indian grouping."""
    if v is None:
        return "—"
    neg, v = v < 0, abs(float(v))
    whole, frac = f"{v:.2f}".split(".")
    if len(whole) > 3:
        head, tail = whole[:-3], whole[-3:]
        groups = []
        while len(head) > 2:
            groups.insert(0, head[-2:])
            head = head[:-2]
        if head:
            groups.insert(0, head)
        whole = ",".join(groups + [tail])
    return f"{'-' if neg else ''}₹{whole}.{frac}"


def dmy(iso: Optional[str]) -> str:
    if not iso:
        return "—"
    try:
        return datetime.fromisoformat(iso[:10]).strftime("%d-%m-%Y")
    except ValueError:
        return iso[:10]


def esc(v, limit: int = 0) -> str:
    s = "" if v is None else str(v)
    if limit and len(s) > limit:
        s = s[: limit - 1] + "…"
    return html.escape(s) or "—"


def _html(page: pymupdf.Page, rect: pymupdf.Rect, body: str) -> None:
    page.insert_htmlbox(rect, f"<body>{body}</body>", css=CSS)


def _chunks(rows: list, n: int) -> list[list]:
    return [rows[i:i + n] for i in range(0, len(rows), n)] or [[]]


def _truck(it: dict) -> str:
    return it.get("registration_number") or it.get("truck_id") or ""


def build(
    items: list[dict],
    load: Callable[[str], tuple[bytes, str]],
    *,
    labels: dict[str, str],
    filters: list[str],
    generated_by: str,
    missing: Optional[list[dict]] = None,
) -> bytes:
    """items: Proof and Documents rows, already filtered and in pack order.
    load(key) → (file bytes, file name). labels: category → its label, in
    the order the types appear. filters: lines describing what's in it."""
    out = pymupdf.open()
    n = len(items)
    index_pages = len(_chunks(items, INDEX_ROWS)) if n else 0
    front = 1 + index_pages

    # ── The documents first (into their own PDF), so the index knows pages ──
    body = pymupdf.open()
    starts: list[int] = []              # 0-based page within body
    notes: list[str] = []               # "" or why the file isn't shown in full
    for i, it in enumerate(items, start=1):
        starts.append(body.page_count)
        try:
            data, name = load(it["key"])
        except Exception:               # noqa: BLE001 — a missing/unreadable file gets a page saying so
            data, name = b"", it.get("file_name") or ""
        notes.append(_add_document(body, i, n, it, data, name))

    # ── Cover ──
    cover = out.new_page(width=A4.width, height=A4.height)
    by_type: dict[str, list[dict]] = {}
    for it in items:
        by_type.setdefault(it["category"], []).append(it)
    type_rows = "".join(
        f"<tr><td>{esc(labels.get(c, c))}</td><td class='r'>{len(rows)}</td>"
        f"<td class='r'>{inr(sum(r['amount'] or 0 for r in rows)) if any(r['amount'] for r in rows) else '—'}</td></tr>"
        for c, rows in by_type.items()
    )
    total_amt = sum(it["amount"] or 0 for it in items)
    miss_line = ""
    if missing is not None:
        miss_line = (f"<p class='sub'>Costs with no proof yet: <b>{len(missing)}</b> · "
                     f"{inr(sum(m['amount'] or 0 for m in missing))} (listed at the end)</p>")
    _html(cover, pymupdf.Rect(M, M, A4.width - M, A4.height - M), f"""
        <h1>Proof Pack</h1>
        <p class='sub'>Proof and Documents · {esc(', '.join(filters))}</p>
        <p class='sub'>Generated by {esc(generated_by)} on {datetime.now().strftime('%d-%m-%Y %I:%M %p')}</p>
        <p>&nbsp;</p>
        <h2>{n} document{'' if n == 1 else 's'}</h2>
        <table>
          <tr><th>Type</th><th class='r'>Documents</th><th class='r'>Amount</th></tr>
          {type_rows or "<tr><td colspan='3' class='muted'>No documents match these filters.</td></tr>"}
          <tr class='tot'><td>Total</td><td class='r'>{n}</td><td class='r'>{inr(total_amt) if total_amt else '—'}</td></tr>
        </table>
        <p>&nbsp;</p>
        {miss_line}
        <p class='sub'>Amounts are as recorded in the app. Each document's page carries its type, truck, invoice number and amount at the top.</p>
    """)

    # ── Index ──
    if n:
        for c_i, chunk in enumerate(_chunks(list(enumerate(items)), INDEX_ROWS)):
            page = out.new_page(width=A4.width, height=A4.height)
            rows = "".join(
                f"<tr><td>{k + 1}</td><td>{dmy(it['date'] or it.get('uploaded_at'))}</td><td>{esc(labels.get(it['category'], ''), 18)}</td>"
                f"<td>{esc(it['title'], 26 if notes[k] else 34)}{' <span class=muted>(' + esc(notes[k]) + ')</span>' if notes[k] else ''}</td>"
                f"<td>{esc(_truck(it), 13)}</td><td>{esc(it.get('party'), 16)}</td><td>{esc(it.get('invoice_number'), 12)}</td>"
                f"<td class='r'>{inr(it['amount']) if it['amount'] is not None else '—'}</td><td class='r'>{front + starts[k] + 1}</td></tr>"
                for k, it in chunk
            )
            _html(page, pymupdf.Rect(M, M, A4.width - M, A4.height - M), f"""
                <h2>Index{' (continued)' if c_i else ''}</h2>
                <table>
                  <tr><th>#</th><th>Date</th><th>Type</th><th>Document</th><th>Truck</th><th>Vendor / Person</th>
                      <th>Invoice No.</th><th class='r'>Amount</th><th class='r'>Page</th></tr>
                  {rows}
                </table>
            """)

    out.insert_pdf(body)

    # ── Missing proof list ──
    missing_start = out.page_count
    if missing is not None:
        for c_i, chunk in enumerate(_chunks(missing, INDEX_ROWS)):
            page = out.new_page(width=A4.width, height=A4.height)
            rows = "".join(
                f"<tr><td>{dmy(m['date'])}</td><td>{esc(labels.get(m['category'], m.get('category_label')), 18)}</td>"
                f"<td>{esc(m['title'], 32)}</td><td>{esc(_truck(m), 13)}</td><td>{esc(m.get('party'), 20)}</td>"
                f"<td>{esc(m.get('invoice_number'), 14)}</td><td class='r'>{inr(m['amount'])}</td></tr>"
                for m in chunk
            ) or "<tr><td colspan='7' class='muted'>Every cost in these filters has its proof.</td></tr>"
            total = (f"<tr class='tot'><td colspan='6'>Total ({len(missing)})</td><td class='r'>{inr(sum(m['amount'] or 0 for m in missing))}</td></tr>"
                     if c_i == len(_chunks(missing, INDEX_ROWS)) - 1 and missing else "")
            _html(page, pymupdf.Rect(M, M, A4.width - M, A4.height - M), f"""
                <h2>Missing proof{' (continued)' if c_i else ''}</h2>
                <p class='sub'>Costs recorded in the app with no proof of payment attached yet.</p>
                <table>
                  <tr><th>Date</th><th>Type</th><th>For</th><th>Truck</th><th>Vendor</th><th>Invoice No.</th><th class='r'>Amount</th></tr>
                  {rows}{total}
                </table>
            """)

    # ── Bookmarks (by type, then each document) and page footers ──
    toc: list[list] = [[1, "Cover", 1]]
    if n:
        toc.append([1, "Index", 2])
        current = None
        for k, it in enumerate(items):
            page_no = front + starts[k] + 1
            if it["category"] != current:
                current = it["category"]
                toc.append([1, labels.get(current, current), page_no])
            toc.append([2, f"{k + 1}. {it['title']}" + (f" · {_truck(it)}" if _truck(it) else ""), page_no])
    if missing is not None:
        toc.append([1, "Missing proof", missing_start + 1])
    out.set_toc(toc)

    total_pages = out.page_count
    # HTML, like the rest: plain insert_text picked up an embedded bill's fonts on its pages.
    for p_i, page in enumerate(out):
        _html(page, pymupdf.Rect(M, A4.height - 26, A4.width - M, A4.height - 12),
              f"<table><tr><td class='foot' style='border:none;padding:0'>Canaan ERP · Proof Pack</td>"
              f"<td class='foot r' style='border:none;padding:0'>Page {p_i + 1} of {total_pages}</td></tr></table>")

    out.set_metadata({"title": "Proof Pack", "author": "Canaan ERP", "creator": "Canaan ERP"})
    return out.tobytes(garbage=3, deflate=True)


def _strip(page: pymupdf.Page, i: int, n: int, it: dict, labels_line: str, part: str) -> None:
    """The header strip on a document's page."""
    page.draw_rect(pymupdf.Rect(M, M, A4.width - M, CONTENT_TOP - 10), color=None, fill=(0.95, 0.96, 0.97))
    bits = [f"<b>{i} of {n} · {esc(it['category_label'])}</b>"]
    meta = [x for x in (
        _truck(it),
        f"Inv {it['invoice_number']}" if it.get("invoice_number") else "",
        dmy(it["date"]) if it.get("date") else "",
        inr(it["amount"]) if it.get("amount") is not None else "",
    ) if x]
    _html(page, pymupdf.Rect(M + 8, M + 6, A4.width - M - 8, CONTENT_TOP - 12), f"""
        <div class='strip'>{' '.join(bits)}<span class='muted'>{(' · ' + esc(' · '.join(meta))) if meta else ''}</span></div>
        <div class='strip'>{esc(it['title'], 80)}{(' — ' + esc(it.get('party'), 40)) if it.get('party') else ''}</div>
        <div class='strip muted'>{esc(labels_line, 70)}{(' · ' + part) if part else ''}</div>
    """)


def _add_document(doc: pymupdf.Document, i: int, n: int, it: dict, data: bytes, name: str) -> str:
    """Append one document's page(s). Returns "" or a short note for the index."""
    # (The page itself says it in full; the index just flags it.)
    area = pymupdf.Rect(M, CONTENT_TOP, A4.width - M, A4.height - M - 8)
    file_line = name or it.get("file_name") or ""

    if data[:5] == b"%PDF-":
        try:
            src = pymupdf.open(stream=data, filetype="pdf")
            if src.needs_pass:
                raise ValueError("password-protected")
            total = src.page_count
            shown = min(total, MAX_PDF_PAGES)
            for p in range(shown):
                page = doc.new_page(width=A4.width, height=A4.height)
                _strip(page, i, n, it, file_line, f"page {p + 1} of {total}" if total > 1 else "")
                page.show_pdf_page(area, src, p)
            if shown < total:
                return f"first {shown} of {total} pp"
            return ""
        except Exception as e:  # noqa: BLE001
            return _unreadable(doc, i, n, it, file_line, "password" if "password" in str(e) else "unreadable PDF")

    if data:
        page = doc.new_page(width=A4.width, height=A4.height)
        try:
            page.insert_image(area, stream=data, keep_proportion=True)
            _strip(page, i, n, it, file_line, "")
            return ""
        except Exception:  # noqa: BLE001 — e.g. HEIC, or a corrupt image
            doc.delete_page(page.number)
    return _unreadable(doc, i, n, it, file_line, "not shown" if data else "file missing")


WHY = {"password": "it's a password-protected PDF", "unreadable PDF": "the PDF couldn't be read",
       "not shown": "its format can't be drawn here (e.g. HEIC) or it's damaged", "file missing": "the file wasn't found"}


def _unreadable(doc, i, n, it, file_line, why: str) -> str:
    page = doc.new_page(width=A4.width, height=A4.height)
    _strip(page, i, n, it, file_line, "")
    _html(page, pymupdf.Rect(M + 40, 300, A4.width - M - 40, 420), f"""
        <h2>This file couldn't be added</h2>
        <p class='sub'>{esc(file_line)}: {esc(WHY.get(why, why))}.</p>
        <p class='sub'>Open it from Proof and Documents in the app.</p>
    """)
    return why


def order(items: Iterable[dict], categories: list[str]) -> list[dict]:
    """Pack order: by type (the page's order), then oldest first."""
    rank = {c: k for k, c in enumerate(categories)}
    return sorted(items, key=lambda d: (rank.get(d["category"], 99), (d["date"] or d.get("uploaded_at") or "")[:10], d["key"]))
