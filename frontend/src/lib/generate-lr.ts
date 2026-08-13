import type { Trip } from "@/types/trip";
import type { Driver } from "@/types/driver";
import type { Truck } from "@/types/truck";
import type { Customer } from "@/types/customer";

export async function generateLR(
  trip: Trip,
  driver: Driver | undefined,
  truck: Truck | undefined,
  customer: Customer | undefined,
) {
  const { default: jsPDF } = await import("jspdf");

  const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const pw = pdf.internal.pageSize.getWidth();   // 210mm
  const margin = 15;
  const lineH = 7;

  const fmtDate = (d?: string | null) => {
    if (!d) return "—";
    const parts = d.split("-");
    return parts.length === 3 ? `${parts[2]}-${parts[1]}-${parts[0]}` : d;
  };

  const container =
    trip.containerSpecification === "2 X 20 FEET CONTAINERS"
      ? `${trip.containerNumber1} / ${trip.containerNumber2}`
      : trip.containerNumber || "—";

  // ── Header band ──────────────────────────────────────────────────────────
  pdf.setFillColor(27, 43, 94);
  pdf.rect(0, 0, pw, 28, "F");

  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(16);
  pdf.setTextColor(255, 255, 255);
  pdf.text("CGI LOGISTICS", margin, 12);

  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(9);
  pdf.setTextColor(180, 200, 240);
  pdf.text("Lorry Receipt / Consignment Note", margin, 19);

  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(10);
  pdf.setTextColor(255, 255, 255);
  pdf.text(`LR No: ${trip.tripId}`, pw - margin, 12, { align: "right" });
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(9);
  pdf.setTextColor(180, 200, 240);
  pdf.text(`Date: ${fmtDate(trip.scheduledDate)}`, pw - margin, 19, { align: "right" });

  // ── Section helper ────────────────────────────────────────────────────────
  let y = 36;

  function sectionHeader(title: string) {
    pdf.setFillColor(240, 245, 255);
    pdf.rect(margin, y, pw - margin * 2, 6, "F");
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(8);
    pdf.setTextColor(27, 43, 94);
    pdf.text(title.toUpperCase(), margin + 2, y + 4.2);
    y += 7;
  }

  function row(label: string, value: string, x2 = margin + 60) {
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(8.5);
    pdf.setTextColor(100, 100, 100);
    pdf.text(label, margin + 2, y);
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(9);
    pdf.setTextColor(30, 30, 30);
    pdf.text(value, x2, y);
    y += lineH;
  }

  function twoCol(l1: string, v1: string, l2: string, v2: string) {
    const mid = pw / 2 + 2;
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(8.5);
    pdf.setTextColor(100, 100, 100);
    pdf.text(l1, margin + 2, y);
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(9);
    pdf.setTextColor(30, 30, 30);
    pdf.text(v1, margin + 42, y);
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(8.5);
    pdf.setTextColor(100, 100, 100);
    pdf.text(l2, mid + 2, y);
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(9);
    pdf.setTextColor(30, 30, 30);
    pdf.text(v2, mid + 42, y);
    y += lineH;
  }

  function divider() {
    pdf.setDrawColor(220, 225, 235);
    pdf.line(margin, y - 1, pw - margin, y - 1);
  }

  // ── Booking / Consignment Info ────────────────────────────────────────────
  sectionHeader("Consignment Details");
  twoCol("Booking Ref", trip.bookingReferenceNo || "—", "Trip Category", trip.tripCategory || "—");
  twoCol("Scheduled Date", fmtDate(trip.scheduledDate), "Movement", trip.movementCategory || "—");
  divider();
  y += 2;

  // ── Route ─────────────────────────────────────────────────────────────────
  sectionHeader("Route");
  row("Origin (From)", trip.origin || "—");
  row("Destination (To)", trip.destination || "—");
  divider();
  y += 2;

  // ── Consignor / Consignee ─────────────────────────────────────────────────
  sectionHeader("Consignor / Consignee");
  row("Customer / Party", customer?.name ?? trip.shipperConsignee ?? "—");
  row("Shipping Line", trip.shippingLine || "—");
  row("Vessel Name", trip.vesselName || "—");
  divider();
  y += 2;

  // ── Cargo / Container ─────────────────────────────────────────────────────
  sectionHeader("Cargo & Container");
  twoCol("Container No", container, "Container Type", trip.containerSpecification || "—");
  twoCol("Cargo Classification", trip.cargoClassification || "—", "Cargo Weight", trip.cargoWeight ? `${trip.cargoWeight} tons` : "—");
  row("Cargo Reference / BL No", trip.cargoReference || trip.releaseOrderReference || "—");
  divider();
  y += 2;

  // ── Vehicle & Driver ──────────────────────────────────────────────────────
  sectionHeader("Vehicle & Driver");
  twoCol("Vehicle No", truck?.registrationNumber ?? trip.vehicleId ?? "—", "Vehicle Type", truck?.truckType ?? "—");
  twoCol("Driver", driver?.name ?? trip.driverId ?? "—", "Driver License", driver?.licenseNumber ?? "—");
  divider();
  y += 2;

  // ── Freight Details ───────────────────────────────────────────────────────
  sectionHeader("Freight Details");
  twoCol("Hire Amount", trip.transportHireAmount ? `Rs. ${Number(trip.transportHireAmount).toLocaleString("en-IN")}` : "—", "Payment Type", trip.paymentType || "—");
  twoCol("CHA Name", trip.chaName || "—", "Bill To", trip.billTo || "—");
  divider();
  y += 2;

  // ── Conditions strip ──────────────────────────────────────────────────────
  y += 3;
  pdf.setFont("helvetica", "italic");
  pdf.setFontSize(7.5);
  pdf.setTextColor(140, 140, 140);
  const conditions = "Subject to Chennai jurisdiction. Goods accepted as per terms and conditions of the company. The carrier shall not be liable for damage due to inherent defects.";
  const condLines = pdf.splitTextToSize(conditions, pw - margin * 2);
  pdf.text(condLines, margin, y);
  y += condLines.length * 4.5 + 4;

  // ── Signature blocks ──────────────────────────────────────────────────────
  pdf.setDrawColor(27, 43, 94);
  const sigY = y + 16;
  const sigWidth = (pw - margin * 2 - 10) / 3;

  for (let i = 0; i < 3; i++) {
    const sx = margin + i * (sigWidth + 5);
    pdf.line(sx, sigY, sx + sigWidth, sigY);
  }
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(8);
  pdf.setTextColor(80, 80, 80);
  const labels = ["Driver's Signature", "Receiver's Signature", "Authorised Signatory"];
  for (let i = 0; i < 3; i++) {
    const sx = margin + i * (sigWidth + 5);
    pdf.text(labels[i], sx, sigY + 5, { align: "left" });
  }

  // ── Footer ────────────────────────────────────────────────────────────────
  const footerY = 285;
  pdf.setFillColor(27, 43, 94);
  pdf.rect(0, footerY, pw, 12, "F");
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(7.5);
  pdf.setTextColor(180, 200, 240);
  pdf.text("CGI Logistics — Computer Generated Lorry Receipt", margin, footerY + 4.5);
  pdf.text(
    `Generated: ${new Date().toLocaleDateString("en-GB", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "Asia/Kolkata" }).replace(/\//g, "-")}`,
    pw - margin, footerY + 4.5, { align: "right" },
  );
  pdf.setTextColor(130, 160, 210);
  pdf.text("This is a computer generated document and does not require a physical signature when sent digitally.", margin, footerY + 9);

  pdf.save(`LR-${trip.tripId}.pdf`);
}
