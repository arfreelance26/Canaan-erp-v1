"use client";

import { useState, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import { X, Download, Loader2 } from "lucide-react";
import type { Trip } from "@/types/trip";
import type { Truck } from "@/types/truck";
import type { Customer } from "@/types/customer";
import { buildDABHtml, generateDABPdf } from "@/lib/generate-dab";

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
    customerName: customer?.name ?? "",
    vehicleNo: trip.truckRegistration ?? truck?.registrationNumber ?? "",
    tripId: trip.tripId,
    bookingDate: trip.bookingCreatedDate ?? "",
    voucherNo: extractVoucherNo(trip.tripId),
    refNo: invoiceNo,
    litres: trip.customerFuelAdvanceLitres ?? "",
    amount: trip.customerFuelAdvanceAmount ?? "",
  };
}

export function DABDialog({ open, trip, truck, customer, invoiceNo, onClose }: Props) {
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
    const html = buildDABHtml({ ...buildData(trip, truck, customer, invoiceNo), logoSrc });
    const url  = URL.createObjectURL(new Blob([html], { type: "text/html" }));
    setPreviewUrl((prev) => { revokePreview(prev); return url; });
  }, [open, trip, truck, customer, invoiceNo, revokePreview]);

  useEffect(() => () => { setPreviewUrl((prev) => { revokePreview(prev); return null; }); }, [revokePreview]);

  if (!open || !trip) return null;

  async function handleDownload() {
    if (!trip) return;
    setDownloading(true);
    try {
      await generateDABPdf(buildData(trip, truck, customer, invoiceNo), trip.tripId);
    } catch {
      // silent — user can retry
    } finally {
      setDownloading(false);
    }
  }

  const amtFormatted = parseFloat(trip.customerFuelAdvanceAmount || "0").toLocaleString("en-IN", {
    minimumFractionDigits: 2,
  });

  return createPortal(
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4">
      <div className="flex h-[90vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">

        <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4">
          <div>
            <h2 className="text-lg font-bold text-gray-900">
              Diesel Advance Bill — {trip.tripId}
            </h2>
            <p className="mt-0.5 text-xs text-gray-400">
              Customer Fuel Advance: ₹{amtFormatted}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={handleDownload}
              disabled={downloading}
              className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {downloading
                ? <Loader2 className="h-4 w-4 animate-spin" />
                : <Download className="h-4 w-4" />}
              {downloading ? "Generating PDF…" : "Download PDF"}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-gray-200 p-2 text-gray-400 hover:bg-gray-50 hover:text-gray-600"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-hidden bg-gray-100 p-4">
          {previewUrl ? (
            <iframe
              src={previewUrl}
              className="h-full w-full rounded-lg border border-gray-200 bg-white"
              title="DAB Preview"
            />
          ) : (
            <div className="flex h-full items-center justify-center">
              <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
            </div>
          )}
        </div>

      </div>
    </div>,
    document.body
  );
}
