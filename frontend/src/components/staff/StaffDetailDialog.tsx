"use client";

import { useEffect, useState, type ReactNode } from "react";
import {
  BadgeCheck, Briefcase, Building2, CalendarDays, Cake, Download, Eye, EyeOff, FileText,
  IdCard, Image as ImageIcon, Laptop, Loader2, Mail, MapPin, Phone, Smartphone, X, ZoomIn,
} from "lucide-react";
import { fileUrl } from "@/lib/api";
import type { Staff } from "@/types/staff";
import { FileViewer } from "@/components/ui/FileViewer";
import { cn } from "@/lib/utils";

type Props = {
  staff: Staff | null;
  onClose: () => void;
  isAdmin: boolean;
  downloading: boolean;
  onDownloadPdf: (s: Staff) => void;
  onResetDevice: (staffId: string, deviceId: string, label: string) => void;
};

type Doc = { key: string; label: string; field: string; kind: "image" | "pdf"; filename: string };

const fmtD = (v: string) =>
  v ? new Date(v + "T00:00:00").toLocaleDateString("en-GB", { day: "2-digit", month: "2-digit", year: "numeric" }).replace(/\//g, "-") : "—";

const fmtDateTime = (v: string) => {
  const d = new Date(v.endsWith("Z") || v.includes("+") ? v : v + "Z");
  return isNaN(d.getTime()) ? "—" : d.toLocaleString("en-GB", {
    day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", hour12: true, timeZone: "Asia/Kolkata",
  }).replace(/\//g, "-");
};

/** "2 yrs 3 mos" since a YYYY-MM-DD date. */
function tenure(from: string): string | null {
  if (!from) return null;
  const start = new Date(from + "T00:00:00");
  const now = new Date();
  let months = (now.getFullYear() - start.getFullYear()) * 12 + (now.getMonth() - start.getMonth());
  if (now.getDate() < start.getDate()) months -= 1;
  if (months < 0) return null;
  const y = Math.floor(months / 12);
  const m = months % 12;
  if (y === 0 && m === 0) return "Joined this month";
  return [y ? `${y} yr${y > 1 ? "s" : ""}` : "", m ? `${m} mo${m > 1 ? "s" : ""}` : ""].filter(Boolean).join(" ");
}

function initialsOf(name: string) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]?.toUpperCase()).join("") || "?";
}

function SectionCard({ title, icon, children }: { title: string; icon: ReactNode; children: ReactNode }) {
  return (
    <section className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
      <p className="mb-3 flex items-center gap-2 text-[11px] font-bold uppercase tracking-wider text-gray-500">
        <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-blue-50 text-blue-600">{icon}</span>
        {title}
      </p>
      {children}
    </section>
  );
}

function InfoRow({ icon, label, children }: { icon: ReactNode; label: string; children: ReactNode }) {
  return (
    <div className="flex items-start gap-3 py-2">
      <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-gray-50 text-gray-400">{icon}</span>
      <div className="min-w-0 flex-1">
        <p className="text-[11px] font-medium text-gray-400">{label}</p>
        <div className="text-sm font-medium text-gray-800 break-words">{children}</div>
      </div>
    </div>
  );
}

/**
 * Our Staff → View: one staff member's details in the app's card style —
 * profile header, work & personal info, identity, uploaded documents (opened
 * in an in-app viewer, never a new browser tab) and registered devices.
 */
export function StaffDetailDialog({ staff, onClose, isAdmin, downloading, onDownloadPdf, onResetDevice }: Props) {
  const [viewing, setViewing] = useState<Doc | null>(null);
  const [showAadhaar, setShowAadhaar] = useState(false);

  useEffect(() => { setViewing(null); setShowAadhaar(false); }, [staff?.id]);

  useEffect(() => {
    if (!staff) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape" && !viewing) onClose(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [staff, viewing, onClose]);

  if (!staff) return null;
  const m = staff;
  const photo = m.photoUrl ? fileUrl("staff", m.id, "photo") : null;
  const aadhaarIsPdf = (m.aadharFileName ?? "").toLowerCase().endsWith(".pdf");
  const docs: Doc[] = [
    ...(m.photoUrl ? [{ key: "photo", label: "Photo", field: "photo", kind: "image" as const, filename: `${m.staffId}-photo` }] : []),
    ...(m.identityImageUrl ? [{ key: "identity", label: "Identity Image", field: "identity", kind: "image" as const, filename: `${m.staffId}-identity` }] : []),
    ...(m.aadharFileName ? [{ key: "aadhar", label: "Aadhaar", field: "aadhar", kind: aadhaarIsPdf ? "pdf" as const : "image" as const, filename: m.aadharFileName }] : []),
  ];
  const aadhaar = (m.aadharNumber ?? "").replace(/\s+/g, "");
  const maskedAadhaar = aadhaar.length >= 4 ? `XXXX XXXX ${aadhaar.slice(-4)}` : aadhaar;
  const prettyAadhaar = aadhaar.replace(/(\d{4})(?=\d)/g, "$1 ");
  const devices = m.devices ?? [];
  const since = tenure(m.dateOfJoining);

  return (
    <>
      <div
        className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50 p-4 backdrop-blur-[2px]"
        onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      >
        <div className="flex max-h-[92vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl bg-gray-50 shadow-2xl">
          {/* Profile header */}
          <div className="relative shrink-0 bg-gradient-to-br from-[#1b2b5e] via-[#22356f] to-[#2d4590] px-6 pb-5 pt-6 text-white">
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="absolute right-4 top-4 flex h-8 w-8 items-center justify-center rounded-full bg-white/15 text-white transition hover:bg-white/25"
            >
              <X className="h-4 w-4" />
            </button>
            <div className="flex items-center gap-4">
              {photo ? (
                <button
                  type="button"
                  onClick={() => setViewing(docs.find((d) => d.key === "photo") ?? null)}
                  title="View photo"
                  className="group relative shrink-0 cursor-zoom-in rounded-full"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={photo} alt={m.name} className="h-20 w-20 rounded-full border-4 border-white/90 object-cover shadow-lg transition group-hover:brightness-90" />
                  <span className="pointer-events-none absolute inset-1 flex items-center justify-center rounded-full bg-black/0 opacity-0 transition group-hover:bg-black/25 group-hover:opacity-100">
                    <ZoomIn className="h-5 w-5" />
                  </span>
                </button>
              ) : (
                <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-full border-4 border-white/90 bg-gradient-to-br from-blue-500 to-indigo-600 text-2xl font-bold shadow-lg">
                  {initialsOf(m.name)}
                </div>
              )}
              <div className="min-w-0 flex-1 pr-8">
                <h2 className="truncate text-xl font-bold">{m.name || "—"}</h2>
                <p className="mt-0.5 truncate text-sm text-blue-100">{m.designation || "—"}</p>
                <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
                  <span className="rounded-full bg-white/15 px-2.5 py-0.5 font-mono font-semibold">{m.staffId}</span>
                  {m.softwareDesignation && (
                    <span className="flex items-center gap-1 rounded-full bg-amber-400/90 px-2.5 py-0.5 font-semibold text-[#1b2b5e]">
                      <BadgeCheck className="h-3 w-3" /> {m.softwareDesignation}
                    </span>
                  )}
                  {m.department && (
                    <span className="flex items-center gap-1 text-blue-100"><Building2 className="h-3 w-3" /> {m.department}</span>
                  )}
                </div>
              </div>
            </div>
            {/* Quick contact */}
            <div className="mt-4 flex flex-wrap gap-2">
              {m.contactNumber && (
                <a href={`tel:${m.contactNumber}`} className="flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1.5 text-xs font-medium transition hover:bg-white/20">
                  <Phone className="h-3.5 w-3.5" /> {m.contactNumber}
                </a>
              )}
              {m.email && (
                <a href={`mailto:${m.email}`} className="flex min-w-0 items-center gap-1.5 rounded-full bg-white/10 px-3 py-1.5 text-xs font-medium transition hover:bg-white/20">
                  <Mail className="h-3.5 w-3.5 shrink-0" /> <span className="truncate">{m.email}</span>
                </a>
              )}
            </div>
          </div>

          {/* Body */}
          <div className="flex-1 overflow-y-auto p-5">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <SectionCard title="Work" icon={<Briefcase className="h-3.5 w-3.5" />}>
                <div className="divide-y divide-gray-50">
                  <InfoRow icon={<Building2 className="h-3.5 w-3.5" />} label="Department">{m.department || "—"}</InfoRow>
                  <InfoRow icon={<Briefcase className="h-3.5 w-3.5" />} label="Designation">{m.designation || "—"}</InfoRow>
                  <InfoRow icon={<BadgeCheck className="h-3.5 w-3.5" />} label="Software Designation">{m.softwareDesignation || "—"}</InfoRow>
                  <InfoRow icon={<CalendarDays className="h-3.5 w-3.5" />} label="Date of Joining">
                    {fmtD(m.dateOfJoining)}
                    {since && <span className="ml-2 rounded-full bg-blue-50 px-2 py-0.5 text-[11px] font-semibold text-blue-700">{since}</span>}
                  </InfoRow>
                </div>
              </SectionCard>

              <SectionCard title="Personal" icon={<IdCard className="h-3.5 w-3.5" />}>
                <div className="divide-y divide-gray-50">
                  <InfoRow icon={<Cake className="h-3.5 w-3.5" />} label="Date of Birth">{fmtD(m.dateOfBirth)}</InfoRow>
                  <InfoRow icon={<Phone className="h-3.5 w-3.5" />} label="Contact Number">{m.contactNumber || "—"}</InfoRow>
                  <InfoRow icon={<Mail className="h-3.5 w-3.5" />} label="Email">{m.email || "—"}</InfoRow>
                  <InfoRow icon={<MapPin className="h-3.5 w-3.5" />} label="Address">{m.address || "—"}</InfoRow>
                </div>
              </SectionCard>

              <SectionCard title="Identity" icon={<IdCard className="h-3.5 w-3.5" />}>
                <InfoRow icon={<IdCard className="h-3.5 w-3.5" />} label="Aadhaar Number">
                  {aadhaar ? (
                    <span className="flex items-center gap-2">
                      <span className="font-mono tracking-wide">{showAadhaar ? prettyAadhaar : maskedAadhaar}</span>
                      <button
                        type="button"
                        onClick={() => setShowAadhaar((v) => !v)}
                        title={showAadhaar ? "Hide" : "Show full number"}
                        className="rounded-md p-1 text-gray-400 transition hover:bg-gray-100 hover:text-gray-600"
                      >
                        {showAadhaar ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                      </button>
                    </span>
                  ) : "—"}
                </InfoRow>
              </SectionCard>

              <SectionCard title="Registered Devices" icon={<Smartphone className="h-3.5 w-3.5" />}>
                {devices.length === 0 ? (
                  <p className="rounded-xl border border-dashed border-gray-200 bg-gray-50 px-3 py-3 text-center text-xs text-gray-400">
                    No devices bound. The next login will bind a device.
                  </p>
                ) : (
                  <div className="flex flex-col gap-2">
                    {devices.map((d) => (
                      <div key={d.id} className="flex items-center justify-between gap-3 rounded-xl border border-gray-100 bg-gray-50/60 px-3 py-2.5">
                        <div className="flex min-w-0 items-center gap-2.5">
                          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
                            {d.kind === "mobile" ? <Smartphone className="h-4 w-4" /> : <Laptop className="h-4 w-4" />}
                          </span>
                          <div className="min-w-0">
                            <p className="truncate text-sm font-medium text-gray-800">{d.label || "Device"}</p>
                            <p className="text-xs text-gray-400">{d.boundAt ? `Bound ${fmtDateTime(d.boundAt)}` : "Bound earlier"}</p>
                          </div>
                        </div>
                        {isAdmin && (
                          <button
                            type="button"
                            onClick={() => onResetDevice(m.id, d.id, d.label || "this device")}
                            className="shrink-0 rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-1.5 text-xs font-medium text-amber-700 transition hover:bg-amber-100"
                          >
                            Reset
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </SectionCard>
            </div>

            {/* Documents — previews open in the in-app viewer */}
            <div className="mt-4">
              <SectionCard title="Uploaded Documents" icon={<FileText className="h-3.5 w-3.5" />}>
                {docs.length === 0 ? (
                  <p className="rounded-xl border border-dashed border-gray-200 bg-gray-50 px-3 py-3 text-center text-xs text-gray-400">No documents uploaded.</p>
                ) : (
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                    {docs.map((d) => (
                      <button
                        key={d.key}
                        type="button"
                        onClick={() => setViewing(d)}
                        className="group flex flex-col overflow-hidden rounded-xl border border-gray-200 bg-white text-left shadow-sm transition hover:-translate-y-0.5 hover:border-blue-300 hover:shadow-md"
                      >
                        <div className="relative flex h-28 items-center justify-center overflow-hidden bg-gray-100">
                          {d.kind === "image" ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={fileUrl("staff", m.id, d.field)} alt={d.label} className="h-full w-full object-cover transition group-hover:scale-105" />
                          ) : (
                            <FileText className="h-10 w-10 text-red-400" />
                          )}
                          <span className="absolute inset-0 flex items-center justify-center bg-black/0 text-white opacity-0 transition group-hover:bg-black/30 group-hover:opacity-100">
                            <ZoomIn className="h-6 w-6" />
                          </span>
                        </div>
                        <div className="flex items-center gap-2 px-3 py-2">
                          {d.kind === "image" ? <ImageIcon className="h-3.5 w-3.5 text-blue-500" /> : <FileText className="h-3.5 w-3.5 text-red-500" />}
                          <span className="truncate text-xs font-semibold text-gray-700">{d.label}</span>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </SectionCard>
            </div>
          </div>

          {/* Footer */}
          <div className="flex shrink-0 items-center justify-end gap-3 border-t border-gray-200 bg-white px-5 py-3">
            <button
              type="button"
              onClick={onClose}
              className="rounded-full border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 transition hover:bg-gray-50"
            >
              Close
            </button>
            <button
              type="button"
              onClick={() => onDownloadPdf(m)}
              disabled={downloading}
              className={cn(
                "flex items-center gap-2 rounded-full bg-[#1b2b5e] px-5 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-[#22356f]",
                "disabled:cursor-not-allowed disabled:opacity-60",
              )}
            >
              {downloading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
              {downloading ? "Generating…" : "Download PDF"}
            </button>
          </div>
        </div>
      </div>

      {viewing && (
        <FileViewer
          open
          onClose={() => setViewing(null)}
          url={fileUrl("staff", m.id, viewing.field)}
          title={`${m.name} — ${viewing.label}`}
          kind={viewing.kind}
          filename={viewing.filename}
        />
      )}
    </>
  );
}
