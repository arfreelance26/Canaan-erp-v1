"use client";

import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { X, Loader2, FileText } from "lucide-react";
import type { Trip } from "@/types/trip";
import type { Truck } from "@/types/truck";
import { generateLRConsignment } from "@/lib/generate-lr-consignment";
import { showError } from "@/lib/swal";

type Props = {
  open: boolean;
  trip: Trip | null;
  truck: Truck | undefined;
  invoiceNo: string;
  onClose: () => void;
};

function fmtDate(d?: string): string {
  if (!d) return "";
  const p = d.split("-");
  return p.length === 3 ? `${p[2]}-${p[1]}-${p[0]}` : d;
}

function getContainerNo(trip: Trip): string {
  if (trip.containerSpecification === "2 X 20 FEET CONTAINERS") {
    return [trip.containerNumber1, trip.containerNumber2].filter(Boolean).join(" / ");
  }
  return trip.containerNumber || "";
}

const roClass =
  "w-full rounded-lg border border-gray-100 bg-gray-50 px-3 py-2 text-sm text-gray-700 cursor-not-allowed";
const inClass =
  "w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-900 focus:border-blue-400 focus:outline-none";

export function LRConsignmentDialog({ open, trip, truck, invoiceNo, onClose }: Props) {
  const [consignor, setConsignor]             = useState("");
  const [consignee, setConsignee]             = useState("");
  const [refNo, setRefNo]                     = useState("");
  const [descriptionOfGoods, setDescOf]       = useState("");
  const [manualInvoiceNo, setManualInvoiceNo] = useState("");
  const [sbBeNo, setSbBeNo]                   = useState("");
  const [sealNo, setSealNo]                   = useState("");
  const [tare, setTare]                       = useState("");
  const [weight, setWeight]                   = useState("");
  const [value, setValue]                     = useState("");
  const [toPay, setToPay]                     = useState(false);
  const [toBeBilled, setToBeBilled]           = useState(false);
  const [generating, setGenerating]           = useState(false);

  useEffect(() => {
    if (open) {
      setManualInvoiceNo(invoiceNo || "");
    } else {
      setConsignor(""); setConsignee(""); setRefNo(""); setDescOf("");
      setManualInvoiceNo(""); setSbBeNo(""); setSealNo("");
      setTare(""); setWeight(""); setValue("");
      setToPay(false); setToBeBilled(false);
    }
  }, [open, invoiceNo]);

  if (!open || !trip) return null;

  const containerNo = getContainerNo(trip);
  const truckReg    = truck?.registrationNumber ?? trip.vehicleId ?? "";
  const isInvoiced  = !!invoiceNo;

  async function handleGenerate() {
    setGenerating(true);
    try {
      await generateLRConsignment(
        {
          no: trip!.tripId,
          date: fmtDate(trip!.bookingCreatedDate),
          source: trip!.origin || "",
          destination: trip!.destination || "",
          truckNo: truckReg,
          consignor,
          consignee,
          refNo,
          descriptionOfGoods,
          invoiceNo: isInvoiced ? invoiceNo : manualInvoiceNo,
          sbBeNo,
          containerNo,
          sealNoOfPackages: sealNo,
          tare,
          weight,
          value,
          toPay,
          toBeBilled,
        },
        trip!.tripId,
      );
    } catch (err: unknown) {
      showError(err instanceof Error ? err.message : "Failed to generate LR document.");
    } finally {
      setGenerating(false);
    }
  }

  return createPortal(
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50 p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="flex w-full max-w-2xl flex-col rounded-2xl bg-white shadow-2xl max-h-[92vh]">

        {/* ── Header ──────────────────────────────────────────────────────── */}
        <div className="flex items-center justify-between border-b px-6 py-4">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-900/10">
              <FileText className="h-4.5 w-4.5 text-blue-900" />
            </div>
            <div>
              <h2 className="text-base font-bold text-gray-900">Generate Lorry Receipt</h2>
              <p className="text-xs text-gray-500">{trip.tripId} · Consignment Note</p>
            </div>
          </div>
          <button type="button" onClick={onClose}
            className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 transition-colors">
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* ── Form ────────────────────────────────────────────────────────── */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">

          {/* Auto-filled fields */}
          <div>
            <p className="mb-3 text-[11px] font-bold uppercase tracking-wider text-indigo-500">
              Auto-filled from trip
            </p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-600">No.</label>
                <input readOnly value={trip.tripId} className={roClass} />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-600">Date (Booking Created)</label>
                <input readOnly value={fmtDate(trip.bookingCreatedDate)} className={roClass} />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-600">Container No.</label>
                <input readOnly value={containerNo} className={`${roClass} font-mono text-xs`} />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-600">Invoice No.</label>
                {isInvoiced ? (
                  <input readOnly value={invoiceNo} className={roClass} />
                ) : (
                  <div>
                    <input
                      value={manualInvoiceNo}
                      onChange={(e) => setManualInvoiceNo(e.target.value)}
                      placeholder="Enter invoice no. if known"
                      className={inClass}
                    />
                    <p className="mt-1 text-[11px] text-amber-600 font-medium">
                      Invoice not yet generated — enter manually or leave blank
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>

          <hr className="border-gray-100" />

          {/* Manual fields */}
          <div>
            <p className="mb-3 text-[11px] font-bold uppercase tracking-wider text-gray-400">
              Consignment Details
            </p>
            <div className="space-y-3">

              {/* Consignor / Consignee */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-xs font-medium text-gray-600">CONSIGNOR</label>
                  <textarea
                    value={consignor}
                    onChange={(e) => setConsignor(e.target.value)}
                    rows={2}
                    placeholder="Consignor name and address"
                    className={`${inClass} resize-none`}
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-gray-600">CONSIGNEE</label>
                  <textarea
                    value={consignee}
                    onChange={(e) => setConsignee(e.target.value)}
                    rows={2}
                    placeholder="Consignee name and address"
                    className={`${inClass} resize-none`}
                  />
                </div>
              </div>

              {/* Ref No + Description */}
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="mb-1 block text-xs font-medium text-gray-600">Ref No.</label>
                  <input
                    value={refNo}
                    onChange={(e) => setRefNo(e.target.value)}
                    placeholder="Reference number"
                    className={inClass}
                  />
                </div>
                <div className="col-span-2">
                  <label className="mb-1 block text-xs font-medium text-gray-600">
                    Description of Goods (Said to Contain)
                  </label>
                  <input
                    value={descriptionOfGoods}
                    onChange={(e) => setDescOf(e.target.value)}
                    placeholder="Describe the goods"
                    className={inClass}
                  />
                </div>
              </div>

              {/* S.B/B.E + Seal No */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-xs font-medium text-gray-600">S.B / B.E No.</label>
                  <input
                    value={sbBeNo}
                    onChange={(e) => setSbBeNo(e.target.value)}
                    placeholder="Shipping Bill / Bill of Entry No."
                    className={inClass}
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-gray-600">Seal No. of Packages</label>
                  <input
                    value={sealNo}
                    onChange={(e) => setSealNo(e.target.value)}
                    placeholder="Seal number"
                    className={inClass}
                  />
                </div>
              </div>

              {/* Tare / Weight / Value */}
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="mb-1 block text-xs font-medium text-gray-600">Tare</label>
                  <input
                    value={tare}
                    onChange={(e) => setTare(e.target.value)}
                    placeholder="Tare weight"
                    className={inClass}
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-gray-600">Weight</label>
                  <input
                    value={weight}
                    onChange={(e) => setWeight(e.target.value)}
                    placeholder="Gross weight"
                    className={inClass}
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-gray-600">Value</label>
                  <input
                    value={value}
                    onChange={(e) => setValue(e.target.value)}
                    placeholder="Declared value"
                    className={inClass}
                  />
                </div>
              </div>

              {/* Checkboxes */}
              <div className="flex items-center gap-8 rounded-xl border border-gray-100 bg-gray-50/60 px-5 py-3">
                <label className="flex cursor-pointer items-center gap-2.5">
                  <input
                    type="checkbox"
                    checked={toPay}
                    onChange={(e) => setToPay(e.target.checked)}
                    className="h-4 w-4 rounded border-gray-300 accent-blue-900"
                  />
                  <span className="text-sm font-semibold text-gray-700">To Pay</span>
                </label>
                <label className="flex cursor-pointer items-center gap-2.5">
                  <input
                    type="checkbox"
                    checked={toBeBilled}
                    onChange={(e) => setToBeBilled(e.target.checked)}
                    className="h-4 w-4 rounded border-gray-300 accent-blue-900"
                  />
                  <span className="text-sm font-semibold text-gray-700">To be Billed</span>
                </label>
              </div>

            </div>
          </div>
        </div>

        {/* ── Footer ──────────────────────────────────────────────────────── */}
        <div className="flex items-center justify-end gap-3 border-t px-6 py-4">
          <button type="button" onClick={onClose}
            className="rounded-xl border border-gray-200 px-5 py-2.5 text-sm font-semibold text-gray-600 hover:bg-gray-50 transition-colors">
            Cancel
          </button>
          <button
            type="button"
            onClick={handleGenerate}
            disabled={generating}
            className="flex items-center gap-2 rounded-xl bg-blue-900 px-6 py-2.5 text-sm font-bold text-white shadow-sm hover:bg-blue-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {generating ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <FileText className="h-4 w-4" />
            )}
            {generating ? "Generating…" : "Generate LR"}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
