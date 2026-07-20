"use client";

import { useState, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import { X, Loader2, FileText, Download, ArrowLeft, Eye, Save, CheckCircle2 } from "lucide-react";
import type { Trip } from "@/types/trip";
import type { Truck } from "@/types/truck";
import { buildLRHtml, generateLRConsignment, type LRConsignmentData } from "@/lib/generate-lr-consignment";
import { tripsApi } from "@/lib/api";
import { showError } from "@/lib/swal";

type Props = {
  open: boolean;
  trip: Trip | null;
  truck: Truck | undefined;
  invoiceNo: string;
  onClose: () => void;
  onSaved?: (trip: Trip) => void;
};

type Step = "form" | "preview";

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

export function LRConsignmentDialog({ open, trip, truck, invoiceNo, onClose, onSaved }: Props) {
  const [step, setStep]                        = useState<Step>("form");
  const [previewUrl, setPreviewUrl]            = useState<string | null>(null);
  const [consignor, setConsignor]              = useState("");
  const [consignee, setConsignee]              = useState("");
  const [refNo, setRefNo]                      = useState("");
  const [descriptionOfGoods, setDescOf]        = useState("");
  const [manualInvoiceNo, setManualInvoiceNo]  = useState("");
  const [sbBeNo, setSbBeNo]                    = useState("");
  const [sealNo, setSealNo]                    = useState("");
  const [tare, setTare]                        = useState("");
  const [weight, setWeight]                    = useState("");
  const [value, setValue]                      = useState("");
  const [toPay, setToPay]                      = useState(false);
  const [toBeBilled, setToBeBilled]            = useState(false);
  const [saving, setSaving]                    = useState(false);
  const [downloading, setDownloading]          = useState(false);
  const [lrSaved, setLrSaved]                  = useState(false);

  const cleanupPreview = useCallback(() => {
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
      setPreviewUrl(null);
    }
  }, [previewUrl]);

  useEffect(() => {
    if (open && trip) {
      // Pre-fill from saved LR data if present
      const saved = !!trip.lrSavedAt;
      setLrSaved(saved);
      setConsignor(trip.lrConsignor ?? "");
      setConsignee(trip.lrConsignee ?? "");
      setRefNo(trip.lrRefNo ?? "");
      setDescOf(trip.lrDescriptionOfGoods ?? "");
      setSbBeNo(trip.lrSbBeNo ?? "");
      setSealNo(trip.lrSealNoPackages ?? "");
      setTare(trip.lrTare ?? "");
      setWeight(trip.lrWeight ?? "");
      setValue(trip.lrValue ?? "");
      setToPay(trip.lrToPay ?? false);
      setToBeBilled(trip.lrToBeBilled ?? false);
      setManualInvoiceNo(trip.lrInvoiceNo ?? invoiceNo ?? "");
      setStep("form");
    } else if (!open) {
      cleanupPreview();
      setStep("form");
      setLrSaved(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, trip]);

  if (!open || !trip) return null;

  const containerNo = getContainerNo(trip);
  const truckReg    = truck?.registrationNumber ?? trip.vehicleId ?? "";
  const isInvoiced  = !!invoiceNo;

  function buildData(): LRConsignmentData {
    return {
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
    };
  }

  async function handleSave() {
    setSaving(true);
    try {
      await tripsApi.saveLR(trip!.id, {
        lr_consignor: consignor || null,
        lr_consignee: consignee || null,
        lr_ref_no: refNo || null,
        lr_description_of_goods: descriptionOfGoods || null,
        lr_invoice_no: (isInvoiced ? invoiceNo : manualInvoiceNo) || null,
        lr_sb_be_no: sbBeNo || null,
        lr_seal_no_packages: sealNo || null,
        lr_tare: tare || null,
        lr_weight: weight || null,
        lr_value: value || null,
        lr_to_pay: toPay,
        lr_to_be_billed: toBeBilled,
      });
      setLrSaved(true);
      if (onSaved) {
        onSaved({
          ...trip!,
          lrConsignor: consignor,
          lrConsignee: consignee,
          lrRefNo: refNo,
          lrDescriptionOfGoods: descriptionOfGoods,
          lrInvoiceNo: isInvoiced ? invoiceNo : manualInvoiceNo,
          lrSbBeNo: sbBeNo,
          lrSealNoPackages: sealNo,
          lrTare: tare,
          lrWeight: weight,
          lrValue: value,
          lrToPay: toPay,
          lrToBeBilled: toBeBilled,
          lrSavedAt: new Date().toISOString(),
        });
      }
    } catch (err: unknown) {
      showError(err instanceof Error ? err.message : "Failed to save LR data.");
    } finally {
      setSaving(false);
    }
  }

  function handlePreview() {
    cleanupPreview();
    const logoSrc = `${window.location.origin}/companylogo.png`;
    const html = buildLRHtml(buildData(), logoSrc);
    const blob = new Blob([html], { type: "text/html" });
    setPreviewUrl(URL.createObjectURL(blob));
    setStep("preview");
  }

  function handleBack() {
    cleanupPreview();
    setStep("form");
  }

  async function handleDownload() {
    setDownloading(true);
    try {
      await generateLRConsignment(buildData(), trip!.tripId);
    } catch (err: unknown) {
      showError(err instanceof Error ? err.message : "Failed to generate LR document.");
    } finally {
      setDownloading(false);
    }
  }

  const isPreview = step === "preview";

  return createPortal(
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50 p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        className={`flex flex-col rounded-2xl bg-white shadow-2xl transition-all duration-200 ${
          isPreview ? "w-full max-w-5xl" : "w-full max-w-2xl"
        }`}
        style={{ maxHeight: "92vh" }}
      >

        {/* ── Header ──────────────────────────────────────────────────────── */}
        <div className="flex items-center justify-between border-b px-6 py-4">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-900/10">
              <FileText className="h-4.5 w-4.5 text-blue-900" />
            </div>
            <div>
              <h2 className="text-base font-bold text-gray-900">
                {isPreview ? "LR Preview" : "Lorry Receipt"}
              </h2>
              <p className="text-xs text-gray-500">{trip.tripId} · Consignment Note</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {lrSaved && !isPreview && (
              <span className="flex items-center gap-1 rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">
                <CheckCircle2 className="h-3.5 w-3.5" /> Saved
              </span>
            )}
            <button type="button" onClick={onClose}
              className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 transition-colors">
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* ── Form Step ───────────────────────────────────────────────────── */}
        {!isPreview && (
          <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">

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
                  <label className="mb-1 block text-xs font-medium text-gray-600">Source</label>
                  <input readOnly value={trip.origin || ""} className={roClass} />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-gray-600">Destination</label>
                  <input readOnly value={trip.destination || ""} className={roClass} />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-gray-600">Truck No.</label>
                  <input readOnly value={truckReg} className={`${roClass} font-mono text-xs`} />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-gray-600">Container No.</label>
                  <input readOnly value={containerNo} className={`${roClass} font-mono text-xs`} />
                </div>
                <div className="col-span-2">
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

            <div>
              <p className="mb-3 text-[11px] font-bold uppercase tracking-wider text-gray-400">
                Consignment Details
              </p>
              <div className="space-y-3">

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

                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label className="mb-1 block text-xs font-medium text-gray-600">Ref No.</label>
                    <input value={refNo} onChange={(e) => setRefNo(e.target.value)} placeholder="Reference number" className={inClass} />
                  </div>
                  <div className="col-span-2">
                    <label className="mb-1 block text-xs font-medium text-gray-600">Description of Goods (Said to Contain)</label>
                    <input value={descriptionOfGoods} onChange={(e) => setDescOf(e.target.value)} placeholder="Describe the goods" className={inClass} />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="mb-1 block text-xs font-medium text-gray-600">S.B / B.E No.</label>
                    <input value={sbBeNo} onChange={(e) => setSbBeNo(e.target.value)} placeholder="Shipping Bill / Bill of Entry No." className={inClass} />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-gray-600">Seal No. of Packages</label>
                    <input value={sealNo} onChange={(e) => setSealNo(e.target.value)} placeholder="Seal number" className={inClass} />
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label className="mb-1 block text-xs font-medium text-gray-600">Tare</label>
                    <input value={tare} onChange={(e) => setTare(e.target.value)} placeholder="Tare weight" className={inClass} />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-gray-600">Weight</label>
                    <input value={weight} onChange={(e) => setWeight(e.target.value)} placeholder="Gross weight" className={inClass} />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-gray-600">Value</label>
                    <input value={value} onChange={(e) => setValue(e.target.value)} placeholder="Declared value" className={inClass} />
                  </div>
                </div>

                <div className="flex items-center gap-8 rounded-xl border border-gray-100 bg-gray-50/60 px-5 py-3">
                  <label className="flex cursor-pointer items-center gap-2.5">
                    <input type="checkbox" checked={toPay} onChange={(e) => setToPay(e.target.checked)} className="h-4 w-4 rounded border-gray-300 accent-blue-900" />
                    <span className="text-sm font-semibold text-gray-700">To Pay</span>
                  </label>
                  <label className="flex cursor-pointer items-center gap-2.5">
                    <input type="checkbox" checked={toBeBilled} onChange={(e) => setToBeBilled(e.target.checked)} className="h-4 w-4 rounded border-gray-300 accent-blue-900" />
                    <span className="text-sm font-semibold text-gray-700">To be Billed</span>
                  </label>
                </div>

              </div>
            </div>
          </div>
        )}

        {/* ── Preview Step ─────────────────────────────────────────────────── */}
        {isPreview && previewUrl && (
          <div className="flex-1 overflow-hidden bg-gray-100 p-4">
            <iframe
              src={previewUrl}
              className="h-full w-full rounded-xl border border-gray-200 bg-white shadow-sm"
              style={{ minHeight: "600px" }}
              title="LR Preview"
            />
          </div>
        )}

        {/* ── Footer ──────────────────────────────────────────────────────── */}
        <div className="flex items-center justify-between border-t px-6 py-4">
          <div>
            {isPreview && (
              <button type="button" onClick={handleBack}
                className="flex items-center gap-2 rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors">
                <ArrowLeft className="h-4 w-4" />
                Back
              </button>
            )}
          </div>
          <div className="flex items-center gap-3">
            {!isPreview && (
              <button type="button" onClick={onClose}
                className="rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors">
                Cancel
              </button>
            )}

            {!isPreview ? (
              <>
                {/* Always show Save button */}
                <button
                  type="button"
                  onClick={handleSave}
                  disabled={saving}
                  className="flex items-center gap-2 rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                  {saving ? "Saving…" : lrSaved ? "Update" : "Save LR"}
                </button>

                {/* Preview and Download only after saved in DB */}
                {lrSaved && (
                  <>
                    <button
                      type="button"
                      onClick={handlePreview}
                      className="flex items-center gap-2 rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors"
                    >
                      <Eye className="h-4 w-4" />
                      Preview
                    </button>
                    <button
                      type="button"
                      onClick={handleDownload}
                      disabled={downloading}
                      className="flex items-center gap-2 rounded-lg bg-blue-600 px-5 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
                    >
                      {downloading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
                      {downloading ? "Downloading…" : "Download PDF"}
                    </button>
                  </>
                )}
              </>
            ) : (
              <button
                type="button"
                onClick={handleDownload}
                disabled={downloading}
                className="flex items-center gap-2 rounded-lg bg-blue-600 px-5 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
              >
                {downloading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
                {downloading ? "Downloading…" : "Download PDF"}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
