import { createReportPdf, num, GREEN, RED, GREY, type Column } from "@/lib/report-pdf-kit";

/** One row of the Dashboard's "available vehicles" window. */
export type AvailableVehicleRow = {
  registration: string;
  truckId: string;
  type: string;
  branch: string;
  odometer: number | null;
  /** The documents past their expiry date (RC, FC, Insurance, …). */
  expired: string[];
};

/**
 * The Dashboard's "N available vehicles" window as a PDF: the trucks free for
 * a new trip right now (the window's search applies), each with any expired
 * documents named, so a truck isn't sent out on an expired RC or Insurance.
 */
export async function downloadAvailableVehiclesPdf({ rows, total, search }: {
  rows: AvailableVehicleRow[];
  /** All available trucks (rows may be a search's subset). */
  total: number;
  search: string;
}): Promise<void> {
  const now = new Date();
  const stamp = now.toLocaleString("en-IN", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", hour12: true })
    .replace(/\//g, "-");
  const name = "Available Vehicles";
  const k = await createReportPdf({ reportName: name, period: `As of ${stamp}`, orientation: "portrait" });
  const { M, W, para, table, tiles, pageTitle, section } = k;

  const withExpired = rows.filter((r) => r.expired.length).length;
  const branches = new Map<string, number>();
  for (const r of rows) branches.set(r.branch || "No branch", (branches.get(r.branch || "No branch") ?? 0) + 1);

  const sub = `Trucks free for a new trip (not sold, not on an assigned or running trip) | As of ${stamp}`
    + (search.trim() ? ` | search: "${search.trim()}" (${rows.length} of ${total})` : "");
  let y = pageTitle(name, sub);
  y = tiles(y + 1, [
    { label: "Available", value: num(rows.length), color: GREEN, note: search.trim() ? `of ${total} available` : "trucks free right now" },
    { label: "Ready to go", value: num(rows.length - withExpired), note: "no expired documents" },
    { label: "Expired documents", value: num(withExpired), color: withExpired ? RED : undefined, note: withExpired ? "renew before sending out" : "none" },
    { label: "Branches", value: num(branches.size), note: [...branches].map(([b, n]) => `${b} ${n}`).join(", ") },
  ]);

  y = section(y, "Available vehicles") - 2;
  const cols: Column<AvailableVehicleRow & { i: number }>[] = [
    { header: "#", width: 7, align: "center", cell: (r) => String(r.i) },
    { header: "Registration", width: 30, cell: (r) => ({ text: r.registration || "-", bold: true }) },
    { header: "Truck ID", width: 22, cell: (r) => r.truckId || "-" },
    { header: "Type", width: 28, cell: (r) => r.type || "-" },
    { header: "Branch", width: 24, cell: (r) => r.branch || "-" },
    { header: "Odometer (km)", width: 22, align: "right", cell: (r) => (r.odometer ? num(r.odometer) : "-") },
    { header: "Expired documents", width: 40, cell: (r) => (r.expired.length ? { text: r.expired.join(", "), color: RED, bold: true } : { text: "None", color: GREY }) },
  ];
  y = table(rows.map((r, i) => ({ ...r, i: i + 1 })), cols, null, y, name, sub) + 5;

  para("Expired = past the expiry date on Compliance & Renewals. A document with no date entered isn't counted here.",
    M, y, W - M * 2, 7.5, GREY);
  k.finish(`Available_Vehicles_${stamp.slice(0, 10)}.pdf`);
}
