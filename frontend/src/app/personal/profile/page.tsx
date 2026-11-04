"use client";

import { useEffect, useRef, useState, type ComponentType, type ReactNode } from "react";
import {
  RiBriefcaseLine,
  RiBuilding2Line,
  RiCake2Line,
  RiCalendar2Line,
  RiEyeLine,
  RiEyeOffLine,
  RiFileTextLine,
  RiGitBranchLine,
  RiHashtag,
  RiImageLine,
  RiMacbookLine,
  RiMailLine,
  RiMapPin2Line,
  RiPhoneLine,
  RiProfileLine,
  RiShieldUserLine,
  RiSmartphoneLine,
  RiUserLine,
  RiZoomInLine,
} from "@remixicon/react";
import { useAuth } from "@/context/AuthContext";
import { attendanceApi, fileUrl, staffApi, toStaff } from "@/lib/api";
import type { Staff } from "@/types/staff";
import type { StaffSelfSummary } from "@/types/attendance";
import { Avatar } from "@/components/ui/Avatar";
import { EventsButton } from "@/components/layout/EventsButton";
import { NotesButton } from "@/components/layout/NotesButton";
import { TodoButton } from "@/components/layout/TodoButton";
import { PageSkeleton } from "@/components/ui/PageSkeleton";
import { EmptyState } from "@/components/ui/EmptyState";
import { useEnter } from "@/lib/motion";
import { cx } from "@/utils/cx";
import dynamic from "next/dynamic";

// Dialogs load on demand, after the page has drawn (next/dynamic).
const FileViewer = dynamic(() => import("@/components/ui/FileViewer").then((m) => m.FileViewer));

type Icon = ComponentType<{ className?: string }>;
type Doc = { key: string; label: string; field: string; kind: "image" | "pdf"; filename: string };

const fmtDay = (v: string | null | undefined) =>
  v ? new Date(`${v.slice(0, 10)}T00:00:00`).toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" }) : "";

const fmtDateTime = (v: string) => {
  const d = new Date(v.endsWith("Z") || v.includes("+") ? v : `${v}Z`);
  return Number.isNaN(d.getTime())
    ? ""
    : d.toLocaleString("en-IN", { day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit", timeZone: "Asia/Kolkata" });
};

/** "2 yrs 3 mos" since a YYYY-MM-DD date. */
function tenure(from: string | null | undefined): string {
  if (!from) return "";
  const start = new Date(`${from.slice(0, 10)}T00:00:00`);
  const now = new Date();
  let months = (now.getFullYear() - start.getFullYear()) * 12 + (now.getMonth() - start.getMonth());
  if (now.getDate() < start.getDate()) months -= 1;
  if (months < 0) return "";
  const y = Math.floor(months / 12);
  const m = months % 12;
  if (y === 0 && m === 0) return "Joined this month";
  return [y ? `${y} yr${y > 1 ? "s" : ""}` : "", m ? `${m} mo${m > 1 ? "s" : ""}` : ""].filter(Boolean).join(" ");
}

function Section({ title, icon: I, children, className }: { title: string; icon: Icon; children: ReactNode; className?: string }) {
  return (
    <section data-enter className={cx("rounded-3xl border border-separator-border bg-background-primary-default p-5", className)}>
      <h2 className="mb-2 flex items-center gap-2 text-title-3-semibold text-text-primary">
        <I className="size-5 text-foreground-icon-secondary" />
        {title}
      </h2>
      {children}
    </section>
  );
}

function Row({ icon: I, label, children }: { icon: Icon; label: string; children: ReactNode }) {
  return (
    <div className="flex items-start gap-3 py-3">
      <I className="mt-0.5 size-4 shrink-0 text-foreground-icon-tertiary" />
      <div className="min-w-0 flex-1">
        <p className="text-caption-1-regular text-text-tertiary">{label}</p>
        <div className="break-words text-body-medium text-text-primary">{children || <span className="text-text-tertiary">Not added</span>}</div>
      </div>
    </div>
  );
}

/**
 * My profile: everything the office holds about the signed-in person — work,
 * personal and identity details, this month's attendance, the devices their
 * login is bound to and their uploaded documents — plus their personal tools
 * (Meetings, To-do, Notes). Read-only; changes go
 * through Admin (Our Staff → Edit), as before.
 */
export default function ProfilePage() {
  const { user } = useAuth();
  const ref = useRef<HTMLDivElement>(null);
  const [staff, setStaff] = useState<Staff | null>(null);
  const [loading, setLoading] = useState(true);
  const [summary, setSummary] = useState<StaffSelfSummary | null>(null);
  const [showAadhaar, setShowAadhaar] = useState(false);
  const [viewing, setViewing] = useState<Doc | null>(null);
  useEnter(ref, loading ? "loading" : "ready");

  // A login with no linked Staff row (id === null) has no record to fetch.
  useEffect(() => {
    if (!user) return;
    if (user.id === null) {
      setLoading(false);
      return;
    }
    let stale = false;
    setLoading(true);
    staffApi
      .getDetail(String(user.id))
      .then((data) => { if (!stale) setStaff(toStaff(data)); })
      .catch(() => { if (!stale) setStaff(null); })
      .finally(() => { if (!stale) setLoading(false); });
    const now = new Date();
    attendanceApi
      .getStaffSelfSummary(user.id, now.getFullYear(), now.getMonth() + 1)
      .then((s) => { if (!stale) setSummary(s); })
      .catch(() => { if (!stale) setSummary(null); });
    return () => { stale = true; };
  }, [user]);

  if (!user || loading) return <PageSkeleton />;

  const name = staff?.name ?? user.name;
  const role = staff?.softwareDesignation ?? user.softwareDesignation;
  const photo = staff?.photoUrl ? fileUrl("staff", staff.id, "photo") : user.photoUrl;
  const since = tenure(staff?.dateOfJoining);
  const aadhaar = (staff?.aadharNumber ?? "").replace(/\s+/g, "");
  const masked = aadhaar.length >= 4 ? `XXXX XXXX ${aadhaar.slice(-4)}` : aadhaar;
  const pretty = aadhaar.replace(/(\d{4})(?=\d)/g, "$1 ");
  const devices = staff?.devices ?? [];
  const aadhaarIsPdf = (staff?.aadharFileName ?? "").toLowerCase().endsWith(".pdf");
  const docs: Doc[] = staff
    ? [
        ...(staff.photoUrl ? [{ key: "photo", label: "Photo", field: "photo", kind: "image" as const, filename: `${staff.staffId}-photo` }] : []),
        ...(staff.identityImageUrl ? [{ key: "identity", label: "Identity image", field: "identity", kind: "image" as const, filename: `${staff.staffId}-identity` }] : []),
        ...(staff.aadharFileName ? [{ key: "aadhar", label: "Aadhaar", field: "aadhar", kind: aadhaarIsPdf ? ("pdf" as const) : ("image" as const), filename: staff.aadharFileName }] : []),
      ]
    : [];

  const pct = Math.round(summary?.percentage ?? 0);
  const standing = pct >= 75 ? "success" : pct >= 50 ? "warning" : "danger";
  const standingText = { success: "text-success-text", warning: "text-warning-text", danger: "text-danger-text" }[standing];
  const standingLabel = standing === "success" ? "Good standing" : standing === "warning" ? "Needs improvement" : "Below threshold";

  return (
    <div ref={ref} className="flex flex-col gap-6 pb-8">
      {/* Header — one card: who you are on the left, this month's attendance on the right */}
      <section data-enter className="rounded-3xl border border-separator-border bg-background-primary-default p-6 sm:p-8">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex min-w-0 flex-col gap-5 sm:flex-row sm:items-center">
            <Avatar photoUrl={photo} label={name} size={96} className="ring-4 ring-accent-surface" />
            <div className="flex min-w-0 flex-col gap-1.5">
              <h1 className="truncate text-display-3-semibold text-text-primary">{name}</h1>
              <p className="text-headline-regular text-text-secondary">
                {[staff?.designation, role].filter(Boolean).join(" · ")}
              </p>
              <div className="mt-1 flex flex-wrap items-center gap-x-5 gap-y-1.5 text-body-regular text-text-tertiary">
                {(staff?.staffId ?? user.staffId) && (
                  <span className="flex items-center gap-1.5"><RiHashtag className="size-4" />{staff?.staffId ?? user.staffId}</span>
                )}
                {staff?.department && <span className="flex items-center gap-1.5"><RiBuilding2Line className="size-4" />{staff.department}</span>}
                {since && <span className="flex items-center gap-1.5"><RiCalendar2Line className="size-4" />{since} with Canaan</span>}
                {user.id === null && <span className="flex items-center gap-1.5"><RiGitBranchLine className="size-4" />All branches</span>}
              </div>
            </div>
          </div>

          {summary && (
            <div className="flex shrink-0 items-center gap-6 rounded-2xl bg-background-secondary-default px-5 py-4">
              <div className="flex flex-col gap-0.5">
                <span className="text-caption-1-regular text-text-tertiary">Attendance this month</span>
                <span className="text-title-1-semibold tabular-nums text-text-primary">{pct}%</span>
                <span className={cx("text-caption-1-medium", standingText)}>{standingLabel}</span>
              </div>
              <dl className="grid grid-cols-[auto_auto] gap-x-5 gap-y-1 text-body-regular tabular-nums">
                <dt className="text-text-tertiary">Present</dt><dd className="text-end text-text-primary">{summary.present}</dd>
                <dt className="text-text-tertiary">Absent</dt><dd className="text-end text-text-primary">{summary.absent}</dd>
                <dt className="text-text-tertiary">On leave</dt><dd className="text-end text-text-primary">{summary.onLeave}</dd>
                <dt className="text-text-tertiary">Not marked</dt><dd className="text-end text-text-primary">{summary.notMarked}</dd>
              </dl>
            </div>
          )}
        </div>
      </section>

      {/* Your workspace — the personal tools that used to sit in the Topbar */}
      <section data-enter className="flex flex-col gap-3">
        <h2 data-tour="workspace" className="text-title-3-semibold text-text-primary">Your workspace</h2>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <EventsButton variant="tile" />
          <TodoButton variant="tile" />
          <NotesButton variant="tile" />
        </div>
      </section>

      {!staff ? (
        <section data-enter className="rounded-3xl border border-separator-border bg-background-primary-default">
          <EmptyState
            illustration="security"
            title={user.id === null ? "System administrator" : "Profile details are unavailable"}
            description={
              user.id === null
                ? `Signed in as ${user.email || user.name}. This login isn't linked to a staff record, so there are no personal details to show.`
                : "Your staff record couldn't be loaded. Try again in a moment."
            }
          />
        </section>
      ) : (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <Section title="Work" icon={RiBriefcaseLine}>
            <div className="divide-y divide-separator-border">
              <Row icon={RiBuilding2Line} label="Department">{staff.department}</Row>
              <Row icon={RiBriefcaseLine} label="Designation">{staff.designation}</Row>
              <Row icon={RiShieldUserLine} label="Software role">{staff.softwareDesignation}</Row>
              <Row icon={RiCalendar2Line} label="Date of joining">
                {staff.dateOfJoining && `${fmtDay(staff.dateOfJoining)}${since ? ` · ${since}` : ""}`}
              </Row>
              <Row icon={RiUserLine} label="Username">{staff.username}</Row>
            </div>
          </Section>

          <Section title="Personal" icon={RiProfileLine}>
            <div className="divide-y divide-separator-border">
              <Row icon={RiCake2Line} label="Date of birth">{fmtDay(staff.dateOfBirth)}</Row>
              <Row icon={RiPhoneLine} label="Contact number">{staff.contactNumber}</Row>
              <Row icon={RiMailLine} label="Email">{staff.email}</Row>
              <Row icon={RiMapPin2Line} label="Address">{staff.address}</Row>
            </div>
          </Section>

          <Section title="Identity" icon={RiShieldUserLine}>
            <Row icon={RiProfileLine} label="Aadhaar number">
              {aadhaar && (
                <span className="flex items-center gap-2">
                  <span className="font-mono tabular-nums">{showAadhaar ? pretty : masked}</span>
                  <button
                    type="button"
                    onClick={() => setShowAadhaar((v) => !v)}
                    aria-label={showAadhaar ? "Hide Aadhaar number" : "Show full Aadhaar number"}
                    className="rounded-md p-1 text-foreground-icon-tertiary outline-none transition-colors hover:bg-fill-2 hover:text-foreground-icon-primary focus-visible:ring-2 focus-visible:ring-border-focus-ring"
                  >
                    {showAadhaar ? <RiEyeOffLine className="size-4" /> : <RiEyeLine className="size-4" />}
                  </button>
                </span>
              )}
            </Row>
          </Section>

          <Section title="Signed-in devices" icon={RiSmartphoneLine}>
            {devices.length === 0 ? (
              <p className="py-3 text-body-regular text-text-tertiary">No device is bound yet. Your next login binds this device.</p>
            ) : (
              <div className="divide-y divide-separator-border">
                {devices.map((d) => {
                  const DIcon = d.kind === "mobile" ? RiSmartphoneLine : RiMacbookLine;
                  return (
                    <div key={d.id} className="flex items-center gap-3 py-3">
                      <DIcon className="size-4 shrink-0 text-foreground-icon-tertiary" />
                      <div className="min-w-0">
                        <p className="truncate text-body-medium text-text-primary">{d.label || "Device"}</p>
                        <p className="text-caption-1-regular text-text-tertiary">{d.boundAt ? `Bound ${fmtDateTime(d.boundAt)}` : "Bound earlier"}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
            <p className="mt-2 text-caption-1-regular text-text-tertiary">Ask an Admin to reset a device you no longer use.</p>
          </Section>

          <Section title="Documents" icon={RiFileTextLine} className="lg:col-span-2">
            {docs.length === 0 ? (
              <p className="py-3 text-body-regular text-text-tertiary">No documents uploaded.</p>
            ) : (
              <div className="grid grid-cols-2 gap-4 pt-2 sm:grid-cols-3 lg:grid-cols-4">
                {docs.map((d) => (
                  <button
                    key={d.key}
                    type="button"
                    onClick={() => setViewing(d)}
                    className="group flex flex-col overflow-hidden rounded-2xl border border-separator-border bg-background-primary-default text-start outline-none transition-colors hover:border-accent-border-strong focus-visible:ring-2 focus-visible:ring-border-focus-ring"
                  >
                    <div className="relative flex h-32 items-center justify-center overflow-hidden bg-fill-2">
                      {d.kind === "image" ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={fileUrl("staff", staff.id, d.field)} alt={d.label} className="h-full w-full object-cover" />
                      ) : (
                        <RiFileTextLine className="size-10 text-foreground-icon-tertiary" />
                      )}
                      <span className="absolute inset-0 flex items-center justify-center bg-scrim/0 text-on-solid opacity-0 transition-colors group-hover:bg-scrim/30 group-hover:opacity-100">
                        <RiZoomInLine className="size-6" />
                      </span>
                    </div>
                    <div className="flex items-center gap-2 px-3 py-2.5">
                      {d.kind === "image" ? <RiImageLine className="size-4 text-foreground-icon-tertiary" /> : <RiFileTextLine className="size-4 text-foreground-icon-tertiary" />}
                      <span className="truncate text-body-medium text-text-primary">{d.label}</span>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </Section>
        </div>
      )}

      {viewing && staff && (
        <FileViewer
          open
          onClose={() => setViewing(null)}
          url={fileUrl("staff", staff.id, viewing.field)}
          title={`${name} — ${viewing.label}`}
          kind={viewing.kind}
          filename={viewing.filename}
        />
      )}
    </div>
  );
}
