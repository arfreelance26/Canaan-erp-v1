"use client";

import { useEffect, useState, type ReactNode } from "react";
import { RiVerifiedBadgeLine as BadgeCheck, RiBriefcaseLine as Briefcase, RiBuilding2Line as Building2, RiCalendar2Line as CalendarDays, RiCake2Line as Cake, RiDownloadLine as Download, RiEyeLine as Eye, RiEyeOffLine as EyeOff, RiFileTextLine as FileText, RiProfileLine as IdCard, RiImageLine as ImageIcon, RiMacbookLine as Laptop, RiLoader4Line as Loader2, RiLockLine as Lock, RiLockUnlockLine as LockOpen, RiMailLine as Mail, RiMapPin2Line as MapPin, RiPhoneLine as Phone, RiSmartphoneLine as Smartphone, RiCloseLine as X, RiZoomInLine as ZoomIn } from "@remixicon/react";
import { fileUrl, staffApi, type StaffFreezeEventRow } from "@/lib/api";
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
  /** Freeze / Unfreeze Account (Admin) — opens the owner-password dialog. */
  onFreeze?: (s: Staff) => void;
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
    <section className="rounded-2xl border border-separator-border bg-background-primary-default p-4 shadow-sm">
      <p className="mb-3 flex items-center gap-2 text-caption-2-semibold text-text-secondary">
        <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-accent-surface text-accent-text">{icon}</span>
        {title}
      </p>
      {children}
    </section>
  );
}

function InfoRow({ icon, label, children }: { icon: ReactNode; label: string; children: ReactNode }) {
  return (
    <div className="flex items-start gap-3 py-2">
      <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-fill-1 text-text-tertiary">{icon}</span>
      <div className="min-w-0 flex-1">
        <p className="text-caption-2-medium text-text-tertiary">{label}</p>
        <div className="text-body-medium text-text-primary break-words">{children}</div>
      </div>
    </div>
  );
}

/**
 * Our Staff → View: one staff member's details in the app's card style —
 * profile header, work & personal info, identity, uploaded documents (opened
 * in an in-app viewer, never a new browser tab) and registered devices.
 */
export function StaffDetailDialog({ staff, onClose, isAdmin, downloading, onDownloadPdf, onResetDevice, onFreeze }: Props) {
  const [viewing, setViewing] = useState<Doc | null>(null);
  const [showAadhaar, setShowAadhaar] = useState(false);
  // This staff member's Freeze History (Admin) — reloaded when it's frozen/unfrozen.
  const [freezeEvents, setFreezeEvents] = useState<StaffFreezeEventRow[] | null>(null);

  useEffect(() => { setViewing(null); setShowAadhaar(false); }, [staff?.id]);

  useEffect(() => {
    if (!staff || !isAdmin) { setFreezeEvents(null); return; }
    let stale = false;
    staffApi.listFreezeEvents(staff.id)
      .then((rows) => { if (!stale) setFreezeEvents(rows); })
      .catch(() => { if (!stale) setFreezeEvents([]); });
    return () => { stale = true; };
  }, [staff?.id, staff?.frozenAt, isAdmin]); // eslint-disable-line react-hooks/exhaustive-deps

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
        className="fixed inset-0 z-[9999] flex items-center justify-center bg-scrim/50 p-4"
        onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      >
        <div className="flex max-h-[92vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl bg-fill-1 shadow-2xl">
          {/* Profile header */}
          <div className="relative shrink-0 bg-accent-solid px-6 pb-5 pt-6 text-on-solid">
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="absolute right-4 top-4 flex h-8 w-8 items-center justify-center rounded-full bg-on-solid/15 text-on-solid transition hover:bg-on-solid/25"
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
                  <img src={photo} alt={m.name} className="h-20 w-20 rounded-full border-4 border-background-primary-default object-cover shadow-lg transition group-hover:brightness-90" />
                  <span className="pointer-events-none absolute inset-1 flex items-center justify-center rounded-full bg-scrim/0 opacity-0 transition group-hover:bg-scrim/25 group-hover:opacity-100">
                    <ZoomIn className="h-5 w-5" />
                  </span>
                </button>
              ) : (
                <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-full border-4 border-background-primary-default bg-accent-solid text-title-1-semibold shadow-lg">
                  {initialsOf(m.name)}
                </div>
              )}
              <div className="min-w-0 flex-1 pr-8">
                <h2 className="truncate text-title-2-semibold">{m.name || "—"}</h2>
                <p className="mt-0.5 truncate text-sm text-on-solid/80">{m.designation || "—"}</p>
                <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
                  <span className="rounded-full bg-on-solid/15 px-2.5 py-0.5 font-mono font-semibold">{m.staffId}</span>
                  {m.softwareDesignation && (
                    <span className="flex items-center gap-1 rounded-full bg-warning-solid/90 px-2.5 py-0.5 font-semibold text-accent-text-strong">
                      <BadgeCheck className="h-3 w-3" /> {m.softwareDesignation}
                    </span>
                  )}
                  {m.department && (
                    <span className="flex items-center gap-1 text-on-solid/80"><Building2 className="h-3 w-3" /> {m.department}</span>
                  )}
                </div>
              </div>
            </div>
            {/* Quick contact */}
            <div className="mt-4 flex flex-wrap gap-2">
              {m.contactNumber && (
                <a href={`tel:${m.contactNumber}`} className="flex items-center gap-1.5 rounded-full bg-on-solid/10 px-3 py-1.5 text-caption-1-medium transition hover:bg-on-solid/20">
                  <Phone className="h-3.5 w-3.5" /> {m.contactNumber}
                </a>
              )}
              {m.email && (
                <a href={`mailto:${m.email}`} className="flex min-w-0 items-center gap-1.5 rounded-full bg-on-solid/10 px-3 py-1.5 text-caption-1-medium transition hover:bg-on-solid/20">
                  <Mail className="h-3.5 w-3.5 shrink-0" /> <span className="truncate">{m.email}</span>
                </a>
              )}
            </div>
          </div>

          {/* Body */}
          <div className="flex-1 overflow-y-auto p-5">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <SectionCard title="Work" icon={<Briefcase className="h-3.5 w-3.5" />}>
                <div className="divide-y divide-separator-border">
                  <InfoRow icon={<Building2 className="h-3.5 w-3.5" />} label="Department">{m.department || "—"}</InfoRow>
                  <InfoRow icon={<Briefcase className="h-3.5 w-3.5" />} label="Designation">{m.designation || "—"}</InfoRow>
                  <InfoRow icon={<BadgeCheck className="h-3.5 w-3.5" />} label="Software Designation">{m.softwareDesignation || "—"}</InfoRow>
                  <InfoRow icon={<CalendarDays className="h-3.5 w-3.5" />} label="Date of Joining">
                    {fmtD(m.dateOfJoining)}
                    {since && <span className="ml-2 rounded-full bg-accent-surface px-2 py-0.5 text-caption-2-semibold text-accent-text">{since}</span>}
                  </InfoRow>
                </div>
              </SectionCard>

              <SectionCard title="Personal" icon={<IdCard className="h-3.5 w-3.5" />}>
                <div className="divide-y divide-separator-border">
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
                      <span className="font-mono">{showAadhaar ? prettyAadhaar : maskedAadhaar}</span>
                      <button
                        type="button"
                        onClick={() => setShowAadhaar((v) => !v)}
                        title={showAadhaar ? "Hide" : "Show full number"}
                        className="rounded-md p-1 text-text-tertiary transition hover:bg-fill-3 hover:text-text-secondary"
                      >
                        {showAadhaar ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                      </button>
                    </span>
                  ) : "—"}
                </InfoRow>
              </SectionCard>

              <SectionCard title="Registered Devices" icon={<Smartphone className="h-3.5 w-3.5" />}>
                {devices.length === 0 ? (
                  <p className="rounded-xl border border-dashed border-separator-border bg-fill-1 px-3 py-3 text-center text-xs text-text-tertiary">
                    No devices bound. The next login will bind a device.
                  </p>
                ) : (
                  <div className="flex flex-col gap-2">
                    {devices.map((d) => (
                      <div key={d.id} className="flex items-center justify-between gap-3 rounded-xl border border-separator-border bg-fill-1 px-3 py-2.5">
                        <div className="flex min-w-0 items-center gap-2.5">
                          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-accent-surface text-accent-text">
                            {d.kind === "mobile" ? <Smartphone className="h-4 w-4" /> : <Laptop className="h-4 w-4" />}
                          </span>
                          <div className="min-w-0">
                            <p className="truncate text-body-medium text-text-primary">{d.label || "Device"}</p>
                            <p className="text-xs text-text-tertiary">{d.boundAt ? `Bound ${fmtDateTime(d.boundAt)}` : "Bound earlier"}</p>
                          </div>
                        </div>
                        {isAdmin && (
                          <button
                            type="button"
                            onClick={() => onResetDevice(m.id, d.id, d.label || "this device")}
                            className="shrink-0 rounded-lg border border-warning-border bg-warning-surface px-2.5 py-1.5 text-caption-1-medium text-warning-text transition hover:bg-warning-surface-strong"
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

            {/* Account access — Freeze / Unfreeze and this staff member's Freeze History */}
            {isAdmin && (
              <div className="mt-4">
                <SectionCard title="Account Access & Freeze History" icon={<Lock className="h-3.5 w-3.5" />}>
                  <div className={cn(
                    "flex flex-wrap items-center justify-between gap-3 rounded-xl border px-3 py-2.5",
                    m.frozenAt ? "border-danger-border bg-danger-surface" : "border-success-border bg-success-surface/60",
                  )}>
                    <div className="min-w-0 text-sm">
                      {m.frozenAt ? (
                        <>
                          <p className="flex items-center gap-1.5 font-semibold text-danger-text"><Lock className="h-4 w-4" /> Frozen — can&apos;t log in</p>
                          <p className="mt-0.5 text-xs text-danger-text">
                            By {m.frozenByName ?? "—"} on {fmtDateTime(m.frozenAt)}{m.frozenReason ? ` · ${m.frozenReason}` : ""}
                          </p>
                        </>
                      ) : (
                        <p className="flex items-center gap-1.5 font-semibold text-success-text"><LockOpen className="h-4 w-4" /> Active — can log in</p>
                      )}
                    </div>
                    {onFreeze && (
                      <button
                        type="button"
                        onClick={() => onFreeze(m)}
                        className={cn(
                          "flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-1.5 text-caption-1-semibold text-on-solid transition",
                          m.frozenAt ? "bg-success-solid hover:bg-success-solid-hover" : "bg-danger-solid hover:bg-danger-solid-hover",
                        )}
                      >
                        {m.frozenAt ? <LockOpen className="h-3.5 w-3.5" /> : <Lock className="h-3.5 w-3.5" />}
                        {m.frozenAt ? "Unfreeze Account" : "Freeze Account"}
                      </button>
                    )}
                  </div>
                  <div className="mt-3">
                    {freezeEvents === null ? (
                      <p className="py-2 text-center text-xs text-text-tertiary">Loading history…</p>
                    ) : freezeEvents.length === 0 ? (
                      <p className="rounded-xl border border-dashed border-separator-border bg-fill-1 px-3 py-3 text-center text-xs text-text-tertiary">
                        This account has never been frozen.
                      </p>
                    ) : (
                      <ol className="flex flex-col gap-2">
                        {freezeEvents.map((ev) => (
                          <li key={ev.id} className="flex items-start gap-2.5 rounded-xl border border-separator-border bg-fill-1 px-3 py-2">
                            <span className={cn(
                              "mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-lg",
                              ev.event === "Frozen" ? "bg-danger-surface-strong text-danger-text" : "bg-success-surface-strong text-success-text",
                            )}>
                              {ev.event === "Frozen" ? <Lock className="h-3.5 w-3.5" /> : <LockOpen className="h-3.5 w-3.5" />}
                            </span>
                            <div className="min-w-0 flex-1 text-sm">
                              <p className="font-semibold text-text-primary">
                                {ev.event} <span className="font-normal text-text-secondary">by {ev.actorName}{ev.actorRole ? ` (${ev.actorRole})` : ""}</span>
                              </p>
                              <p className="whitespace-pre-wrap break-words text-text-primary">{ev.reason}</p>
                              <p className="text-xs text-text-tertiary">{fmtDateTime(ev.createdAt)}</p>
                            </div>
                          </li>
                        ))}
                      </ol>
                    )}
                  </div>
                </SectionCard>
              </div>
            )}

            {/* Documents — previews open in the in-app viewer */}
            <div className="mt-4">
              <SectionCard title="Uploaded Documents" icon={<FileText className="h-3.5 w-3.5" />}>
                {docs.length === 0 ? (
                  <p className="rounded-xl border border-dashed border-separator-border bg-fill-1 px-3 py-3 text-center text-xs text-text-tertiary">No documents uploaded.</p>
                ) : (
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                    {docs.map((d) => (
                      <button
                        key={d.key}
                        type="button"
                        onClick={() => setViewing(d)}
                        className="group flex flex-col overflow-hidden rounded-xl border border-separator-border bg-background-primary-default text-left shadow-sm transition hover:border-accent-border-strong hover:shadow-md"
                      >
                        <div className="relative flex h-28 items-center justify-center overflow-hidden bg-fill-2">
                          {d.kind === "image" ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={fileUrl("staff", m.id, d.field)} alt={d.label} className="h-full w-full object-cover transition" />
                          ) : (
                            <FileText className="h-10 w-10 text-danger-text" />
                          )}
                          <span className="absolute inset-0 flex items-center justify-center bg-scrim/0 text-on-solid opacity-0 transition group-hover:bg-scrim/30 group-hover:opacity-100">
                            <ZoomIn className="h-6 w-6" />
                          </span>
                        </div>
                        <div className="flex items-center gap-2 px-3 py-2">
                          {d.kind === "image" ? <ImageIcon className="h-3.5 w-3.5 text-accent-text" /> : <FileText className="h-3.5 w-3.5 text-danger-text" />}
                          <span className="truncate text-caption-1-semibold text-text-primary">{d.label}</span>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </SectionCard>
            </div>
          </div>

          {/* Footer */}
          <div className="flex shrink-0 items-center justify-end gap-3 border-t border-separator-border bg-background-primary-default px-5 py-3">
            <button
              type="button"
              onClick={onClose}
              className="rounded-full border border-border-button-default bg-background-primary-default px-4 py-2 text-body-medium text-text-primary transition hover:bg-fill-2"
            >
              Close
            </button>
            <button
              type="button"
              onClick={() => onDownloadPdf(m)}
              disabled={downloading}
              className={cn(
                "flex items-center gap-2 rounded-full bg-accent-solid px-5 py-2 text-body-medium text-on-solid shadow-sm transition hover:bg-accent-solid",
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
