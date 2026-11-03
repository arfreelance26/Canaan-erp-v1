"use client";

import { useState, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import { RiCloseLine as X, RiDownloadLine as Download, RiLoader4Line as Loader2 } from "@remixicon/react";
import type { Trip } from "@/types/trip";
import type { Truck } from "@/types/truck";
import type { Customer } from "@/types/customer";
import { buildCABHtml, generateCABPdf } from "@/lib/generate-cab";

type Props = {
  open: boolean;
  trip: Trip | null;
  truck?: Truck;
  customer?: Customer;
  invoiceNo: string;
  onClose: () => void;
};

function extractVoucherNo(tripId: string): string {
  const parts = tripId.split("-");
  return parts[parts.length - 1] || tripId;
}

function buildData(trip: Trip, truck: Truck | undefined, customer: Customer | undefined, invoiceNo: string) {
  return {
    customerName: customer?.name ?? trip.shipperConsignee ?? "",
    vehicleNo: trip.truckRegistration ?? truck?.registrationNumber ?? "",
    tripId: trip.tripId,
    bookingDate: trip.bookingCreatedDate ?? "",
    voucherNo: extractVoucherNo(trip.tripId),
    refNo: invoiceNo,
    amount: trip.customerCashAdvance ?? "",
    paymentType: trip.paymentType === "Credit" ? "Credit" : "Cash",
  };
}

export function CABDialog({ open, trip, truck, customer, invoiceNo, onClose }: Props) {
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [downloading, setDownloading] = useState(false);

  const revokePreview = useCallback((url: string | null) => {
    if (url) URL.revokeObjectURL(url);
  }, []);

  useEffect(() => {
    if (!open || !trip) {
      setPreviewUrl((prev) => { revokePreview(prev); return null; });
      return;
    }
    const logoSrc = `${window.location.origin}/companylogo.png`;
    const html = buildCABHtml({ ...buildData(trip, truck, customer, invoiceNo), logoSrc });
    const url  = URL.createObjectURL(new Blob([html], { type: "text/html" }));
    setPreviewUrl((prev) => { revokePreview(prev); return url; });
  }, [open, trip, truck, customer, invoiceNo, revokePreview]);

  useEffect(() => () => { setPreviewUrl((prev) => { revokePreview(prev); return null; }); }, [revokePreview]);

  if (!open || !trip) return null;

  async function handleDownload() {
    if (!trip) return;
    setDownloading(true);
    try {
      await generateCABPdf(buildData(trip, truck, customer, invoiceNo), trip.tripId);
    } catch {
      // silent — user can retry
    } finally {
      setDownloading(false);
    }
  }

  const amtFormatted = parseFloat(trip.customerCashAdvance || "0").toLocaleString("en-IN", {
    minimumFractionDigits: 2,
  });

  return createPortal(
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-scrim/50 p-4">
      <div className="flex h-[90vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl bg-background-primary-default shadow-2xl">

        <div className="flex items-center justify-between border-b border-separator-border px-6 py-4">
          <div>
            <h2 className="text-title-3-semibold text-text-primary">
              Customer Advance Bill — {trip.tripId}
            </h2>
            <p className="mt-0.5 text-xs text-text-tertiary">
              Customer Cash Advance: ₹{amtFormatted}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={handleDownload}
              disabled={downloading}
              className="flex items-center gap-2 rounded-lg bg-accent-solid px-4 py-2 text-body-semibold text-on-solid hover:bg-accent-solid-hover disabled:opacity-50"
            >
              {downloading
                ? <Loader2 className="h-4 w-4 animate-spin" />
                : <Download className="h-4 w-4" />}
              {downloading ? "Generating PDF…" : "Download PDF"}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-separator-border p-2 text-text-tertiary hover:bg-fill-2 hover:text-text-secondary"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-hidden bg-fill-2 p-4">
          {previewUrl ? (
            <iframe
              src={previewUrl}
              className="h-full w-full rounded-lg border border-separator-border bg-background-primary-default"
              title="CAB Preview"
            />
          ) : (
            <div className="flex h-full items-center justify-center">
              <Loader2 className="h-8 w-8 animate-spin text-text-tertiary" />
            </div>
          )}
        </div>

      </div>
    </div>,
    document.body
  );
}
